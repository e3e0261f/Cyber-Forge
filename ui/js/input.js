/** 快捷键：空格单发硬锁定 + 其他按键全键盘点数阶梯狂飙 */
import { invoke, showToast } from './core.js';
import { applySnap } from './apply.js';
import { sparkAtHead } from './particles.js';

// 🌟 排除长按的黑名单（空格强制单发、存档、帮助、调试）
const EXCLUDE_KEYS = new Set([
  'Space', 'KeyP', 'KeyH', 'Digit0'
]);

const KEY_MAP = {
  Space: 'strike',
  KeyU: 'u',
  KeyW: 'w',
  KeyA: 'a',
  KeyR: 'r',
  KeyD: 'd',
  KeyE: 'e',
  KeyT: 't',
  KeyG: 'g',
  KeyF: 'f',
  KeyS: 's',
  KeyB: 'b',
  KeyI: 'i',
  KeyO: 'o',
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  KeyP: 'p',
};

// 记录非空格按键的连续触发点数
const keyHitCounts = new Map();

let isSpaceHeld = false; // 🌟 专门用于锁定空格单发状态
let holdLoopTimer = null;
let actionBusy = false;

async function fireKey(code, shiftKey, ctrlKey) {
  if (actionBusy && code !== 'Space') return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (code === 'KeyI' && shiftKey) k = 'I';
  if (code === 'KeyO' && shiftKey) k = 'O';

  // 🌟 非空格按键：阶梯步进逻辑
  let step = 1;
  if (!EXCLUDE_KEYS.has(code)) {
    let currentHits = (keyHitCounts.get(code) || 0) + 1;
    keyHitCounts.set(code, currentHits);

    if (currentHits > 1000) {
      step = 1000;
    } else if (currentHits > 100) {
      step = 100;
    } else if (currentHits > 10) {
      step = 10;
    } else {
      step = 1;
    }

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
    if (k === 'strike') {
      const t = await invoke('player_strike');
      if (t) {
        applySnap(t);
        sparkAtHead(!!t.in_crit);
      }
    } else {
      const t = await invoke('action', { key: k });
      if (t) applySnap(t);
    }
  } finally {
    actionBusy = false;
  }
}

// 连发循环心跳（速度控制）
const HOLD_INTERVAL_MS = 35;

function startHoldLoop() {
  if (holdLoopTimer) return;

  holdLoopTimer = setInterval(async () => {
    if (!keyHitCounts.size) {
      clearInterval(holdLoopTimer);
      holdLoopTimer = null;
      return;
    }

    for (const code of keyHitCounts.keys()) {
      await fireKey(code, false, false);
    }
  }, HOLD_INTERVAL_MS);
}

export function setupInput() {
  window.addEventListener('keydown', async (e) => {
    // 🌟 1. 优先拦截空格键：防止网页滚动，并严格执行“单按一次只敲一锤”
    if (e.code === 'Space') {
      e.preventDefault();
      if (isSpaceHeld || e.repeat) return; // 🌟 长按不放时直接拦截，绝不连发
      isSpaceHeld = true;
      await fireKey('Space', e.shiftKey, e.ctrlKey);
      return;
    }

    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      const t = await invoke('action', { key: 'p' });
      if (t) applySnap(t);
      return;
    }

    if (e.code === 'KeyH') {
      e.preventDefault();
      showToast('【操作指南】空格单按精准挥锤 | U/W/A/R/D/E/1~5 长按自动阶梯狂飙！');
      return;
    }

    if (!KEY_MAP[e.code]) return;
    if (e.repeat) return;

    // 🌟 2. 其他按键：长按自动阶梯加速
    if (!EXCLUDE_KEYS.has(e.code)) {
      e.preventDefault();
      if (!keyHitCounts.has(e.code)) {
        keyHitCounts.set(e.code, 0);
        await fireKey(e.code, e.shiftKey, e.ctrlKey);
        startHoldLoop();
      }
    } else {
      await fireKey(e.code, e.shiftKey, e.ctrlKey);
    }
  });

  window.addEventListener('keyup', (e) => {
    // 🌟 松开空格时解除锁定，允许下一次挥锤
    if (e.code === 'Space') {
      isSpaceHeld = false;
      return;
    }

    keyHitCounts.delete(e.code);
    if (!keyHitCounts.size && holdLoopTimer) {
      clearInterval(holdLoopTimer);
      holdLoopTimer = null;
    }
  });

  window.addEventListener('blur', () => {
    isSpaceHeld = false;
    keyHitCounts.clear();
    if (holdLoopTimer) {
      clearInterval(holdLoopTimer);
      holdLoopTimer = null;
    }
  });
}
