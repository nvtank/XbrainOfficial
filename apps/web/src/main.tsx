import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Note: React.StrictMode is intentionally not used — the 3D scene owns imperative
// resources (skinned meshes, physics controllers, WebSocket/WebRTC sessions) whose
// lifecycle must not be double-mounted in development.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
