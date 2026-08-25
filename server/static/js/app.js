/**
 * 《天道锻造大师 WEB版》 v2.5.1 (WEEB) - 极简总引导入口
 */
// 文件路径：ui/js/app.js 顶部引入
import { loadGameAssets } from './world/assets.js';
// 文件路径：ui/js/app.js 顶部引入
import { invoke } from './core.js';
import { syncState, gameStore } from './state.js';
import { drawWorld, initMotes, resetImpactFX } from './world.js';
import { drawHUD, hudState } from './hud.js';
import { setupInteractions, doStrike, isAutoStrikeActive, playerPos, updatePlayerMovement } from './input.js';
import { fx } from './world.js';
import { audio, bindAudioUnlock } from './audio.js';

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
    updatePlayerMovement(now);
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

  // 🎵 音频系统：首次用户交互时解锁 AudioContext 并启动 BGM
  bindAudioUnlock();

  const s = await invoke('state');
  if (s) {
    // 🌟 维度三：登录校验 (Login Blockchain Verification)
    // 每次玩家登录时，客户端本地区块链高度与哈希必须与服务端匹配；不合法则以服务端权威区块重置校验
    const { localHashChain } = await import('./security/hash-chain.js');
    const { auditReporter } = await import('./security/audit-reporter.js');

    if (s.security_violation || s.kick) {
      auditReporter.handleSecurityViolation(s);
      return;
    }

    if (s.block_height !== undefined && s.block_hash) {
      if (localHashChain.currentHeight < s.block_height) {
        console.log(`⛓️ [HashChain] 服务端区块高度 (#${s.block_height}) 领先本地，更新本地权威状态`);
        localHashChain.resetWithServerState(s.block_height, s.block_hash);
      } else if (localHashChain.currentHeight > s.block_height) {
        console.log(`⛓️ [HashChain] 检测到未同步的离线区块 (${localHashChain.currentHeight - s.block_height} 个)，触发异步对账...`);
        auditReporter.syncPendingHashChain(s.block_height);
      }
    }

    syncState(s);
  }

  requestAnimationFrame(render);
  
  // 🌟 网页关闭或刷新前，立即将玩家最新坐标与区域持久化至 StorageAdapter
  const handleUnloadPersist = () => {
    gameStore.updatePlayerPosition(playerPos.x, playerPos.y, gameStore.state.current_zone_id, { persist: true, syncServer: false });
    gameStore.persistCoordinates(true);
  };
  window.addEventListener('beforeunload', handleUnloadPersist);
  window.addEventListener('pagehide', handleUnloadPersist);

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      handleUnloadPersist();
      stopGameLoop();
      audio.handleVisibility(true);  // 🎵 暂停 BGM
      return;
    }

    audio.handleVisibility(false);  // 🎵 恢复 BGM

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
