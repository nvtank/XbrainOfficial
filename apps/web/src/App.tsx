import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useApp } from './stores/app';
import { api, ApiError } from './services/api';
import { traceLogo, LOGO_URL } from './game/environment/Logo3D';
import { LoadingScreen } from './ui/LoadingScreen';
import { AvatarCreator } from './ui/AvatarCreator';
import { FatalScreen, FullScreen } from './ui/StatusScreens';

const Game = lazy(() => import('./ui/Game'));
const AdminPanel = lazy(() => import('./ui/AdminPanel'));

async function boot() {
  const app = useApp.getState();
  app.setStep('app', 'Loading application', true);
  app.setStep('server', 'Connecting to XBrain server');
  app.setStep('profile', 'Loading your profile');
  app.setStep('assets', 'Preparing 3D assets (logo, fonts, physics)');
  try {
    const cfg = await api.config();
    useApp.getState().set({ serverConfig: cfg });
    app.setStep('server', `Connected to ${cfg.name}`, true);
  } catch {
    useApp.getState().set({ phase: 'fatal', error: 'Cannot reach the XBrain Virtual Office server. Make sure the game server is running (npm run dev) and try again.' });
    return;
  }
  if (useApp.getState().token) {
    try {
      const { user } = await api.me();
      useApp.getState().set({ user });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        localStorage.removeItem('xbrain.token');
        useApp.getState().set({ token: null });
      }
    }
  }
  app.setStep('profile', useApp.getState().user ? `Welcome back, ${useApp.getState().user!.displayName}` : 'New visitor', true);
  await Promise.allSettled([
    traceLogo(LOGO_URL),
    document.fonts?.ready,
    import('./ui/Game'),
    import('@react-three/rapier'),
  ]);
  app.setStep('assets', '3D assets ready', true);
  await new Promise((r) => setTimeout(r, 350));
  useApp.getState().setPhase('creator');
}

export function App() {
  const phase = useApp((s) => s.phase);
  useEffect(() => {
    if (useApp.getState().phase === 'boot') void boot();
    const onHash = () => useApp.getState().setPhase(location.hash.startsWith('#/admin') ? 'admin' : useApp.getState().phase === 'admin' ? 'boot' : useApp.getState().phase);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (phase === 'admin')
    return (
      <Suspense fallback={null}>
        <AdminPanel />
      </Suspense>
    );

  return (
    <>
      {(phase === 'joining' || phase === 'game') && (
        <Suspense fallback={null}>
          <Game />
        </Suspense>
      )}
      <AnimatePresence>{phase === 'boot' && <LoadingScreen key="loading" />}</AnimatePresence>
      <AnimatePresence>{phase === 'creator' && <AvatarCreator key="creator" mode="welcome" />}</AnimatePresence>
      {phase === 'full' && <FullScreen />}
      {phase === 'fatal' && <FatalScreen onRetry={() => (useApp.getState().set({ phase: 'boot', error: null, steps: [] }), void boot())} />}
    </>
  );
}
