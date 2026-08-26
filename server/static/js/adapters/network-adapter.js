/**
 * 维度三：【网络接口胶水层（Network Interface Abstraction）】
 * 
 * 模块功能: 客户端与服务端通讯协议适配器
 * 设计理念: 对标 Rust 的 `reqwest` / WASM `web_sys::fetch` / WebSocket Client Trait。
 * 上层业务代码严禁在 UI 回调中手写裸 fetch，必须通过统一的 NetworkAdapter 调度。
 * 未来迁移到 Rust + WASM 时，仅需重写底层请求驱动，上层业务状态机零改动。
 */

import { auth } from '../auth.js';

export class NetworkAdapter {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * 获取当前认证令牌
     */
    getAuthToken() {
        if (auth && typeof auth.getAccountId === 'function') {
            return auth.getAccountId();
        }
        return 'default_cultivator';
    }

    /**
     * 服务端 RPC / REST 请求。
     * 只有经过责任分类后确实需要服务端的动作才应进入这里。
     */
    async invokeServerAction(args = {}) {
        return this.invoke('action', args);
    }

    /**
     * 通用网络调用入口。高频本地移动不得通过这里发送。
     */
    async invoke(name, args = {}) {
        try {
            let endpoint = '';
            let method = 'POST';
            let body = null;
            const accountId = this.getAuthToken();

            if (name === 'state' || name === 'get_state') {
                method = 'GET';
                endpoint = '/api/state';
            } else if (name === 'tick' || name === 'game_tick') {
                endpoint = '/api/tick';
            } else if (name === 'strike' || name === 'player_strike') {
                endpoint = '/api/strike';
            } else if (name === 'action') {
                endpoint = '/api/action';
                const payload = typeof args === 'object' && args !== null ? { ...args } : { key: String(args) };
                body = JSON.stringify(payload);
            } else if (name === 'players_report') {
                // 🌟 调试专用: 在线/离线玩家报表 (服务端按最近心跳窗口判定在线, 非累计注册数)
                endpoint = '/api/players_report';
                body = '{}';
            } else {
                console.warn(`[NetworkAdapter] 未知的调用指令: ${name}`);
                return null;
            }

            const headers = {
                'X-Auth-Token': accountId
            };
            if (body) {
                headers['Content-Type'] = 'application/json';
            }

            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method,
                headers,
                body: method === 'GET' ? undefined : (body || '{}')
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${errText || response.statusText}`);
            }

            return await response.json();
        } catch (err) {
            console.warn(`[NetworkAdapter] 请求 [${name}] 发生异常:`, err.message || err);
            return null;
        }
    }
}

// 导出全局单例网络适配器
export const networkAdapter = new NetworkAdapter();
