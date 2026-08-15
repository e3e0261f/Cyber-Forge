/** Cyber-Forge UI 入口：模块组装 + 启动轮询 */
import { getInvoke, invoke } from './core.js';
import { startParticles } from './particles.js';
import { applySnap } from './apply.js';
import { setupInput } from './input.js';
import { setupAutoStrike } from './auto_strike.js';
import { initFpsMeter } from './fps.js';

startParticles();
setupInput();
setupAutoStrike();
initFpsMeter();

(async function boot() {
  // 1. 初次加载获取完整状态
  const s = await invoke('get_state');
  if (s) applySnap(s);

  // 2. 启动高频心跳轮询 (120ms - 200ms)
  setInterval(async () => {
    const t = await invoke('game_tick');
    if (t) applySnap(t);
  }, 150);
})();
