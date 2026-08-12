/** Cyber-Forge UI 入口：模块组装 + 启动轮询 */
import { getInvoke, invoke } from './core.js';
import { startParticles } from './particles.js';
import { applySnap } from './apply.js';
import { setupInput } from './input.js';

startParticles();
setupInput();

(async function boot() {
  if (!getInvoke()) {
    console.warn('[Cyber-Forge] Tauri invoke 不可用，仅预览模式');
    return;
  }
  const s = await invoke('get_state');
  if (s) applySnap(s);

  setInterval(async () => {
    const t = await invoke('game_tick');
    if (t) applySnap(t);
  }, 150);
})();
