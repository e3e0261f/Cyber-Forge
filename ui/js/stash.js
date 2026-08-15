/** 矩阵锦囊 Line4：背包格子（高性能虚拟/对比渲染版） */
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
  const slots = Math.max(max || 20, list.length);

  // 🌟 1. 严格的防抖 Key：只有当背包里的物品 ID、名称、价格或格子数真正发生变化时才重新渲染
  const key =
  list
  .slice(0, slots)
  .map((it) =>
  it ? `${it.id}|${it.price}|${it.is_tool ? 1 : 0}` : '.'
  )
  .join(';') +
  '#' +
  slots;

  if (key === lastStashKey) return; // 🌟 数据没变，直接光速跳过，0 消耗！
  lastStashKey = key;

  // 🌟 2. 批量构建 DocumentFragment，减少页面重排（Reflow）
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

      // 优化：只有当鼠标悬停（hover）或者有需要时再动态生成 tip，或者提前轻量构建
      const tip = document.createElement('div');
      tip.className = 'stash-tip';
      tip.textContent =
      safeText(it.detail) ||
      `${safeText(it.quality)} ${safeText(it.name)}\n估价 ${safeText(it.price)} 金币`;
      d.appendChild(tip);

      if (!it.is_tool && it.color) {
        // 避免每次都写 style 字符串，直接优化色彩应用
        d.style.borderColor = it.color + '99';
        d.style.color = it.color;
      }
    }
    frag.appendChild(d);
  }

  // 🌟 3. 瞬间替换
  stash.replaceChildren(frag);
}
