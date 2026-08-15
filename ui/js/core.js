/** 公共工具：DOM、Web API Fetch、格式化、Toast、共享快照 */
export const $ = (id) => document.getElementById(id);

export const snap = { current: null };

// 🌟 纯 Web 版 invoke：将所有请求无缝转发到后端的 Actix-web API
export async function invoke(name, args = {}) {
  try {
    let url = '';
    let options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    if (name === 'get_state') {
      options.method = 'GET';
      delete options.headers;
      url = '/api/state';
    } else if (name === 'game_tick') {
      url = '/api/tick';
    } else if (name === 'player_strike') {
      url = '/api/strike';
    } else if (name === 'action') {
      url = '/api/action';
      options.body = JSON.stringify({ key: args.key });
    } else {
      console.warn('[Web API] 未知的调用方法:', name);
      return null;
    }

    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[Web API] 请求失败:', err);
    return null;
  }
}

// 🌟 永远返回 true，解除原先的 Tauri 拦截
export function getInvoke() {
  return true;
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
