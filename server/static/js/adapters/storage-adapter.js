/**
 * 维度三：【存储接口胶水层（Storage Interface Abstraction）】
 * 
 * 模块功能: 本地持久化存储适配器
 * 设计理念: 对标 Rust 的 `quad-storage` / `gloo_storage` / KV Storage Trait。
 * 上层业务代码（状态机、游戏逻辑）严禁直接调用浏览器的 `localStorage`，必须通过本适配器流转。
 * 未来迁移到 Rust + WASM 时，仅需替换本适配器的底座驱动，上层代码零改动。
 */

export const STORAGE_KEYS = {
    PLAYER_POSITION: 'cyber_forge_player_pos',
    MNEMONIC: 'cyber_forge_mnemonic',
    SETTINGS: 'cyber_forge_settings'
};

/**
 * 存储驱动适配器接口 (对标 Rust: pub trait StorageAdapter)
 */
export class LocalStorageAdapter {
    /**
     * 读取键值并反序列化 (对标 Rust: serde_json::from_str)
     */
    get(key, defaultValue = null) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) {
                return defaultValue;
            }
            const raw = localStorage.getItem(key);
            if (raw === null || raw === undefined) {
                return defaultValue;
            }
            try {
                return JSON.parse(raw);
            } catch {
                return raw;
            }
        } catch (err) {
            console.warn(`[StorageAdapter] 读取键 [${key}] 失败:`, err);
            return defaultValue;
        }
    }

    /**
     * 序列化并写入键值 (对标 Rust: serde_json::to_string)
     */
    set(key, value) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) {
                return false;
            }
            const payload = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, payload);
            return true;
        } catch (err) {
            console.warn(`[StorageAdapter] 写入键 [${key}] 失败:`, err);
            return false;
        }
    }

    /**
     * 删除指定键
     */
    remove(key) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) {
                return false;
            }
            localStorage.removeItem(key);
            return true;
        } catch (err) {
            console.warn(`[StorageAdapter] 删除键 [${key}] 失败:`, err);
            return false;
        }
    }

    /**
     * 清空所有键
     */
    clear() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) {
                return false;
            }
            localStorage.clear();
            return true;
        } catch (err) {
            console.warn(`[StorageAdapter] 清空存储失败:`, err);
            return false;
        }
    }
}

// 导出全局单例适配器
export const storageAdapter = new LocalStorageAdapter();
