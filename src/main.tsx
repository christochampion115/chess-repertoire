import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { BackgroundParticles } from '@/components/layout/BackgroundParticles';

// Particules dans un root isolé : leurs events animationiteration
// n'atteignent pas le listener capture React du root principal.
createRoot(document.getElementById('particles-root')!).render(<BackgroundParticles />);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
