/**
 * 《天道锻造大师 WEB版》 v2.5.1 (WEEB) - 极简总引导入口
 */
// 文件路径：ui/js/app.js 顶部引入
import { loadGameAssets } from './world/assets.js';
// 文件路径：ui/js/app.js 顶部引入
import { invoke } from './core.js';
import { syncState } from './state.js';
import { drawWorld, initMotes, resetImpactFX } from './world.js';
import { drawHUD, hudState } from './hud.js';
import { setupInteractions, doStrike, isAutoStrikeActive } from './input.js';
import { fx } from './world.js';

const rootEl = document.getElementById('game-root');
let canvas = null;
let ctx = null;
let gameLoopTimer = null;
let gameLoopBusy = false;

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

  if (!ctx || document.hidden) return;
  const w = window.innerWidth, h = window.innerHeight;

  try {
    drawWorld(ctx, w, h, now);
    drawHUD(ctx, w, h, now);
  } catch (err) {
    console.error('【渲染异常捕获】', err);
  }
}

function stopGameLoop() {
  if (gameLoopTimer !== null) {
    clearTimeout(gameLoopTimer);
    gameLoopTimer = null;
  }
}

function scheduleGameLoop(delay = 150) {
  stopGameLoop();
  if (!document.hidden) gameLoopTimer = setTimeout(runGameLoop, delay);
}

async function runGameLoop() {
  gameLoopTimer = null;
  if (document.hidden || gameLoopBusy) return;
  gameLoopBusy = true;
  try {
    const snap = await invoke('tick');
    if (snap) syncState(snap);

    if (!document.hidden && isAutoStrikeActive()) await doStrike();
  } finally {
    gameLoopBusy = false;
    scheduleGameLoop();
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
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      stopGameLoop();
      return;
    }

    // 回到前台只同步最新状态，不补播后台期间的动画。
    fx.clearTransient();
    resetImpactFX();
    hudState.resetFps();
    const snap = await invoke('state');
    if (snap) syncState(snap);
    scheduleGameLoop(150);
  });
  scheduleGameLoop();
})();
