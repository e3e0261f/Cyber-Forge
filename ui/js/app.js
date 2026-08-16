/**
 * 《天道锻造大师 WEB版》 v2.5.1 (WEEB) - 极简总引导入口
 */
// 文件路径：ui/js/app.js 顶部引入
import { loadGameAssets } from './world/assets.js';
// 文件路径：ui/js/app.js 顶部引入
import { invoke } from './core.js';
import { syncState } from './state.js';
import { drawWorld, initMotes } from './world.js';
import { drawHUD } from './hud.js';
import { setupInteractions, doStrike, isAutoStrikeActive } from './input.js';

const rootEl = document.getElementById('game-root');
let canvas = null;
let ctx = null;

function initCanvas() {
  canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  rootEl.appendChild(canvas);
  ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  resize();
  window.addEventListener('resize', resize);
  initMotes(window.innerWidth, window.innerHeight);
}

function resize() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function render(now) {
  // 🌟 调度置顶，保证循环永不中断
  requestAnimationFrame(render);

  if (!ctx) return;
  const w = window.innerWidth, h = window.innerHeight;

  try {
    drawWorld(ctx, w, h, now);
    drawHUD(ctx, w, h, now);
  } catch (err) {
    console.error('【渲染异常捕获】', err);
  }
}


// ... 找到 boot 函数并修改：
(async function boot() {
  // 🌟 1. 立即异步加载所有 2D 高清原画贴图
  loadGameAssets();

  initCanvas();
  setupInteractions();

  const s = await invoke('state');
  if (s) syncState(s);

  requestAnimationFrame(render);

  setInterval(async () => {
    const snap = await invoke('tick');
    if (snap) syncState(snap);

    if (isAutoStrikeActive()) {
      doStrike();
    }
  }, 150);
})();
