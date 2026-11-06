import { useEffect, useState } from 'react';
import { useSettings } from '../../stores/settings';

export type Tod = 'day' | 'sunset' | 'night';

export function resolveTod(setting: string, date = new Date()): Tod {
  if (setting === 'day' || setting === 'sunset' || setting === 'night') return setting;
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 18.75) return 'sunset';
  if (h >= 5 && h < 6) return 'sunset';
  return 'night';
}

export function useTimeOfDay(): Tod {
  const setting = useSettings((s) => s.timeOfDay);
  const [tod, setTod] = useState<Tod>(() => resolveTod(setting));
  useEffect(() => {
    setTod(resolveTod(setting));
    if (setting !== 'auto') return;
    const id = setInterval(() => setTod(resolveTod('auto')), 60_000);
    return () => clearInterval(id);
  }, [setting]);
  return tod;
}

export interface TodPreset {
  sunDir: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambient: number;
  ambientColor: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  cityGlow: number;
  bridgeGlow: number;
  water: string;
  led: number;
  exposure: number;
}

export const TOD_PRESETS: Record<Tod, TodPreset> = {
  day: {
    sunDir: [0.28, 0.62, -0.73], sunColor: '#fff3df', sunIntensity: 2.6,
    hemiSky: '#dcebff', hemiGround: '#b8b0a2', hemiIntensity: 0.7,
    ambient: 0.42, ambientColor: '#ffffff',
    fog: '#cfdfec', fogNear: 500, fogFar: 4600,
    turbidity: 5, rayleigh: 1.1, mie: 0.004, mieG: 0.82,
    cityGlow: 0, bridgeGlow: 0, water: '#2b6a82', led: 1.2, exposure: 1.0,
  },
  sunset: {
    sunDir: [-0.42, 0.07, -0.9], sunColor: '#ffad70', sunIntensity: 1.5,
    hemiSky: '#f0b98f', hemiGround: '#6a5a55', hemiIntensity: 0.55,
    ambient: 0.45, ambientColor: '#ffe6cf',
    fog: '#d9a98a', fogNear: 350, fogFar: 4000,
    turbidity: 9, rayleigh: 3, mie: 0.012, mieG: 0.92,
    cityGlow: 0.55, bridgeGlow: 0.6, water: '#4a5d75', led: 1.5, exposure: 1.05,
  },
  night: {
    sunDir: [0.3, 0.8, 0.45], sunColor: '#9fb4ff', sunIntensity: 0.28,
    hemiSky: '#2a3a60', hemiGround: '#1a1714', hemiIntensity: 0.3,
    ambient: 0.62, ambientColor: '#fff4e6',
    fog: '#0a1122', fogNear: 300, fogFar: 3800,
    turbidity: 1, rayleigh: 0.2, mie: 0.002, mieG: 0.7,
    cityGlow: 1.3, bridgeGlow: 1.6, water: '#0d1d2e', led: 2.2, exposure: 1.0,
  },
};
