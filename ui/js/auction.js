/** 藏宝阁拍卖 Line5 - 性能优化版 */
import { $, safeText } from './core.js';

const lotsEl = $('lots');
let lastLotsKey = '';

export function renderLots(lots) {
  if (!lotsEl) return;
  const list = lots || [];

  // 优化 key 生成：只比对核心数据（名字、现价、倒计时、成交状态）
  const key = list
  .map((l) => `${l.name}|${l.bid}|${l.time}|${l.sold}`)
  .join(';');

  if (key === lastLotsKey) return; // 数据没变，直接跳过渲染！
  lastLotsKey = key;

  if (!list.length) {
    lotsEl.innerHTML =
    '<div class="lot waiting"><div>暂无上架</div><div class="lot-meta">按 [F] 上架</div></div>';
  return;
  }

  // 使用 DocumentFragment 批量渲染，减少页面重排（Reflow）
  const frag = document.createDocumentFragment();
  const maxDisplay = Math.min(list.length, 30); // 限制最多渲染 30 个，防止长列表卡顿

  for (let i = 0; i < maxDisplay; i++) {
    const lot = list[i];
    const d = document.createElement('div');
    d.className =
    'lot' + (lot.sold ? ' sold' : '') + (lot.waiting ? ' waiting' : '');
    const tag = lot.sold ? '[成交] ' : lot.waiting ? '[候场] ' : '[拍中] ';

    // 采用更轻量的内部结构赋值
    d.innerHTML = `<div style="color:${lot.color || '#abc'}">${tag}${safeText(lot.name)}</div>
    <div class="lot-meta">现价 ${safeText(lot.bid)} · 估价 ${safeText(lot.fair)} · ×${lot.bids} · ${
      lot.waiting ? '暂停' : lot.time + 's'
    }</div>`;

    frag.appendChild(d);
  }
  lotsEl.replaceChildren(frag);
}
