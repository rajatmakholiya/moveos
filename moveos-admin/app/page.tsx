'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Phone, Shield, ArrowRight, Loader2 } from 'lucide-react';
import { api, type ApiError } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { user, isReady, login } = useAuth();
  const [mode, setMode] = useState<'super_admin' | 'organization'>('super_admin');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('auth:session_expired')) {
      setSessionExpired(true);
      sessionStorage.removeItem('auth:session_expired');
    }
  }, []);

  useEffect(() => {
    if (isReady && user) {
      router.replace(user.role === 'ORG_ADMIN' ? '/dashboard/org' : '/dashboard');
    }
  }, [isReady, user, router]);

  const sendOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const path = mode === 'organization' ? '/auth/organization/otp/request' : '/auth/admin/otp/request';
      const res = await api.post<{ sent: boolean; devOtpCode?: string }>(path, { phone });
      if (res.devOtpCode) setDevOtp(res.devOtpCode);
      setStep('otp');
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setError('');
    setLoading(true);
    try {
      await login(phone, otp, mode);
      router.replace(mode === 'organization' ? '/dashboard/org' : '/dashboard');
    } catch (err) {
      setError((err as ApiError).message ?? 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center">
            <Shield className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">MoveOS Admin</h1>
          <p className="text-slate-400 text-sm">{mode === 'organization' ? 'Organization workspace access' : 'Super-admin access only'}</p>
        </div>

        {sessionExpired && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
            Your session has expired. Please log in again.
          </div>
        )}

        <Card className="border-slate-700/50 bg-slate-800/60 backdrop-blur shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium text-slate-200">
              {step === 'phone' ? 'Enter phone number' : 'Enter OTP'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 'phone' ? (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-900/50 p-1">
                  <button
                    type="button"
                    onClick={() => setMode('super_admin')}
                    className={`h-9 rounded-md text-xs font-semibold transition-colors ${mode === 'super_admin' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Super Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('organization')}
                    className={`h-9 rounded-md text-xs font-semibold transition-colors ${mode === 'organization' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Organization
                  </button>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300 text-sm">Phone (E.164 format)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      type="tel"
                      placeholder={mode === 'organization' ? '+919876540010' : '+919876543210'}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !loading && phone && void sendOtp()}
                      className="pl-10 h-11 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => void sendOtp()}
                  disabled={!phone || loading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {loading ? 'Sending…' : 'Send OTP'}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-slate-300 text-sm">OTP sent to {phone}</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && otp && void verify()}
                    maxLength={6}
                    className="text-center text-xl tracking-[0.3em] h-11 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                  />
                  {devOtp && (
                    <p className="text-xs text-amber-400 font-mono bg-amber-400/10 rounded px-2 py-1">
                      Dev OTP: {devOtp}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => void verify()}
                  disabled={!otp || loading}
                  className="w-full h-11 bg-green-600 hover:bg-green-500 text-white font-medium"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {loading ? 'Verifying…' : 'Verify & Login'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setStep('phone'); setOtp(''); setDevOtp(''); }}
                  className="w-full text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                >
                  Change number
                </Button>
              </>
            )}
            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
