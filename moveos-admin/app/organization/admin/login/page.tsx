'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type ApiError } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export default function OrganizationAdminLoginPage() {
  const router = useRouter();
  const { user, isReady, login } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isReady && user) {
      router.replace(user.role === 'ORG_ADMIN' ? '/dashboard/org' : '/dashboard');
    }
  }, [isReady, user, router]);

  const sendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ sent: boolean; devOtpCode?: string }>('/auth/organization/otp/request', { phone });
      if (res.devOtpCode) setDevOtp(res.devOtpCode);
      setStep('otp');
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setLoading(true);
    setError('');
    try {
      await login(phone, otp, 'organization');
      router.replace('/dashboard/org');
    } catch (err) {
      setError((err as ApiError).message ?? 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isReady) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15">
            <Building2 className="h-7 w-7 text-cyan-300" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Organization Admin</h1>
          <p className="text-sm text-slate-400">Fleet workspace access</p>
        </div>
        <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-slate-200">{step === 'phone' ? 'Enter phone number' : 'Enter OTP'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 'phone' ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-slate-300">Phone (E.164 format)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      type="tel"
                      placeholder="+919876540010"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !loading && phone && void sendOtp()}
                      className="h-11 border-slate-700 bg-slate-800 pl-10 text-white"
                    />
                  </div>
                </div>
                <Button disabled={!phone || loading} onClick={() => void sendOtp()} className="h-11 w-full bg-cyan-600 hover:bg-cyan-500">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  Send OTP
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-slate-300">OTP sent to {phone}</Label>
                  <Input
                    value={otp}
                    maxLength={6}
                    inputMode="numeric"
                    onChange={(e) => setOtp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && otp && void verify()}
                    className="h-11 border-slate-700 bg-slate-800 text-center text-xl tracking-[0.3em] text-white"
                  />
                  {devOtp && <p className="rounded bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-300">Dev OTP: {devOtp}</p>}
                </div>
                <Button disabled={!otp || loading} onClick={() => void verify()} className="h-11 w-full bg-emerald-600 hover:bg-emerald-500">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & Login
                </Button>
                <Button variant="ghost" onClick={() => { setStep('phone'); setOtp(''); setDevOtp(''); }} className="w-full text-slate-400">
                  Change number
                </Button>
              </>
            )}
            {error && <p className="rounded-lg bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
