import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, RedisService } from '@common/index';
import {
  ClusterStatus,
  Prisma,
  TransportRequestStatus,
  TransportRequestType,
  TripStatus,
} from '@prisma/client';

// ── DBSCAN parameters (env-tunable) ────────────────────────────────────────────
const EPS_KM = Number(process.env.CLUSTER_EPS_KM ?? 15); // pickup radius
const MIN_PTS = Number(process.env.CLUSTER_MIN_PASSENGERS ?? 3); // min requests to form a cluster
const WINDOW_HOURS = Number(process.env.CLUSTER_DEPARTURE_WINDOW_HOURS ?? 4);
const LOOKAHEAD_HOURS = Number(process.env.CLUSTER_LOOKAHEAD_HOURS ?? 48);
const CLUSTER_TTL_HOURS = Number(process.env.CLUSTER_TTL_HOURS ?? 4);

type Point = {
  requestId: string;
  lat: number;
  lng: number;
  toLabel: string;
  requestedFor: Date;
  seats: number;
  budgetPaise: number | null;
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Passenger clustering (the GROWTH-plan feature). Groups open SEAT requests
 * with nearby pickups, the same destination, and overlapping departure
 * windows into bookable ClusterGroups that drivers can accept as one trip.
 */
@Injectable()
export class ClusterService {
  private readonly logger = new Logger(ClusterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Clustering run (invoked by scheduler + admin trigger) ──────────────────

  async runClustering() {
    await this.expireStaleClusters();

    const now = new Date();
    const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 3_600_000);

    // Open seat requests not already in an active cluster
    const openRequests = await this.prisma.transportRequest.findMany({
      where: {
        type: TransportRequestType.SEAT,
        status: TransportRequestStatus.REQUESTED,
        requestedFor: { gte: now, lte: horizon },
        clusterLinks: { none: { cluster: { status: { in: [ClusterStatus.OPEN, ClusterStatus.ASSIGNED] } } } },
      },
    });

    const points: Point[] = openRequests.flatMap((request) => {
      const pickup = request.pickupJson as { lat?: number; lng?: number } | null;
      if (!pickup || typeof pickup.lat !== 'number' || typeof pickup.lng !== 'number') return [];
      return [
        {
          requestId: request.id,
          lat: pickup.lat,
          lng: pickup.lng,
          toLabel: request.toLabel.trim().toLowerCase(),
          requestedFor: request.requestedFor,
          seats: Math.max(1, request.seats),
          budgetPaise: request.budgetPaise,
        },
      ];
    });

    // Partition by destination + departure window bucket, then DBSCAN each partition
    const partitions = new Map<string, Point[]>();
    for (const point of points) {
      const bucket = Math.floor(point.requestedFor.getTime() / (WINDOW_HOURS * 3_600_000));
      const key = `${point.toLabel}::${bucket}`;
      partitions.set(key, [...(partitions.get(key) ?? []), point]);
    }

    let created = 0;
    for (const [, partition] of partitions) {
      for (const clusterPoints of this.dbscan(partition)) {
        await this.persistCluster(clusterPoints);
        created += 1;
      }
    }
    if (created > 0) {
      this.logger.log(`Clustering run created ${created} cluster(s) from ${points.length} open request(s)`);
      await this.redis
        .getClient()
        .publish('pahadi:events', JSON.stringify({ event: 'clusters.updated', created }));
    }
    return { created, openRequests: points.length };
  }

  /** Plain DBSCAN on pickup coordinates. Returns clusters of ≥ MIN_PTS points. */
  private dbscan(points: Point[]): Point[][] {
    const visited = new Set<number>();
    const assigned = new Set<number>();
    const clusters: Point[][] = [];

    const neighborsOf = (index: number) =>
      points
        .map((_, otherIndex) => otherIndex)
        .filter((otherIndex) => otherIndex !== index && haversineKm(points[index], points[otherIndex]) <= EPS_KM);

    for (let i = 0; i < points.length; i++) {
      if (visited.has(i)) continue;
      visited.add(i);
      const neighbors = neighborsOf(i);
      if (neighbors.length + 1 < MIN_PTS) continue; // noise (may still join a later cluster)

      const cluster: number[] = [i];
      assigned.add(i);
      const queue = [...neighbors];
      while (queue.length > 0) {
        const j = queue.shift()!;
        if (!visited.has(j)) {
          visited.add(j);
          const jNeighbors = neighborsOf(j);
          if (jNeighbors.length + 1 >= MIN_PTS) {
            queue.push(...jNeighbors.filter((n) => !visited.has(n)));
          }
        }
        if (!assigned.has(j)) {
          assigned.add(j);
          cluster.push(j);
        }
      }
      clusters.push(cluster.map((index) => points[index]));
    }
    return clusters;
  }

  private async persistCluster(clusterPoints: Point[]) {
    const centroidLat = clusterPoints.reduce((sum, p) => sum + p.lat, 0) / clusterPoints.length;
    const centroidLng = clusterPoints.reduce((sum, p) => sum + p.lng, 0) / clusterPoints.length;
    const radiusKm = Math.max(
      ...clusterPoints.map((p) => haversineKm({ lat: centroidLat, lng: centroidLng }, p)),
    );
    const departures = clusterPoints.map((p) => p.requestedFor.getTime());
    const budgets = clusterPoints.map((p) => p.budgetPaise).filter((b): b is number => typeof b === 'number');
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: clusterPoints[0].requestId },
      select: { toLabel: true, dropoffJson: true },
    });
    const dropoff = (request?.dropoffJson ?? {}) as { lat?: number; lng?: number };

    await this.prisma.clusterGroup.create({
      data: {
        status: ClusterStatus.OPEN,
        centroidLat,
        centroidLng,
        radiusKm: Number(radiusKm.toFixed(1)),
        destinationLabel: request?.toLabel ?? clusterPoints[0].toLabel,
        destinationLat: typeof dropoff.lat === 'number' ? dropoff.lat : null,
        destinationLng: typeof dropoff.lng === 'number' ? dropoff.lng : null,
        departureFrom: new Date(Math.min(...departures)),
        departureTo: new Date(Math.max(...departures)),
        passengerCount: clusterPoints.reduce((sum, p) => sum + p.seats, 0),
        estimatedFareMin: budgets.length > 0 ? Math.min(...budgets) : 0,
        expiresAt: new Date(Date.now() + CLUSTER_TTL_HOURS * 3_600_000),
        requests: {
          create: clusterPoints.map((p) => ({ requestId: p.requestId, status: 'PENDING' })),
        },
      },
    });
  }

  private async expireStaleClusters() {
    const expired = await this.prisma.clusterGroup.updateMany({
      where: { status: ClusterStatus.OPEN, expiresAt: { lt: new Date() } },
      data: { status: ClusterStatus.EXPIRED },
    });
    if (expired.count > 0) {
      this.logger.log(`Expired ${expired.count} stale cluster(s) — requests return to the open pool`);
    }
  }

  // ── Driver-facing ────────────────────────────────────────────────────────────

  async listOpenClusters(lat?: number, lng?: number) {
    const clusters = await this.prisma.clusterGroup.findMany({
      where: { status: ClusterStatus.OPEN, expiresAt: { gt: new Date() } },
      include: { requests: { select: { requestId: true, status: true } } },
      orderBy: { departureFrom: 'asc' },
      take: 50,
    });
    const withDistance = clusters.map((cluster) => ({
      ...this.toView(cluster),
      distanceKm:
        Number.isFinite(lat) && Number.isFinite(lng)
          ? Number(haversineKm({ lat: lat!, lng: lng! }, { lat: cluster.centroidLat, lng: cluster.centroidLng }).toFixed(1))
          : undefined,
    }));
    withDistance.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return { clusters: withDistance };
  }

  /** Driver accepts a cluster → a ScheduledTrip is created at the centroid. */
  async acceptCluster(clusterId: string, driverId: string, vehicleId: string | undefined, routeId: string | undefined) {
    const cluster = await this.prisma.clusterGroup.findUnique({
      where: { id: clusterId },
      include: { requests: { include: { request: true } } },
    });
    if (!cluster) throw new NotFoundException('Cluster not found');
    if (cluster.status !== ClusterStatus.OPEN || cluster.expiresAt.getTime() < Date.now()) {
      throw new ConflictException({ message: 'This cluster is no longer available', error_code: 'cluster_unavailable' });
    }

    // Resolve a route for the trip: explicit routeId, or match by destination label.
    const route = routeId
      ? await this.prisma.route.findUnique({ where: { id: routeId } })
      : await this.prisma.route.findFirst({
          where: { toCity: { equals: cluster.destinationLabel, mode: 'insensitive' }, status: 'ACTIVE' },
        });
    if (!route) {
      throw new BadRequestException({
        message: 'No active route matches this cluster destination — pass routeId explicitly.',
        error_code: 'cluster_route_unresolved',
      });
    }

    const seatsNeeded = cluster.passengerCount;
    const trip = await this.prisma.$transaction(async (tx) => {
      // Atomic claim — first accepting driver wins.
      const claimed = await tx.clusterGroup.updateMany({
        where: { id: clusterId, status: ClusterStatus.OPEN },
        data: { status: ClusterStatus.ASSIGNED, assignedDriverId: driverId },
      });
      if (claimed.count === 0) {
        throw new ConflictException({ message: 'Another driver just accepted this cluster', error_code: 'cluster_already_assigned' });
      }

      const createdTrip = await tx.scheduledTrip.create({
        data: {
          routeId: route.id,
          driverId,
          vehicleId,
          departureAt: cluster.departureFrom,
          frontSeatsTotal: 1,
          backSeatsTotal: Math.max(seatsNeeded, 3),
          departurePoint: `Cluster pickup (${cluster.radiusKm} km around centroid)`,
          notes: `Cluster ${clusterId}: ${seatsNeeded} passenger(s) to ${cluster.destinationLabel}`,
          status: TripStatus.OPEN,
        },
      });
      await tx.clusterGroup.update({
        where: { id: clusterId },
        data: { assignedTripId: createdTrip.id },
      });
      return createdTrip;
    });

    // Passengers now confirm/opt-out; notify via the event bus.
    await this.redis.getClient().publish(
      'pahadi:events',
      JSON.stringify({
        event: 'cluster.assigned',
        clusterId,
        tripId: trip.id,
        driverId,
        passengerIds: cluster.requests.map((r) => r.request.passengerId).filter(Boolean),
      }),
    );

    return { clusterId, tripId: trip.id, status: ClusterStatus.ASSIGNED, passengersToConfirm: cluster.requests.length };
  }

  async rejectCluster(clusterId: string, driverId: string) {
    // Rejection is driver-local: nothing to persist beyond analytics for now.
    return { clusterId, driverId, rejected: true };
  }

  // ── Passenger-facing ────────────────────────────────────────────────────────

  async listPassengerClusters(passengerId: string) {
    const links = await this.prisma.clusterRequest.findMany({
      where: {
        request: { passengerId },
        cluster: { status: { in: [ClusterStatus.OPEN, ClusterStatus.ASSIGNED] } },
      },
      include: { cluster: { include: { requests: { select: { requestId: true, status: true } } } } },
    });
    return {
      clusters: links.map((link) => ({
        ...this.toView(link.cluster),
        myStatus: link.status,
        myRequestId: link.requestId,
      })),
    };
  }

  async confirmClusterParticipation(clusterId: string, passengerId: string, confirm: boolean) {
    const link = await this.prisma.clusterRequest.findFirst({
      where: { clusterId, request: { passengerId } },
      include: { cluster: true, request: true },
    });
    if (!link) throw new NotFoundException('You are not part of this cluster');
    if (link.cluster.status !== ClusterStatus.OPEN && link.cluster.status !== ClusterStatus.ASSIGNED) {
      throw new BadRequestException({ message: 'This cluster is no longer active', error_code: 'cluster_inactive' });
    }

    await this.prisma.clusterRequest.update({
      where: { id: link.id },
      data: { status: confirm ? 'CONFIRMED' : 'DECLINED' },
    });

    if (!confirm) {
      // Opted-out requests return to the individual pool untouched.
      return { clusterId, status: 'DECLINED' };
    }

    // Confirmed + driver assigned → materialize a seat booking on the cluster trip.
    if (link.cluster.status === ClusterStatus.ASSIGNED && link.cluster.assignedTripId) {
      await this.prisma.transportRequest.update({
        where: { id: link.requestId },
        data: { status: TransportRequestStatus.ACCEPTED, bookingId: `cluster-${clusterId}` },
      });
    }
    return { clusterId, status: 'CONFIRMED', tripId: link.cluster.assignedTripId ?? null };
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  async listAllClusters() {
    const clusters = await this.prisma.clusterGroup.findMany({
      orderBy: { createdAt: 'desc' },
      include: { requests: { select: { requestId: true, status: true } } },
      take: 100,
    });
    return { clusters: clusters.map((cluster) => this.toView(cluster)) };
  }

  private toView(
    cluster: Prisma.ClusterGroupGetPayload<{ include: { requests: { select: { requestId: true; status: true } } } }>,
  ) {
    return {
      id: cluster.id,
      status: cluster.status,
      centroidLat: cluster.centroidLat,
      centroidLng: cluster.centroidLng,
      radiusKm: cluster.radiusKm,
      destination: cluster.destinationLabel,
      departureWindowStart: cluster.departureFrom,
      departureWindowEnd: cluster.departureTo,
      passengerCount: cluster.passengerCount,
      estimatedFareMin: cluster.estimatedFareMin,
      assignedDriverId: cluster.assignedDriverId,
      assignedTripId: cluster.assignedTripId,
      expiresAt: cluster.expiresAt,
      requests: cluster.requests,
    };
  }
}
