/** 快捷键：双轨防误触 + Shift/Ctrl 批量调配 + 长按连发 */
import { invoke, showToast } from './core.js';
import { applySnap } from './apply.js';
import { sparkAtHead } from './particles.js';

const FAST_HOLD = new Set(['Space', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']);
const FAST_DELAY = 100;
const SLOW_DELAY = 200;

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

const held = new Set();
let holdTimer = null;
let actionBusy = false;
const lastKeyTimes = {};

async function fireKey(code, shiftKey = false, ctrlKey = false) {
  if (actionBusy) return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (code === 'KeyI' && shiftKey) k = 'I';
  if (code === 'KeyO' && shiftKey) k = 'O';

  // 1~5：Shift 调 10 人，Ctrl 调 100 人（后端若未识别 _10/_100 则静默忽略）
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
    if (ctrlKey) k = k + '_100';
    else if (shiftKey) k = k + '_10';
  }

  const now = performance.now();
  const last = lastKeyTimes[code] || 0;
  const minDelay = FAST_HOLD.has(code) ? FAST_DELAY : SLOW_DELAY;
  if (now - last < minDelay) return;
  lastKeyTimes[code] = now;

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

function startHoldLoop() {
  if (holdTimer) return;
  holdTimer = setInterval(async () => {
    if (!held.size) {
      clearInterval(holdTimer);
      holdTimer = null;
      return;
    }
    for (const code of [...held]) await fireKey(code, false, false);
  }, 30);
}

export function setupInput() {
  window.addEventListener('keydown', async (e) => {
    // Ctrl+S 存档
    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      const t = await invoke('action', { key: 'p' });
      if (t) applySnap(t);
      return;
    }
    // H 帮助
    if (e.code === 'KeyH') {
      e.preventDefault();
      showToast('Shift+1~5 调配10人 · Ctrl+1~5 调配100人');
      return;
    }
    if (!KEY_MAP[e.code]) return;
    e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
    await fireKey(e.code, e.shiftKey, e.ctrlKey);
    startHoldLoop();
  });

  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (!held.size && holdTimer) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
  });

  window.addEventListener('blur', () => {
    held.clear();
    if (holdTimer) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
  });
}
