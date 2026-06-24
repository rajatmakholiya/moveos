import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export function useWalletBalance() {
  const token = useAuthStore((s) => s.token);
  return useQuery<number>({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => {
      const res = await api.getd<{ balance: number }>('/wallet/me/balance', token);
      return res?.balance ?? 0;
    },
    enabled: !!token,
    staleTime: 60_000,
  });
}
