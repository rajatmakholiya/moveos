'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Play, RefreshCw, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/AuthContext';
import { clusterApi, type ClusterGroupView } from '@/lib/api';

const STATUS_STYLE: Record<ClusterGroupView['status'], string> = {
  OPEN: 'bg-emerald-100 text-emerald-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  DEPARTED: 'bg-indigo-100 text-indigo-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-red-100 text-red-600',
};

function formatWindow(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const from = start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const to = end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${from} – ${to}`;
}

export default function ClustersPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const organizationId = user?.defaultOrganizationId ?? null;

  const [clusters, setClusters] = useState<ClusterGroupView[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [runResult, setRunResult] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isSuperAdmin) {
        const res = await clusterApi.listAll();
        setClusters(res.clusters ?? []);
      } else if (organizationId) {
        const res = await clusterApi.listForOrg(organizationId);
        setClusters(res.data?.clusters ?? []);
      } else {
        setClusters([]);
      }
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Failed to load clusters');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runClustering = async () => {
    setRunning(true);
    setRunResult('');
    try {
      const res = await clusterApi.run();
      setRunResult(`Sweep complete — ${res.created} new cluster(s) from ${res.openRequests} open request(s).`);
      await load();
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Clustering run failed');
    } finally {
      setRunning(false);
    }
  };

  const counts = clusters.reduce<Record<string, number>>((acc, cluster) => {
    acc[cluster.status] = (acc[cluster.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" />
            Passenger Clusters
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Automatically grouped seat requests (nearby pickups, same destination, overlapping departure windows).
            Drivers on the GROWTH plan can accept a whole cluster as one trip.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          {isSuperAdmin && (
            <Button onClick={() => void runClustering()} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Run clustering now
            </Button>
          )}
        </div>
      </div>

      {runResult && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{runResult}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['OPEN', 'ASSIGNED', 'DEPARTED', 'EXPIRED', 'CANCELLED'] as const).map((status) => (
          <Card key={status}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{counts[status] ?? 0}</p>
              <p className="text-xs text-gray-500 mt-0.5">{status}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cluster groups</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading clusters…
            </div>
          ) : clusters.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              No clusters yet. Clusters form automatically each sweep when enough open seat requests share a pickup
              area, destination, and departure window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Destination</th>
                    <th className="py-2 pr-4">Passengers</th>
                    <th className="py-2 pr-4">Departure window</th>
                    <th className="py-2 pr-4">Pickup radius</th>
                    <th className="py-2 pr-4">Centroid</th>
                    <th className="py-2 pr-4">Driver / Trip</th>
                    <th className="py-2">Confirmations</th>
                  </tr>
                </thead>
                <tbody>
                  {clusters.map((cluster) => {
                    const confirmed = cluster.requests.filter((request) => request.status === 'CONFIRMED').length;
                    return (
                      <tr key={cluster.id} className="border-b last:border-0">
                        <td className="py-3 pr-4">
                          <Badge className={STATUS_STYLE[cluster.status]}>{cluster.status}</Badge>
                        </td>
                        <td className="py-3 pr-4 font-medium text-gray-900">{cluster.destination}</td>
                        <td className="py-3 pr-4">{cluster.passengerCount}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{formatWindow(cluster.departureWindowStart, cluster.departureWindowEnd)}</td>
                        <td className="py-3 pr-4">{cluster.radiusKm} km</td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <MapPin className="w-3.5 h-3.5" />
                            {cluster.centroidLat.toFixed(3)}, {cluster.centroidLng.toFixed(3)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-600">
                          {cluster.assignedDriverId ? (
                            <>
                              <div>drv: {cluster.assignedDriverId.slice(0, 12)}…</div>
                              {cluster.assignedTripId && <div>trip: {cluster.assignedTripId.slice(0, 12)}…</div>}
                            </>
                          ) : (
                            <span className="text-gray-400">unassigned</span>
                          )}
                        </td>
                        <td className="py-3 text-xs text-gray-600">
                          {confirmed}/{cluster.requests.length} confirmed
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
