import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useApp } from '../stores/app';
import { useGame } from '../stores/game';
import { GameScene } from '../game/scenes/GameScene';
import { input } from '../game/controls/input';
import { joinOffice, net } from '../services/network';
import { sfx } from '../services/sfx';
import { HUD } from './hud/HUD';
import { AvatarCreator } from './AvatarCreator';
import { Logo } from './LoadingScreen';

function JoiningOverlay({ label }: { label: string }) {
  return (
    <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }} className="fixed inset-0 z-40 flex items-center justify-center bg-[#0f1115] text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 w-fit rounded-2xl bg-white px-6 py-4">
          <Logo className="h-10" />
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin text-brand" /> {label}
        </div>
      </div>
    </motion.div>
  );
}

export default function Game() {
  const phase = useApp((s) => s.phase);
  const editing = useApp((s) => s.editingInGame);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    input.start();
    let cancelled = false;
    (async () => {
      try {
        const r = await joinOffice();
        if (cancelled) return;
        if (r === 'full') useApp.getState().set({ phase: 'full' });
        else {
          useApp.getState().set({ phase: 'game' });
          sfx.join();
        }
      } catch (e) {
        if (cancelled) return;
        useGame.getState().toast('error', `Could not join the office: ${(e as Error).message}`);
        useApp.getState().set({ phase: 'creator' });
      }
    })();
    return () => {
      cancelled = true;
      void net.leave();
    };
  }, []);

  const loading = phase === 'joining' || !ready;
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <GameScene onReady={() => setReady(true)} />
      {!loading && <HUD />}
      <AnimatePresence>{loading && <JoiningOverlay key="join" label={phase === 'joining' ? 'Entering the office…' : 'Building the 3D office…'} />}</AnimatePresence>
      <AnimatePresence>{editing && <AvatarCreator key="edit" mode="edit" />}</AnimatePresence>
    </div>
  );
}
