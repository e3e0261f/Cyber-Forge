/** 公共工具：DOM、网络适配器胶水层调用、格式化、Toast、共享快照 */
export const $ = (id) => document.getElementById(id);
export const snap = { current: null };

import { auth } from './auth.js';
import { networkAdapter } from './adapters/network-adapter.js';

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

/**
 * 客户端 RPC 调用统一网关 (委托给 NetworkAdapter 抽象胶水层)
 */
export async function invoke(name, args = {}) {
    return await networkAdapter.invoke(name, args);
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
