/** 快捷键：空格 0ms 即时打击感 + 全键盘通用阶梯狂飙 */
import { invoke, showToast } from './core.js';
import { applySnap } from './apply.js';
import { isCurrentlyInCrit, resetLocalCycle, sparkAtHead } from './forge.js';

// ... 保持原有常数配置不变 ...
const SPACE_INTERVAL_MS = 35;
const OTHER_KEYS_INTERVAL_MS = 250;
const STEP_TIERS = [
  { hitsThreshold: 1000, stepSize: 1000 },
{ hitsThreshold: 100,  stepSize: 100 },
{ hitsThreshold: 10,   stepSize: 10 },
{ hitsThreshold: 0,    stepSize: 1 }
];
const EXCLUDE_KEYS = new Set(['KeyP', 'KeyH', 'Digit0']);

const KEY_MAP = {
  Space: 'strike',
  KeyU: 'u', KeyW: 'w', KeyA: 'a', KeyR: 'r', KeyD: 'd', KeyE: 'e',
  KeyT: 't', KeyG: 'g', KeyF: 'f', KeyS: 's', KeyB: 'b', KeyI: 'i', KeyO: 'o',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', KeyP: 'p',
};

const heldKeys = new Map();
let mainLoopTimer = null;
let actionBusy = false;

function getStepMultiplier(hits) {
  if (hits <= 10) return 1;
  const power = Math.floor((hits - 1) / 10);
  return Math.pow(10, Math.min(power, 15));
}

async function fireKey(code, shiftKey, ctrlKey, hitCount = 1) {
  if (actionBusy && code !== 'Space') return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (code === 'KeyI' && shiftKey) k = 'I';
  if (code === 'KeyO' && shiftKey) k = 'O';

  // 🌟 核心：空格敲击（0 毫秒极致打击感响应）
  if (k === 'strike') {
    // 1. 本地即刻识别当前是否处于暴击区 (0ms)
    const isCrit = isCurrentlyInCrit();
    // 2. 本地即刻重置读条并向四周炸裂火花 (0ms)
    sparkAtHead(isCrit);
    resetLocalCycle();

    // 3. 异步向后端报告挥锤动作
    try {
      const t = await invoke('player_strike');
      if (t) applySnap(t);
    } catch (_) {}
    return;
  }

  // 其他按键的阶梯倍率计算
  if (!EXCLUDE_KEYS.has(code)) {
    const step = getStepMultiplier(hitCount);
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
      if (ctrlKey) k = k + '_100';
      else if (shiftKey) k = k + '_10';
      else if (step > 1) k = `${k}_${step}`;
    } else if (step > 1) {
      k = `${k}_${step}`;
    }
  }

  actionBusy = true;
  try {
    const t = await invoke('action', { key: k });
    if (t) applySnap(t);
  } finally {
    actionBusy = false;
  }
}

// 维持高精度主循环
function startMainLoop() {
  if (mainLoopTimer) return;
  mainLoopTimer = setInterval(async () => {
    if (!heldKeys.size) {
      clearInterval(mainLoopTimer);
      mainLoopTimer = null;
      return;
    }
    const now = performance.now();
    for (const [code, info] of heldKeys.entries()) {
      const interval = (code === 'Space') ? SPACE_INTERVAL_MS : OTHER_KEYS_INTERVAL_MS;
      if (now - info.lastFiredTime >= interval) {
        info.lastFiredTime = now;
        info.hitCount++;
        await fireKey(code, info.shiftKey, info.ctrlKey, info.hitCount);
      }
    }
  }, 10);
}

export function setupInput() {
  window.addEventListener('keydown', async (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      const t = await invoke('action', { key: 'p' });
      if (t) applySnap(t);
      return;
    }
    if (e.code === 'KeyH') {
      e.preventDefault();
      showToast('【操作指南】空格(35ms)疯狂连击 | 其他按键(250ms)阶梯狂飙！');
      return;
    }

    if (!KEY_MAP[e.code]) return;
    if (e.repeat) return;

    if (!EXCLUDE_KEYS.has(e.code)) {
      e.preventDefault();
      if (!heldKeys.has(e.code)) {
        heldKeys.set(e.code, {
          hitCount: 1,
          lastFiredTime: performance.now(),
                     shiftKey: e.shiftKey,
                     ctrlKey: e.ctrlKey
        });
        await fireKey(e.code, e.shiftKey, e.ctrlKey, 1);
        startMainLoop();
      }
    } else {
      await fireKey(e.code, e.shiftKey, e.ctrlKey, 1);
    }
  });

  window.addEventListener('keyup', (e) => {
    heldKeys.delete(e.code);
    if (!heldKeys.size && mainLoopTimer) {
      clearInterval(mainLoopTimer);
      mainLoopTimer = null;
    }
  });

  window.addEventListener('blur', () => {
    heldKeys.clear();
    if (mainLoopTimer) {
      clearInterval(mainLoopTimer);
      mainLoopTimer = null;
    }
  });
}
