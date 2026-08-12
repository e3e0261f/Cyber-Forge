/** 公共工具：DOM、Tauri invoke、格式化、Toast、共享快照 */
export const $ = (id) => document.getElementById(id);

/** 共享最新快照（对象包装，便于跨模块读写） */
export const snap = { current: null };

export function getInvoke() {
  try {
    if (window.__TAURI__?.core?.invoke) {
      return window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
    }
  } catch (_) {}
  return null;
}

export async function invoke(name, args) {
  const fn = getInvoke();
  if (!fn) return null;
  return fn(name, args || {});
}

export function formatNum(val) {
  if (val === undefined || val === null) return '0';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n < 100000) return n.toLocaleString();
  if (n < 1000000) return (n / 1000).toFixed(2) + 'K';
  if (n < 1000000000) return (n / 1000000).toFixed(2) + 'M';
  if (n < 1000000000000) return (n / 1000000000).toFixed(2) + 'B';
  return (n / 1000000000000).toFixed(2) + 'T';
}

export function safeText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}

export function showToast(msg) {
  const toastEl = $('toast');
  if (!msg || !toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1400);
}
