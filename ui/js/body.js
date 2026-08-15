/** 身体素质 Line6 */
import { $ } from './core.js';

let lastBodyKey = '';

export function renderBody(s) {
  const g = $('bodyGrid');
  if (!g) return;
  const key = [
    s.realm_name,
    s.title,
    s.sub_level,
    s.physique,
    s.qi_sense,
    s.spirit,
    s.core_count,
    s.infant_count,
    s.matrix,
    s.concurrent_hammers,
    s.matrix_slots,
    s.iron_slag,
  ].join('|');
  if (key === lastBodyKey) return;
  lastBodyKey = key;

  const row = (k, v) => `<span class="k">${k}</span><span class="v">${v ?? '—'}</span>`;
  const sec = (t) => `<span class="sec">${t}</span>`;
  const n = (x) => (x === 0 || x ? String(x) : '0');
  const title = s.title ? ` · ${s.title}` : '';

  g.innerHTML = [
    //sec(`${s.realm_name || ''} · ${s.sub_level || 1}层${title}`),
    row('本境', s.realm_exp),
    row('下层', s.exp_to_next),
    row('累计', s.cultivation),
    row('机缘', s.god_rate),
    row('铁浆', n(s.iron_slag)),
    row('锤%', ((s.physique || 0) / 10).toFixed(1)),
    sec('炼体/炼气/练神'),
    row('体魄', n(s.physique)),
    row('气感', n(s.qi_sense)),
    row('精神', n(s.spirit)),
    sec('金丹'),
    row('个数', n(s.core_count)),
    row('大小', n(s.core_size)),
    row('凝炼', n(s.core_refine)),
    sec('元婴·单台并发'),
    row('个数', n(s.infant_count)),
    row('强度', n(s.infant_power)),
    row('并发', '×' + (s.concurrent_hammers || 1)),
    sec('化神·锻造台数'),
    row('气机', n(s.qi_machine)),
    row('矩阵', n(s.matrix)),
    row('台数', n(s.matrix_slots || 1)),
    sec('合体/大乘'),
    row('碎片', n(s.law_shards)),
    row('反重力', n(s.anti_gravity)),
    row('因果', n(s.causality)),
  ].join('');
}
