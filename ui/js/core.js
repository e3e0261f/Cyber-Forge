/** 公共工具：DOM、Web API Fetch、格式化、Toast、共享快照 */
export const $ = (id) => document.getElementById(id);
export const snap = { current: null };

import { auth } from './auth.js';

export function setupAuthUI() {
    const authBtn = document.createElement('div');
    authBtn.id = 'auth-btn';
    authBtn.innerHTML = '📜';
    authBtn.title = '天道密证 (助记词)';
    authBtn.onclick = () => {
        const m = auth.getMnemonic();
        const action = prompt(
            `【您的天道密证】\n\n${m}\n\n⚠️ 请妥善保管。输入新的密证可切换账号：`,
            ''
        );
        if (action) {
            if (auth.importMnemonic(action.trim())) {
                alert('密证切换成功，即将重载世界...');
                location.reload();
            } else {
                alert('密证格式错误，未作更改。');
            }
        }
    };
    document.body.appendChild(authBtn);
}

export async function invoke(name, args = {}) {
  try {
    let url = '';
    let options = {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Auth-Token': auth.getAccountId()
      },
    };

    // 🌟 兼容各种长短别名
    if (name === 'state' || name === 'get_state') {
      options.method = 'GET';
      options.headers = { 'X-Auth-Token': auth.getAccountId() };
      url = '/api/state';
    } else if (name === 'tick' || name === 'game_tick') {
      url = '/api/tick';
    } else if (name === 'strike' || name === 'player_strike') {
      url = '/api/strike';
    } else if (name === 'action') {
      url = '/api/action';
      const body = { key: args.key };
      if (args.x !== undefined) body.x = args.x;
      if (args.y !== undefined) body.y = args.y;
      options.body = JSON.stringify(body);
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
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}
