/** 挂机锤：基于通用 cf-toggle + 本地 0 延迟打击感 */
import { invoke } from './core.js';
import { applySnap } from './apply.js';
import { isCurrentlyInCrit, resetLocalCycle, sparkAtHead } from './forge.js';
import { bindToggle } from './toggle.js';

let autoTimer = null;
let striking = false;
const INTERVAL_MS = 120;

async function doAutoStrike() {
  if (striking) return;
  striking = true;
  try {
    // 本地即刻识别暴击并炸出火花
    const isCrit = isCurrentlyInCrit();
    sparkAtHead(isCrit);
    resetLocalCycle();

    const t = await invoke('player_strike');
    if (t) applySnap(t);
  } finally {
    striking = false;
  }
}

function setRunning(on) {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  if (on) {
    autoTimer = setInterval(doAutoStrike, INTERVAL_MS);
    doAutoStrike();
  }
}

export function setupAutoStrike() {
  return bindToggle('#autoStrikeBtn', {
    initial: false,
    hotkey: 'KeyK',
    titleOff: '挂机锤 · 点击开启 (K)',
                    titleOn: '挂机中 · 点击关闭 (K)',
                    onChange: setRunning,
  });
}
