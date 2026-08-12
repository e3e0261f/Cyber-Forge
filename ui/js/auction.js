/** 藏宝阁拍卖 Line5 */
import { $, safeText } from './core.js';

const lotsEl = $('lots');
let lastLotsKey = '';

export function renderLots(lots) {
  if (!lotsEl) return;
  const list = lots || [];
  const key = list
    .map((l) => `${l.name}|${l.bid}|${l.time}|${l.waiting}|${l.sold}`)
    .join(';');
  if (key === lastLotsKey) return;
  lastLotsKey = key;

  if (!list.length) {
    lotsEl.innerHTML =
      '<div class="lot waiting"><div>暂无上架</div><div class="lot-meta">按 [F] 上架</div></div>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < Math.min(list.length, 40); i++) {
    const lot = list[i];
    const d = document.createElement('div');
    d.className =
      'lot' + (lot.sold ? ' sold' : '') + (lot.waiting ? ' waiting' : '');
    const tag = lot.sold ? '[成交] ' : lot.waiting ? '[候场] ' : '[拍中] ';
    d.innerHTML = `<div style="color:${lot.color || '#abc'}">${tag}${safeText(lot.name)}</div>
    <div class="lot-meta">现价 ${safeText(lot.bid)} · 估价 ${safeText(lot.fair)} · ×${lot.bids} · ${
      lot.waiting ? '暂停' : lot.time + 's'
    }</div>`;
    frag.appendChild(d);
  }
  lotsEl.replaceChildren(frag);
}
