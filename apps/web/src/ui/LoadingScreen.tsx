import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { useApp } from '../stores/app';

export function Logo({ className = 'h-10' }: { className?: string }) {
  return <img src="/assets/xbrain-logo.webp" alt="XBrain" className={`${className} w-auto object-contain`} draggable={false} />;
}

export function LoadingScreen({ title = 'XBRAIN VIRTUAL OFFICE', subtitle = 'Connect • Work • Collaborate' }: { title?: string; subtitle?: string }) {
  const steps = useApp((s) => s.steps);
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 5;
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#0f1115]"
    >
      <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-brand-deep/20 blur-[120px]" />
      <div className="relative w-[440px] max-w-[90vw] text-center text-white">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }} className="mx-auto mb-6 w-fit rounded-3xl bg-white px-8 py-5 shadow-2xl">
          <Logo className="h-14" />
        </motion.div>
        <h1 className="text-xl font-extrabold tracking-[0.2em]">{title}</h1>
        <p className="mt-1 text-sm text-white/60">{subtitle}</p>
        <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-brand-deep via-brand to-brand-yellow" animate={{ width: `${pct}%` }} transition={{ ease: 'easeOut', duration: 0.4 }} />
        </div>
        <div className="mt-2 text-right font-mono text-xs text-white/50">{pct}%</div>
        <ul className="mt-4 space-y-1.5 text-left text-sm">
          {steps.map((s) => (
            <li key={s.id} className={`flex items-center gap-2 ${s.done ? 'text-white/80' : 'text-white/50'}`}>
              {s.done ? <Check className="h-4 w-4 text-emerald-400" /> : <Loader2 className="h-4 w-4 animate-spin text-brand" />}
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
