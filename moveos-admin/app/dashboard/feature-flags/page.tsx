'use client';

import { useState } from 'react';
import { CheckCircle2, Flag, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { featureFlagsApi, type UserFeatureFlags } from '@/lib/api';

export default function FeatureFlagsPage() {
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState<UserFeatureFlags | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLookup = async () => {
    const id = userId.trim();
    if (!id) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await featureFlagsApi.getByUserId(id);
      setResult(data);
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Failed to load flags');
    } finally {
      setLoading(false);
    }
  };

  const flagEntries = result ? Object.entries(result.flags) : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Flag className="w-6 h-6" />
          Feature Flags
        </h1>
        <p className="text-sm text-gray-500 mt-1">Look up active feature flag assignments for any user</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Flag Lookup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="user-id-input">User ID</Label>
              <Input
                id="user-id-input"
                placeholder="Paste a user CUID from the database..."
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && void handleLookup()}
              />
            </div>
            <Button onClick={() => void handleLookup()} disabled={!userId.trim() || loading}>
              <Search className="w-4 h-4 mr-2" />
              {loading ? 'Looking up…' : 'Look up'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Flags for{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">{result.userId}</code>
              <span className="text-xs font-normal text-gray-400">
                ({result.assignmentCount} assignment{result.assignmentCount !== 1 ? 's' : ''})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flagEntries.length === 0 ? (
              <p className="text-sm text-gray-500">No active flags assigned to this user.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {flagEntries.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between px-4 py-3">
                    <span className="font-mono text-sm text-gray-800">{key}</span>
                    <span className="flex items-center gap-1.5 text-sm">
                      {value ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="font-medium text-emerald-700">enabled</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-500">disabled</span>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
