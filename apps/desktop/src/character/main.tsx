import { createRoot } from 'react-dom/client';
import { CharacterApp } from './CharacterApp';
import './character.css';
import '../demo/demo.css';

const container = document.getElementById('root');
if (!container) throw new Error('未找到 #root');

createRoot(container).render(<CharacterApp />);

function syncPaused(): void {
  document.body.dataset.paused = document.hidden ? 'true' : 'false';
}

document.addEventListener('visibilitychange', syncPaused);
syncPaused();
