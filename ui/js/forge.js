/** 锻造台 Line2：进度条、QTE、矩阵台 × 并发锤 */
import { $ } from './core.js';

const fill = $('fill');
const barLabel = $('barLabel');
const strikesEl = $('strikes');
const titleQte = $('titleQte'); // 标题上的 QTE 显示元素
const qteHits = $('qteHits');   // 兼容旧 DOM
const anvil = $('anvil');
const anvilGlow = $('anvilGlow');

let stationsBuilt = { stations: 0, hammers: 0 };

export function updateProgress(s) {
  const p = s.progress || 0;
  if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
  if (barLabel) {
    barLabel.textContent = `${(Math.max(0, 1 - p) * (s.interval_secs || 1)).toFixed(1)}s`;
  }
  if (strikesEl) {
    strikesEl.textContent = `${Math.floor(s.sub_strikes || 0)}/${s.max_strikes || 0}`;
  }

  // 将 QTE 数据同步到标题上的 #titleQte 元素中
  if (titleQte) {
    const hits = Number(s.forge_qte_hits || 0).toFixed(1);
    titleQte.textContent = `完美 ${hits}`;
  }
  if (qteHits) {
    qteHits.textContent = `完美 ${Number(s.forge_qte_hits || 0).toFixed(1)}`;
  }

  if (anvil) anvil.classList.toggle('crit-near', !!s.in_crit);
  if (anvilGlow) anvilGlow.style.opacity = s.flash ? '1' : '0';

  const hammers = Math.max(1, s.concurrent_hammers | 0);
  const stations = Math.max(1, s.matrix_slots | 0);
  const tag = $('forgeLayoutTag');
  if (tag) {
    tag.textContent =
    stations > 1 || hammers > 1 ? `台×${stations} · 并发×${hammers}` : '';
  }

  const box = $('forgeStations');
  if (!box) return;

  if (stations <= 1 && hammers <= 1) {
    box.hidden = true;
    if (stationsBuilt.stations) {
      box.innerHTML = '';
      stationsBuilt = { stations: 0, hammers: 0 };
    }
    return;
  }

  box.hidden = false;
  // 优化：如果是 5 个台子，完美排布成 5列
  const cols = stations <= 3 ? stations : (stations === 5 ? 5 : Math.min(4, stations));
  box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  // 如果台数或并发数变了，重新创建 DOM 结构
  if (stationsBuilt.stations !== stations || stationsBuilt.hammers !== hammers) {
    box.innerHTML = '';
    for (let si = 0; si < stations; si++) {
      const st = document.createElement('div');
      st.className = 'forge-station';
      st.innerHTML = `<div class="forge-station-label">锻造台 ${si + 1}</div><div class="mh-lanes"></div>`;
      const lanes = st.querySelector('.mh-lanes');
      for (let hi = 0; hi < hammers; hi++) {
        const lane = document.createElement('div');
        lane.className = 'mh-lane';
        lane.innerHTML = '<div class="mh-fill"></div>';
        lanes.appendChild(lane);
      }
      box.appendChild(st);
    }
    stationsBuilt = { stations, hammers };
  }

  // 🌟 核心修改：将后端传来的真实独立轨道进度 (s.matrix_progresses) 渲染到每一个小条上
  for (let si = 0; si < stations; si++) {
    const st = box.children[si];
    if (!st) continue;
    const lanes = st.querySelectorAll('.mh-fill');
    for (let hi = 0; hi < hammers; hi++) {
      const trackIdx = si * hammers + hi;

      // 从后端快照中读取该轨道的真实进度 (0.0 ~ 1.0)
      const trackProg = s.matrix_progresses && s.matrix_progresses[trackIdx] !== undefined
      ? s.matrix_progresses[trackIdx]
      : 0;

      if (lanes[hi]) {
        lanes[hi].style.width = (Math.min(1, Math.max(0, trackProg)) * 100).toFixed(1) + '%';
      }
    }
  }
}
