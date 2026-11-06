import { AlertTriangle, Users } from 'lucide-react';
import { useApp } from '../stores/app';
import { Logo } from './LoadingScreen';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1115] p-6 text-white">
      <div className="glass w-[480px] max-w-full p-8 text-center">
        <div className="mx-auto mb-5 w-fit rounded-2xl bg-white px-5 py-3">
          <Logo className="h-9" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function FullScreen() {
  const office = useApp((s) => s.office);
  return (
    <Shell>
      <Users className="mx-auto mb-3 h-10 w-10 text-brand" />
      <h2 className="text-xl font-bold">The office is full</h2>
      <p className="mt-2 text-sm text-white/70">
        {office?.name ?? 'XBrain Office'} is at capacity ({office?.online ?? '?'}/{office?.capacity ?? 50}). Please try again in a moment.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button className="btn-primary" onClick={() => useApp.getState().set({ phase: 'creator' })}>
          Try again
        </button>
      </div>
    </Shell>
  );
}

export function FatalScreen({ onRetry }: { onRetry: () => void }) {
  const error = useApp((s) => s.error);
  return (
    <Shell>
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
      <h2 className="text-xl font-bold">Connection problem</h2>
      <p className="mt-2 text-sm text-white/70">{error}</p>
      <button className="btn-primary mt-6" onClick={onRetry}>
        Retry
      </button>
    </Shell>
  );
}
