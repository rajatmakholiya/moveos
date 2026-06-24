import { AlertTriangle } from 'lucide-react';

type BackendPendingBannerProps = {
  title: string;
  description: string;
};

export function BackendPendingBanner({ title, description }: BackendPendingBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-amber-900">{description}</p>
      </div>
    </div>
  );
}
