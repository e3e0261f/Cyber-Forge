/** 总调度：把后端快照应用到各窗口 */
import { snap, showToast } from './core.js';
import { updateProgress } from './forge.js';
import { renderStash } from './stash.js';
import { renderLots } from './auction.js';
import { renderLogs } from './logs.js';
import { renderBody } from './body.js';
import { updateApprentice } from './apprentice.js';
import {
  updateCurrency,
  updateLevel,
  updateTitles,
  updateBottomBar,
} from './status.js';
import { sparkAtHead } from './particles.js';

export function applySnap(s) {
  if (!s) return;
  const prev = snap.current;
  snap.current = s;

  updateProgress(s);
  updateCurrency(s);
  updateLevel(s);
  updateTitles(s);
  updateApprentice(s);
  updateBottomBar(s);

  renderBody(s);
  renderStash(s.backpack, s.max_backpack);
  renderLots(s.lots);
  renderLogs(s.logs);

  if (s.toast && (!prev || prev.toast !== s.toast)) showToast(s.toast);
  if (s.flash && (!prev || !prev.flash)) sparkAtHead(true);
}
