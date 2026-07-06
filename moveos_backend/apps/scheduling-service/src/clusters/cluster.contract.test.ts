import { strict as assert } from 'assert';
import { ClusterService } from './cluster.service';

// ── Stubs ──────────────────────────────────────────────────────────────────────

function redisStub() {
  const published: string[] = [];
  return {
    getClient: () => ({
      publish: async (_channel: string, message: string) => {
        published.push(message);
        return 1;
      },
    }),
    _published: published,
  } as any;
}

// Departure times must land in the SAME clustering window bucket regardless of
// wall-clock, or the partition splits and the test flakes. Pin everything to
// the start of a future bucket and offset by minutes within it.
const WINDOW_MS = Number(process.env.CLUSTER_DEPARTURE_WINDOW_HOURS ?? 4) * 3_600_000;
const BUCKET_START = (Math.floor((Date.now() + 24 * 3_600_000) / WINDOW_MS) + 1) * WINDOW_MS;

function requestRow(id: string, lat: number, lng: number, toLabel: string, minutesIntoBucket: number, seats = 1) {
  return {
    id,
    pickupJson: { lat, lng },
    dropoffJson: { lat: 30.29, lng: 78.0 },
    toLabel,
    requestedFor: new Date(BUCKET_START + minutesIntoBucket * 60_000),
    seats,
    budgetPaise: 180000,
  };
}

async function main() {
  // ── Clustering: 3 nearby same-destination requests form one cluster ─────────

  {
    const createdClusters: any[] = [];
    const prisma = {
      clusterGroup: {
        updateMany: async () => ({ count: 0 }),
        create: async ({ data }: any) => {
          createdClusters.push(data);
          return { id: 'clust_1', ...data };
        },
      },
      transportRequest: {
        findMany: async () => [
          // Three pickups within ~5 km of each other around Pithoragarh, same destination
          requestRow('req_1', 29.58, 80.21, 'Dehradun', 10),
          requestRow('req_2', 29.6, 80.23, 'Dehradun', 60, 2),
          requestRow('req_3', 29.56, 80.19, 'Dehradun', 35),
          // A far-away pickup (different town) — must NOT join the cluster
          requestRow('req_far', 30.9, 79.1, 'Dehradun', 10),
          // Same area but different destination — must NOT join
          requestRow('req_other_dest', 29.59, 80.2, 'Haldwani', 10),
        ],
        findUnique: async ({ where }: any) => requestRow(where.id, 29.58, 80.21, 'Dehradun', 10),
      },
    };
    const svc = new ClusterService(prisma as any, redisStub());
    const result = await svc.runClustering();

    assert.equal(result.created, 1, 'exactly one cluster created');
    assert.equal(createdClusters[0].passengerCount, 4, 'seat counts summed (1+2+1)');
    assert.equal(createdClusters[0].requests.create.length, 3, 'three requests linked');
    assert.ok(
      !createdClusters[0].requests.create.some((r: any) => r.requestId === 'req_far' || r.requestId === 'req_other_dest'),
      'outliers excluded',
    );
    assert.ok(createdClusters[0].radiusKm <= 15, 'cluster radius within eps');
  }

  // ── Clustering: fewer than MIN_PTS requests → no cluster ────────────────────

  {
    const prisma = {
      clusterGroup: { updateMany: async () => ({ count: 0 }), create: async () => ({}) },
      transportRequest: {
        findMany: async () => [requestRow('req_1', 29.58, 80.21, 'Dehradun', 10), requestRow('req_2', 29.6, 80.23, 'Dehradun', 40)],
      },
    };
    const svc = new ClusterService(prisma as any, redisStub());
    const result = await svc.runClustering();
    assert.equal(result.created, 0, 'two requests are below MIN_PTS — no cluster');
  }

  // ── Accept: atomic claim — second driver loses ───────────────────────────────

  {
    let claimCount = 0;
    const prisma = {
      clusterGroup: {
        findUnique: async () => ({
          id: 'clust_1',
          status: 'OPEN',
          expiresAt: new Date(Date.now() + 3_600_000),
          passengerCount: 4,
          radiusKm: 5,
          destinationLabel: 'Dehradun',
          departureFrom: new Date(Date.now() + 20 * 3_600_000),
          requests: [{ request: { passengerId: 'pass_1' } }],
        }),
        // First claim wins, second returns count 0
        updateMany: async () => ({ count: claimCount++ === 0 ? 1 : 0 }),
        update: async () => ({}),
      },
      route: {
        findFirst: async () => ({ id: 'route_1', toCity: 'Dehradun', status: 'ACTIVE' }),
      },
      scheduledTrip: {
        create: async ({ data }: any) => ({ id: 'trip_c1', ...data }),
      },
      $transaction: async (fn: any) => fn(prisma),
    };
    const svc = new ClusterService(prisma as any, redisStub());

    const first = await svc.acceptCluster('clust_1', 'drv_1', undefined, undefined);
    assert.equal(first.tripId, 'trip_c1', 'first driver gets the trip');
    assert.equal(first.status, 'ASSIGNED');

    await assert.rejects(
      () => svc.acceptCluster('clust_1', 'drv_2', undefined, undefined),
      (err: any) => err.response?.error_code === 'cluster_already_assigned',
      'second driver gets cluster_already_assigned',
    );
  }

  // ── Accept: unresolvable route → explicit error ─────────────────────────────

  {
    const prisma = {
      clusterGroup: {
        findUnique: async () => ({
          id: 'clust_1',
          status: 'OPEN',
          expiresAt: new Date(Date.now() + 3_600_000),
          passengerCount: 3,
          radiusKm: 5,
          destinationLabel: 'Nowhere',
          departureFrom: new Date(),
          requests: [],
        }),
      },
      route: { findFirst: async () => null },
    };
    const svc = new ClusterService(prisma as any, redisStub());
    await assert.rejects(
      () => svc.acceptCluster('clust_1', 'drv_1', undefined, undefined),
      (err: any) => err.response?.error_code === 'cluster_route_unresolved',
      'missing route → cluster_route_unresolved',
    );
  }

  // ── Passenger opt-out leaves the request in the open pool ───────────────────

  {
    let requestTouched = false;
    const prisma = {
      clusterRequest: {
        findFirst: async () => ({
          id: 'cr_1',
          requestId: 'req_1',
          cluster: { id: 'clust_1', status: 'OPEN', assignedTripId: null },
          request: { passengerId: 'pass_1' },
        }),
        update: async ({ data }: any) => ({ id: 'cr_1', ...data }),
      },
      transportRequest: {
        update: async () => {
          requestTouched = true;
          return {};
        },
      },
    };
    const svc = new ClusterService(prisma as any, redisStub());
    const result = await svc.confirmClusterParticipation('clust_1', 'pass_1', false);
    assert.equal(result.status, 'DECLINED', 'opt-out recorded');
    assert.equal(requestTouched, false, 'underlying request untouched on opt-out');
  }

  console.log('cluster contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
