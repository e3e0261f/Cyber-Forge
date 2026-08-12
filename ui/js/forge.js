/** 锻造台 Line2：进度条、QTE、矩阵台 × 并发锤 */
import { $ } from './core.js';

const fill = $('fill');
const barLabel = $('barLabel');
const strikesEl = $('strikes');
const qteHits = $('qteHits');
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
  const cols = stations <= 2 ? stations : Math.min(4, Math.ceil(Math.sqrt(stations)));
  box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

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

  for (let si = 0; si < stations; si++) {
    const st = box.children[si];
    if (!st) continue;
    const lanes = st.querySelectorAll('.mh-fill');
    for (let hi = 0; hi < hammers; hi++) {
      const phase = (p + si / stations + hi / (hammers * stations)) % 1;
      if (lanes[hi]) lanes[hi].style.width = (phase * 100).toFixed(1) + '%';
    }
  }
}
