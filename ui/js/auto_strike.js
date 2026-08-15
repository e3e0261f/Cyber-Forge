/** 挂机锤：基于通用 cf-toggle */
import { invoke } from './core.js';
import { applySnap } from './apply.js';
import { sparkAtHead } from './particles.js';
import { bindToggle } from './toggle.js';

let autoTimer = null;
let striking = false;
const INTERVAL_MS = 120;

async function doAutoStrike() {
  if (striking) return;
  striking = true;
  try {
    const t = await invoke('player_strike');
    if (t) {
      applySnap(t);
      sparkAtHead(!!t.in_crit);
    }
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
