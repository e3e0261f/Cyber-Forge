/**
 * 快捷键总控：
 * 1. 空格狂暴连击 (35ms) 与 其他按键 (250ms) 彻底分速独立
 * 2. 阶梯提速算法与频率全部在顶部参数化，随时可调
 */
import { invoke, showToast } from './core.js';
import { applySnap } from './apply.js';
import { sparkAtHead } from './particles.js';

// =========================================================================
// 🎛️ 【核心速度与提速算法配置区 - 随时在此自由修改】
// =========================================================================

// 1. 按键连发基础时间间隔（毫秒）
const SPACE_INTERVAL_MS = 35;          // 🌟 空格键连击间隔（35ms = 每秒约 28 锤，疯狂扫射）
const OTHER_KEYS_INTERVAL_MS = 250;     // 🌟 其他所有按键基础间隔（250ms = 每秒 4 次，稳健起步）

// 2. 阶梯提速算法配置表（基于累计触发点数）
// 规则：当累计点数达到 hitsThreshold 时，单次触发步进升级为 stepSize
const STEP_TIERS = [
  { hitsThreshold: 1000, stepSize: 1000 },  // 触发超过 1000 次后：每次 +1000
{ hitsThreshold: 100,  stepSize: 100 },   // 触发超过 100 次后：每次 +100
{ hitsThreshold: 10,   stepSize: 10 },    // 触发超过 10 次后：每次 +10
{ hitsThreshold: 0,    stepSize: 1 }      // 初始阶段：每次 +1
];

// 3. 不参与长按连发的绝对黑名单
const EXCLUDE_KEYS = new Set([
  'KeyP', 'KeyH', 'Digit0'
]);

// =========================================================================

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

// 记录长按键状态: code -> { hitCount, lastFiredTime, shiftKey, ctrlKey }
const heldKeys = new Map();
let mainLoopTimer = null;
let actionBusy = false;

// 🌟 真正的无上限指数级狂飙算法：每按 10 点，步进直接乘以 10 倍！
function getStepMultiplier(hits) {
  if (hits <= 10) return 1;
  // 11~20: 10, 21~30: 100, 31~40: 1000, 41~50: 10000 ... 无限递增！
  const power = Math.floor((hits - 1) / 10);
  return Math.pow(10, Math.min(power, 15)); // 最高单次可达千万亿级，瞬时结算
}

async function fireKey(code, shiftKey, ctrlKey, hitCount = 1) {
  if (actionBusy && code !== 'Space') return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (code === 'KeyI' && shiftKey) k = 'I';
  if (code === 'KeyO' && shiftKey) k = 'O';

  // 计算当前阶梯倍率（非空格键生效）
  if (code !== 'Space' && !EXCLUDE_KEYS.has(code)) {
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

// 🌟 高精度独立时钟循环（每 10ms 扫描一次各个按键的冷却）
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
      // 区分空格与其它按键的触发间隔
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
    if (e.code === 'Space') {
      e.preventDefault(); // 防止网页滚动
    }

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
    if (e.repeat) return; // 拦截系统慢速重复

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
