/** 天道纪事·日志 Line8 - 实时流畅版 */
import { $, safeText } from './core.js';

const logList = $('logList');
let logFrozen = false;
let lastTailText = ''; // 改为比对最后一条日志的内容

export function setLogFrozen(v) {
  logFrozen = !!v;
}

export function renderLogs(logs) {
  if (logFrozen || !logList) return;
  const list = logs || [];
  if (list.length === 0) return;

  // 获取当前最新的最后一条日志内容
  const currentTail = list[list.length - 1];

  // 如果最后一条日志的内容和上次完全一样，说明没有产生新日志，直接跳过以节省 CPU
  if (currentTail === lastTailText && logList.childNodes.length === Math.min(list.length, 60)) {
    return;
  }
  lastTailText = currentTail;

  const atBottom =
  logList.scrollHeight - logList.scrollTop - logList.clientHeight < 48;

  // 始终渲染最近的 60 条日志
  const view = list.length > 60 ? list.slice(-60) : list;

  const frag = document.createDocumentFragment();
  for (const line of view) {
    const d = document.createElement('div');
    d.textContent = safeText(line);
    frag.appendChild(d);
  }

  // 瞬间替换
  logList.replaceChildren(frag);

  // 如果原本在底部，自动滚动到最新一行
  if (atBottom) {
    logList.scrollTop = logList.scrollHeight;
  }
}
