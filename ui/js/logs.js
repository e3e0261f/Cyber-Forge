/** 天道纪事·日志 Line8 */
import { $, safeText } from './core.js';

const logList = $('logList');
let logFrozen = false;
let lastLogTail = '';

export function setLogFrozen(v) {
  logFrozen = !!v;
}

export function renderLogs(logs) {
  if (logFrozen || !logList) return;
  const list = logs || [];
  const view = list.length > 50 ? list.slice(-50) : list;
  const tail = view.length ? view[view.length - 1] : '';
  if (tail === lastLogTail && logList.childNodes.length === view.length) return;
  lastLogTail = tail;

  const atBottom =
    logList.scrollHeight - logList.scrollTop - logList.clientHeight < 48;
  const frag = document.createDocumentFragment();
  for (const line of view) {
    const d = document.createElement('div');
    d.textContent = safeText(line);
    frag.appendChild(d);
  }
  logList.replaceChildren(frag);
  if (atBottom) logList.scrollTop = logList.scrollHeight;
}
