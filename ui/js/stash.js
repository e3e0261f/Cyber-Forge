/** 矩阵锦囊 Line4：背包格子 */
import { $, safeText } from './core.js';

const stash = $('stash');
let lastStashKey = '';

function cellLabel(it) {
  if (!it) return '·';
  if (it.is_tool) return '锤';
  let g = safeText(it.glyph || '');
  g = g.replace(/[\[\]【】]/g, '');
  if (g && g !== '?' && g !== '') return g.slice(0, 2);
  const name = safeText(it.name);
  if (name) return name.slice(0, 1);
  return '物';
}

export function renderStash(items, max) {
  if (!stash) return;
  const list = items || [];
  const slots = Math.max(max || 10, list.length);
  const key =
    list
      .slice(0, slots)
      .map((it) =>
        it ? `${it.id}|${safeText(it.name)}|${it.price}|${it.is_tool ? 1 : 0}` : '.'
      )
      .join(';') +
    '#' +
    slots;
  if (key === lastStashKey) return;
  lastStashKey = key;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < slots; i++) {
    const it = list[i];
    const d = document.createElement('div');
    if (!it) {
      d.className = 'cell empty';
      d.textContent = '·';
    } else {
      d.className = 'cell' + (it.is_tool ? ' tool' : '');
      d.textContent = cellLabel(it);
      const tip = document.createElement('div');
      tip.className = 'stash-tip';
      tip.textContent =
        safeText(it.detail) ||
        `${safeText(it.quality)} ${safeText(it.name)}\n估价 ${safeText(it.price)} 金币`;
      d.appendChild(tip);
      if (!it.is_tool && it.color) {
        d.style.borderColor = it.color + '99';
        d.style.color = it.color;
      }
    }
    frag.appendChild(d);
  }
  stash.replaceChildren(frag);
}
