/** 快捷键：双轨防误触 + 基于触发点数的阶梯步进加速（除空格外全键盘通用） */
import { invoke, showToast } from './core.js';
import { applySnap } from './apply.js';
import { sparkAtHead } from './particles.js';

// 🌟 1. 允许长按连发的按键（除了 Space 以外，所有升级、建造、调配键全包了）
const HOLDABLE_KEYS = new Set([
  'KeyU', 'KeyW', 'KeyA', 'KeyR', 'KeyD', 'KeyE',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5' // 确保这里有数字键
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

// 记录每一个按键当前连续触发了多少“点数（次数）”
const keyHitCounts = new Map();

let holdLoopTimer = null;
let actionBusy = false;

async function fireKey(code, shiftKey, ctrlKey) {
  // 空格（挥锤）允许稍微高频，其他升级动作防冲突
  if (actionBusy && code !== 'Space') return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (code === 'KeyI' && shiftKey) k = 'I';
  if (code === 'KeyO' && shiftKey) k = 'O';

  // 🌟 1~5 与 A、U、W 等键完全同构：统一享受基于点数的阶梯步进算法
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
    let currentHits = (keyHitCounts.get(code) || 0) + 1;
    keyHitCounts.set(code, currentHits);

    let step = 1;
    if (currentHits > 1000) {
      step = 1000;
    } else if (currentHits > 100) {
      step = 100;
    } else if (currentHits > 10) {
      step = 10;
    } else {
      step = 1;
    }

    // 将岗位类型（1-5）与阶梯步进（如 1_10, 2_100）拼装传给后端
    if (step > 1) {
      k = `${k}_${step}`;
    }
  }

  // 🌟 2. 核心点数阶梯逻辑：计算当前按键的累计触发点数
  let step = 1;
  if (code !== 'Space') {
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

    // 针对升级类按键（u, w, a, r, d, e），将步进拼装为后端支持的后缀（如 u_10, u_100...）
    if (['u', 'w', 'a', 'r', 'd', 'e'].includes(k) && step > 1) {
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

// 连发循环心跳（35ms - 40ms 保证跟手且丝滑）
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
  }, 35);
}

export function setupInput() {
  window.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      const t = await invoke('action', { key: 'p' });
      if (t) applySnap(t);
      return;
    }
    if (e.code === 'KeyH') {
      e.preventDefault();
      showToast('【阶梯步进】按住 U/W/A/R/D/E 不放：10点(+1) -> 100点(+10) -> 1000点(+100)');
      return;
    }

    if (!KEY_MAP[e.code]) return;
    if (e.repeat) return; // 忽略系统自带的慢速重复

    // 如果是允许长按的键（且不是空格）
    if (HOLDABLE_KEYS.has(e.code)) {
      e.preventDefault();
      if (!keyHitCounts.has(e.code)) {
        keyHitCounts.set(e.code, 0); // 初始化点数
        await fireKey(e.code, e.shiftKey, e.ctrlKey);
        startHoldLoop();
      }
    } else {
      // 空格或其他单次触发键
      if (e.code === 'Space') e.preventDefault();
      await fireKey(e.code, e.shiftKey, e.ctrlKey);
    }
  });

  window.addEventListener('keyup', (e) => {
    // 🌟 松开按键时，清空该按键的点数计数器，下次按下从 +1 重新开始
    keyHitCounts.delete(e.code);
    if (!keyHitCounts.size && holdLoopTimer) {
      clearInterval(holdLoopTimer);
      holdLoopTimer = null;
    }
  });

  window.addEventListener('blur', () => {
    keyHitCounts.clear();
    if (holdLoopTimer) {
      clearInterval(holdLoopTimer);
      holdLoopTimer = null;
    }
  });
}
