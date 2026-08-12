/** 完整前端：矩阵台×并发锤 + 分层连发 + 背包防乱码 + 高度自适应 + 三体货币金融 + 双轨按键精准控速 */
const $ = (id) => document.getElementById(id);
const fill = $('fill');
const barLabel = $('barLabel');
const strikesEl = $('strikes');
const qteHits = $('qteHits');
const stash = $('stash');
const lotsEl = $('lots');
const logList = $('logList');
const canvas = $('sparks');
const ctx = canvas ? canvas.getContext('2d') : null;
const anvil = $('anvil');
const anvilGlow = $('anvilGlow');
const toastEl = $('toast');

let particles = [];
let lastSnap = null;
let logFrozen = false;
let lastLogTail = '', lastStashKey = '', lastLotsKey = '', lastBodyKey = '', lastApprKey = '';
let stationsBuilt = { stations: 0, hammers: 0 };

function getInvoke() {
  try {
    if (window.__TAURI__?.core?.invoke) return window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
  } catch (_) {}
  return null;
}
async function invoke(name, args) {
  const fn = getInvoke();
  if (!fn) return null;
  return fn(name, args || {});
}

function formatNum(val) {
  if (val === undefined || val === null) return '0';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n < 100000) return n.toLocaleString();
  if (n < 1000000) return (n / 1000).toFixed(2) + 'K';
  if (n < 1000000000) return (n / 1000000).toFixed(2) + 'M';
  if (n < 1000000000000) return (n / 1000000000).toFixed(2) + 'B';
  return (n / 1000000000000).toFixed(2) + 'T';
}

function resize() {
  if (!anvil || !canvas || !ctx) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.25);
  canvas.width = Math.max(1, anvil.clientWidth * dpr);
  canvas.height = Math.max(1, anvil.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

function sparkAtHead(crit) {
  if (!anvil || !ctx || particles.length > 32) return;
  const w = anvil.clientWidth, h = anvil.clientHeight;
  const p = lastSnap ? lastSnap.progress : 0.5;
  const x = w * (0.06 + 0.88 * Math.min(0.98, Math.max(0.02, p)));
  const y = h * 0.42;
  const n = crit ? 10 : 5;
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.15;
    const spd = (crit ? 2.4 : 1.4) + Math.random() * 2;
    particles.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                   life: 1, crit, size: crit ? 2 + Math.random() : 1.2 + Math.random(),
    });
  }
}

function showToast(msg) {
  if (!msg || !toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

function safeText(s) {
  if (s == null) return '';
  return String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .trim();
}

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

function updateProgress(s) {
  const p = s.progress || 0;
  if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
  if (barLabel) barLabel.textContent = `${(Math.max(0, 1 - p) * (s.interval_secs || 1)).toFixed(1)}s`;
  if (strikesEl) strikesEl.textContent = `${Math.floor(s.sub_strikes || 0)}/${s.max_strikes || 0}`;
  if (qteHits) qteHits.textContent = `完美 ${Number(s.forge_qte_hits || 0).toFixed(1)}`;
  if (anvil) anvil.classList.toggle('crit-near', !!s.in_crit);
  if (anvilGlow) anvilGlow.style.opacity = s.flash ? '1' : '0';

  const hammers = Math.max(1, s.concurrent_hammers | 0);
  const stations = Math.max(1, s.matrix_slots | 0);
  const tag = $('forgeLayoutTag');
  if (tag) {
    tag.textContent = (stations > 1 || hammers > 1) ? `台×${stations} · 并发×${hammers}` : '';
  }

  const box = $('forgeStations');
  if (!box) return;
  if (stations <= 1 && hammers <= 1) {
    box.hidden = true;
    if (stationsBuilt.stations) { box.innerHTML = ''; stationsBuilt = { stations: 0, hammers: 0 }; }
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

function renderStash(items, max) {
  if (!stash) return;
  const list = items || [];
  const slots = Math.max(max || 10, list.length);
  const key = list.slice(0, slots).map((it) =>
  it ? `${it.id}|${safeText(it.name)}|${it.price}|${it.is_tool ? 1 : 0}` : '.'
  ).join(';') + '#' + slots;
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
      tip.textContent = safeText(it.detail) ||
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

function renderLots(lots) {
  if (!lotsEl) return;
  const list = lots || [];
  const key = list.map((l) => `${l.name}|${l.bid}|${l.time}|${l.waiting}|${l.sold}`).join(';');
  if (key === lastLotsKey) return;
  lastLotsKey = key;
  if (!list.length) {
    lotsEl.innerHTML = '<div class="lot waiting"><div>暂无上架</div><div class="lot-meta">按 [F] 上架</div></div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (let i = 0; i < Math.min(list.length, 40); i++) {
    const lot = list[i];
    const d = document.createElement('div');
    d.className = 'lot' + (lot.sold ? ' sold' : '') + (lot.waiting ? ' waiting' : '');
    const tag = lot.sold ? '[成交] ' : lot.waiting ? '[候场] ' : '[拍中] ';
    d.innerHTML = `<div style="color:${lot.color || '#abc'}">${tag}${safeText(lot.name)}</div>
    <div class="lot-meta">现价 ${safeText(lot.bid)} · 估价 ${safeText(lot.fair)} · ×${lot.bids} · ${lot.waiting ? '暂停' : lot.time + 's'}</div>`;
    frag.appendChild(d);
  }
  lotsEl.replaceChildren(frag);
}

function renderLogs(logs) {
  if (logFrozen || !logList) return;
  const list = logs || [];
  const view = list.length > 50 ? list.slice(-50) : list;
  const tail = view.length ? view[view.length - 1] : '';
  if (tail === lastLogTail && logList.childNodes.length === view.length) return;
  lastLogTail = tail;
  const atBottom = logList.scrollHeight - logList.scrollTop - logList.clientHeight < 48;
  const frag = document.createDocumentFragment();
  for (const line of view) {
    const d = document.createElement('div');
    d.textContent = safeText(line);
    frag.appendChild(d);
  }
  logList.replaceChildren(frag);
  if (atBottom) logList.scrollTop = logList.scrollHeight;
}

function renderBody(s) {
  const g = $('bodyGrid');
  if (!g) return;
  const key = [s.realm_name, s.sub_level, s.physique, s.qi_sense, s.spirit, s.core_count, s.infant_count, s.matrix, s.concurrent_hammers, s.matrix_slots, s.iron_slag].join('|');
  if (key === lastBodyKey) return;
  lastBodyKey = key;
  const row = (k, v) => `<span class="k">${k}</span><span class="v">${v ?? '—'}</span>`;
  const sec = (t) => `<span class="sec">${t}</span>`;
  const n = (x) => (x === 0 || x ? String(x) : '0');
  g.innerHTML = [
    sec(`${s.realm_name || ''} · ${s.sub_level || 1}层`),
    row('本境', s.realm_exp), row('下层', s.exp_to_next), row('累计', s.cultivation),
    row('机缘', s.god_rate), row('铁浆', n(s.iron_slag)), row('锤%', ((s.physique || 0) / 10).toFixed(1)),
    sec('炼体/炼气/练神'),
    row('体魄', n(s.physique)), row('气感', n(s.qi_sense)), row('精神', n(s.spirit)),
    sec('金丹'),
    row('个数', n(s.core_count)), row('大小', n(s.core_size)), row('凝炼', n(s.core_refine)),
    sec('元婴·单台并发'),
    row('个数', n(s.infant_count)), row('强度', n(s.infant_power)), row('并发', '×' + (s.concurrent_hammers || 1)),
    sec('化神·锻造台数'),
    row('气机', n(s.qi_machine)), row('矩阵', n(s.matrix)), row('台数', n(s.matrix_slots || 1)),
    sec('合体/大乘'),
    row('碎片', n(s.law_shards)), row('反重力', n(s.anti_gravity)), row('因果', n(s.causality)),
  ].join('');
}

function applySnap(s) {
  if (!s) return;
  const prev = lastSnap;
  lastSnap = s;
  updateProgress(s);

  const copper = $('copperText') || $('copper');
  if (copper) copper.textContent = formatNum(s.copper);

  const coins = $('goldText') || $('coinsText') || $('coins');
  if (coins) coins.textContent = formatNum(s.coins);

  const jade = $('jadeText') || $('jade');
  if (jade) jade.textContent = formatNum(s.jade);

  const lv = $('levelText') || $('level');
  if (lv) lv.textContent = 'LV.' + (s.level || 1);

  const expFill = $('expFill');
  if (expFill) expFill.style.width = ((s.max_exp > 0 ? s.exp / s.max_exp : 0) * 100).toFixed(1) + '%';
  const expText = $('expText');
  if (expText) expText.textContent = `${s.exp || 0}/${s.max_exp || 0}`;

  const hammers = s.concurrent_hammers || 1;
  const stations = s.matrix_slots || 1;
  const t2 = `【锻造台】${s.hammer_name} (Lv.${s.hammer_level} · ${s.hammer_power}) [U]·金${s.cost_hammer || '?'} [W]·金${s.cost_bellows || '?'}` +
  ((stations > 1 || hammers > 1) ? ` · 台×${stations} 并发×${hammers}` : '');
  if ($('line2Title') && $('line2Title').textContent !== t2) $('line2Title').textContent = t2;

  const t3 = `【铁匠铺】学徒 ${s.apprentices}/${s.max_apprentices} [A]·金${s.cost_hire || '?'} [R]·金${s.cost_house || '?'}`;
  if ($('line3Title') && $('line3Title').textContent !== t3) $('line3Title').textContent = t3;
  const apprKey = [s.sharpen_workers, s.enchant_workers, s.repair_workers, s.forge_workers, s.auction_workers].join(',');
  if (apprKey !== lastApprKey) {
    lastApprKey = apprKey;
    const set = (id, n) => { const e = $(id); if (e) e.textContent = String(n || 0); };
    set('jobSharpen', s.sharpen_workers); set('jobEnchant', s.enchant_workers);
    set('jobRepair', s.repair_workers); set('jobForge', s.forge_workers); set('jobAuction', s.auction_workers);
  }

  if ($('line4Title')) {
    const t4 = `【矩阵锦囊】${(s.backpack || []).length}/${s.max_backpack} [D]·金${s.cost_backpack || '?'}`;
    if ($('line4Title').textContent !== t4) $('line4Title').textContent = t4;
  }
  const th = s.auctioneer_threads || 1;
  const t5 = `【藏宝阁】${(s.lots || []).length}/${s.max_pavilion} 拍${s.auction_workers || 0}/${th}席 [E]·金${s.cost_pavilion || '?'}`;
  if ($('line5Title') && $('line5Title').textContent !== t5) $('line5Title').textContent = t5;
  const bot = `云集${s.swarm_present || 0} · 席${th} · 机缘 ${s.god_rate}`;
  if ($('line5Bottom') && $('line5Bottom').textContent !== bot) $('line5Bottom').textContent = bot;

  const t6 = `【身体素质】${s.realm_name || ''} ${s.sub_level || 1}层`;
  if ($('line6Title') && $('line6Title').textContent !== t6) $('line6Title').textContent = t6;

  renderBody(s); renderStash(s.backpack, s.max_backpack); renderLots(s.lots); renderLogs(s.logs);

  const mt = $('meltTier'); if (mt) { mt.textContent = `[T]熔炼 ${s.melt_tier}`; mt.style.color = s.melt_color || ''; }
  const lt = $('listTier'); if (lt) { lt.textContent = `[G]上架 ${s.list_tier}`; lt.style.color = s.list_color || ''; }
  const bh = $('breakHint'); if (bh) bh.textContent = s.pending_breakthrough ? '⚡[B]可突破' : `[B]突破(${s.sub_level || 1}/10)`;
  const news = $('news'); if (news) news.textContent = '杂闻：' + (s.market_news || '—');

  if (s.toast && (!prev || prev.toast !== s.toast)) showToast(s.toast);
  if (s.flash && (!prev || !prev.flash)) sparkAtHead(true);
}

/* 快捷键双轨防误触与 1/10/100 批量分派 */
const FAST_HOLD = new Set(['Space', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']);
const FAST_DELAY = 100;
const SLOW_DELAY = 200;

const KEY_MAP = {
  Space: 'strike',
  KeyU: 'u', KeyW: 'w', KeyA: 'a', KeyR: 'r', KeyD: 'd', KeyE: 'e',
  KeyT: 't', KeyG: 'g', KeyF: 'f', KeyS: 's', KeyB: 'b',
  KeyI: 'i', KeyO: 'o',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', KeyP: 'p',
};

// 全局记录按键开始时间 // 全局记录按键开始时间
let keyStartTime = {};

window.addEventListener('keydown', async (e) => {
  if (!KEY_MAP[e.code]) return;

  // 记录按键起始时间，用于计算长按增量
  if (!keyStartTime[e.code]) keyStartTime[e.code] = performance.now();

  e.preventDefault();
  const duration = performance.now() - keyStartTime[e.code];

  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
    const k = KEY_MAP[e.code];
    // 发送按键及其持续时间给后端进行动态增量计算
    const t = await invoke('reassign', { job: parseInt(k), duration: duration });
    if (t) applySnap(t);
  } else {
    await fireKey(e.code);
  }
});

window.addEventListener('keyup', (e) => {
  delete keyStartTime[e.code]; // 松开按键清空计时
  held.delete(e.code);
});
// 全局记录按键开始时间 // 全局记录按键开始时间
const held = new Set();
let holdTimer = null;
let actionBusy = false;
let lastKeyTimes = {};

async function fireKey(code, shiftKey = false, ctrlKey = false) {
  if (actionBusy) return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (code === 'KeyI' && shiftKey) k = 'I';
  if (code === 'KeyO' && shiftKey) k = 'O';

  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
    if (ctrlKey) {
      k = k + '_100';
    } else if (shiftKey) {
      k = k + '_10';
    }
  }

  const now = performance.now();
  const last = lastKeyTimes[code] || 0;
  const minDelay = FAST_HOLD.has(code) ? FAST_DELAY : SLOW_DELAY;

  if (now - last < minDelay) return;
  lastKeyTimes[code] = now;

  actionBusy = true;
  try {
    if (k === 'strike') {
      const t = await invoke('player_strike');
      if (t) { applySnap(t); sparkAtHead(!!t.in_crit); }
    } else {
      const t = await invoke('action', { key: k });
      if (t) applySnap(t);
    }
  } finally { actionBusy = false; }
}

function startHoldLoop() {
  if (holdTimer) return;
  holdTimer = setInterval(async () => {
    if (!held.size) { clearInterval(holdTimer); holdTimer = null; return; }
    for (const code of [...held]) await fireKey(code, false, false);
  }, 30);
}

window.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.code === 'KeyS') {
    e.preventDefault();
    const t = await invoke('action', { key: 'p' });
    if (t) applySnap(t);
    return;
  }
  if (e.code === 'KeyH') {
    e.preventDefault();
    showToast('Shift+1~5 调配10人 · Ctrl+1~5 调配100人');
    return;
  }
  if (!KEY_MAP[e.code]) return;
  e.preventDefault();
  if (e.repeat) return;
  held.add(e.code);
  await fireKey(e.code, e.shiftKey, e.ctrlKey);
  startHoldLoop();
});
window.addEventListener('keyup', (e) => {
  held.delete(e.code);
  if (!held.size && holdTimer) { clearInterval(holdTimer); holdTimer = null; }
});
window.addEventListener('blur', () => {
  held.clear();
  if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
});

function frame() {
  if (particles.length && ctx && anvil) {
    ctx.clearRect(0, 0, anvil.clientWidth, anvil.clientHeight);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12;
      p.life -= p.crit ? 0.03 : 0.04;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const a = Math.max(0, p.life);
      ctx.beginPath();
      ctx.fillStyle = p.crit ? `rgba(255,${130 + (a * 90) | 0},180,${a})` : `rgba(255,${170 + (a * 50) | 0},70,${a})`;
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(async function boot() {
  if (!getInvoke()) return;
  const s = await invoke('get_state');
  if (s) applySnap(s);
  setInterval(async () => {
    const t = await invoke('game_tick');
    if (t) applySnap(t);
  }, 150);
})();
