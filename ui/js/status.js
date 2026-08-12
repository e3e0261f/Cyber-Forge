/** 资财仪盘、铁匠信息、各面板标题、底部 Line7 */
import { $, formatNum } from './core.js';

export function updateCurrency(s) {
  const copper = $('copperText') || $('copper');
  if (copper) copper.textContent = formatNum(s.copper);

  const coins = $('goldText') || $('coinsText') || $('coins');
  if (coins) coins.textContent = formatNum(s.coins);

  const jade = $('jadeText') || $('jade');
  if (jade) jade.textContent = formatNum(s.jade);
}

export function updateLevel(s) {
  const lv = $('levelText') || $('level');
  if (lv) lv.textContent = 'LV.' + (s.level || 1);

  const expFill = $('expFill');
  if (expFill) {
    expFill.style.width =
      ((s.max_exp > 0 ? s.exp / s.max_exp : 0) * 100).toFixed(1) + '%';
  }
  const expText = $('expText');
  if (expText) expText.textContent = `${s.exp || 0}/${s.max_exp || 0}`;
}

export function updateTitles(s) {
  const hammers = s.concurrent_hammers || 1;
  const stations = s.matrix_slots || 1;

  const t2 =
    `【锻造台】${s.hammer_name} (Lv.${s.hammer_level} · ${s.hammer_power}) [U]·金${s.cost_hammer || '?'} [W]·金${s.cost_bellows || '?'}` +
    (stations > 1 || hammers > 1 ? ` · 台×${stations} 并发×${hammers}` : '');
  const line2 = $('line2Title');
  if (line2 && line2.textContent !== t2) line2.textContent = t2;

  const t4 = `【矩阵锦囊】${(s.backpack || []).length}/${s.max_backpack} [D]·金${s.cost_backpack || '?'}`;
  const line4 = $('line4Title');
  if (line4 && line4.textContent !== t4) line4.textContent = t4;

  const th = s.auctioneer_threads || 1;
  const t5 = `【藏宝阁】${(s.lots || []).length}/${s.max_pavilion} 拍${s.auction_workers || 0}/${th}席 [E]·金${s.cost_pavilion || '?'}`;
  const line5 = $('line5Title');
  if (line5 && line5.textContent !== t5) line5.textContent = t5;

  const bot = `云集${s.swarm_present || 0} · 席${th} · 机缘 ${s.god_rate}`;
  const line5Bottom = $('line5Bottom');
  if (line5Bottom && line5Bottom.textContent !== bot) line5Bottom.textContent = bot;

  const t6 = `【身体素质】${s.realm_name || ''} ${s.sub_level || 1}层`;
  const line6 = $('line6Title');
  if (line6 && line6.textContent !== t6) line6.textContent = t6;
}

export function updateBottomBar(s) {
  const mt = $('meltTier');
  if (mt) {
    mt.textContent = `[T]熔炼 ${s.melt_tier}`;
    mt.style.color = s.melt_color || '';
  }
  const lt = $('listTier');
  if (lt) {
    lt.textContent = `[G]上架 ${s.list_tier}`;
    lt.style.color = s.list_color || '';
  }
  const bh = $('breakHint');
  if (bh) {
    bh.textContent = s.pending_breakthrough
      ? '⚡[B]可突破'
      : `[B]突破(${s.sub_level || 1}/10)`;
  }
  const news = $('news');
  if (news) news.textContent = '杂闻：' + (s.market_news || '—');
}
