/** 快捷键：双轨防误触 + 默认全键盘阶梯步进（仅少数黑名单除外） */
import { invoke, showToast } from './core.js';
import { applySnap } from './apply.js';
import { sparkAtHead } from './particles.js';

// 🌟 1. 极小的黑名单：只有少数“绝对不能长按连发”的键才需要放这里
// 比如空格（挥锤需要精确节奏）、存档、帮助等
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

// 记录每一个按键当前连续触发了多少“点数（次数）”
const keyHitCounts = new Map();

let holdLoopTimer = null;
let actionBusy = false;

async function fireKey(code, shiftKey, ctrlKey) {
  if (actionBusy && code !== 'Space') return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (code === 'KeyI' && shiftKey) k = 'I';
  if (code === 'KeyO' && shiftKey) k = 'O';

  // 🌟 2. 默认全键盘自动阶梯步进（只要不在黑名单里）
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

    // 针对学徒岗位（1-5）
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
      if (ctrlKey) k = k + '_100';
      else if (shiftKey) k = k + '_10';
      else if (step > 1) k = `${k}_${step}`;
    }
    // 🌟 核心：任何其他字母键（u, w, a, r, d, e, i, I, o, O 等）如果支持批量，自动带上阶梯后缀！
    else if (step > 1) {
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

// 🎛️ 连发心跳速度调节（毫秒）
const HOLD_INTERVAL_MS = 250;

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
    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      const t = await invoke('action', { key: 'p' });
      if (t) applySnap(t);
      return;
    }
    if (e.code === 'KeyH') {
      e.preventDefault();
      showToast('【全键盘默认加速】按住任意键不放：自动实现 10点->100点->1000点 阶梯狂飙！');
      return;
    }

    if (!KEY_MAP[e.code]) return;
    if (e.repeat) return; // 忽略系统慢速重复

    // 🌟 3. 只要不在黑名单里，全部默认自动开启长按连发与阶梯步进！
    if (!EXCLUDE_KEYS.has(e.code)) {
      e.preventDefault();
      if (!keyHitCounts.has(e.code)) {
        keyHitCounts.set(e.code, 0);
        await fireKey(e.code, e.shiftKey, e.ctrlKey);
        startHoldLoop();
      }
    } else {
      if (e.code === 'Space') e.preventDefault();
      await fireKey(e.code, e.shiftKey, e.ctrlKey);
    }
  });

  window.addEventListener('keyup', (e) => {
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
