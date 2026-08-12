/** 铁匠铺学徒 Line3：岗位人数 */
import { $ } from './core.js';

let lastApprKey = '';

export function updateApprentice(s) {
  const t3 = `【铁匠铺】学徒 ${s.apprentices}/${s.max_apprentices} [A]·金${s.cost_hire || '?'} [R]·金${s.cost_house || '?'}`;
  const title = $('line3Title');
  if (title && title.textContent !== t3) title.textContent = t3;

  const apprKey = [
    s.sharpen_workers,
    s.enchant_workers,
    s.repair_workers,
    s.forge_workers,
    s.auction_workers,
  ].join(',');
  if (apprKey === lastApprKey) return;
  lastApprKey = apprKey;

  const set = (id, n) => {
    const e = $(id);
    if (e) e.textContent = String(n || 0);
  };
  set('jobSharpen', s.sharpen_workers);
  set('jobEnchant', s.enchant_workers);
  set('jobRepair', s.repair_workers);
  set('jobForge', s.forge_workers);
  set('jobAuction', s.auction_workers);
}
