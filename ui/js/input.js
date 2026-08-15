/** 快捷键：空格按住无限狂暴连击 + 全键盘点数阶梯狂飙 */
import { invoke, showToast } from './core.js';
import { applySnap } from './apply.js';
import { sparkAtHead } from './particles.js';

// 🌟 纯单发黑名单（仅保留存档、帮助、调试，空格已被移出并开启无限连击！）
const EXCLUDE_KEYS = new Set([
  'KeyP', 'KeyH', 'Digit0'
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

// 记录按键触发点数
const keyHitCounts = new Map();

let holdLoopTimer = null;
let actionBusy = false;

async function fireKey(code, shiftKey, ctrlKey) {
  if (actionBusy && code !== 'Space') return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (code === 'KeyI' && shiftKey) k = 'I';
  if (code === 'KeyO' && shiftKey) k = 'O';

  // 🌟 非空格按键：执行点数阶梯步进 (+10, +100, +1000)
  let step = 1;
  if (!EXCLUDE_KEYS.has(code) && code !== 'Space') {
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
      // 🌟 空格连发：每次触发直接挥锤，爆出火花和读条推进
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

// 🎛️ 连发心跳速度（35ms = 每秒约 28 锤，极致丝滑）
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
    // 阻止空格等默认行为（防止网页向下滚动）
    if (e.code === 'Space') {
      e.preventDefault();
    }

    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      const t = await invoke('action', { key: 'p' });
      if (t) applySnap(t);
      return;
    }

    if (e.code === 'KeyH') {
      e.preventDefault();
      showToast('【操作指南】按住空格无限狂暴连击！按住 U/W/A/R 等自动阶梯狂飙！');
      return;
    }

    if (!KEY_MAP[e.code]) return;
    if (e.repeat) return; // 忽略操作系统自带的慢速重复

    // 🌟 所有不在黑名单的键（包括 Space）按下即开启连发循环
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
    // 松开任何按键时立即停止该键的连发
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
