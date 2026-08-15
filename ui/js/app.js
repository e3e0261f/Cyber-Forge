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

// 🌟 资财协议下拉菜单控制
const protoBtn = $('currProtocolBtn');
const protoMenu = $('currProtocolMenu');
const currencyBody = $('currencyBodyClickable');

function toggleMenu(e) {
  e.stopPropagation();
  if (protoMenu) {
    protoMenu.style.display = protoMenu.style.display === 'none' ? 'block' : 'none';
  }
}

if (protoBtn) protoBtn.addEventListener('click', toggleMenu);
if (currencyBody) currencyBody.addEventListener('click', toggleMenu);

// 点击菜单项切换模式
if (protoMenu) {
  protoMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.curr-menu-item');
    if (item) {
      const mode = item.getAttribute('data-mode');
      invoke('action', { key: `set_currency_protocol_${mode}` });
      protoMenu.style.display = 'none';
    }
  });
}

// 点击外部关闭下拉菜单
window.addEventListener('click', () => {
  if (protoMenu) protoMenu.style.display = 'none';
});
