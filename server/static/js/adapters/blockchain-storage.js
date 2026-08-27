/**
 * 网页端高性能 IndexedDB 区块链日志与分层持久化适配器 (IndexedDB Blockchain Storage)
 * 
 * 存储策略架构（分层存储、多保险联动）：
 * 1. 【主力存储层 (IndexedDB)】: 突破 localStorage 5MB 限制，存储成千上万个带完整 Hash 的结构化区块日志。
 * 2. 【快速索引层 (LocalStorage)】: 仅存储当前本地链最高区块高度 (Head Height) 与最新哈希 (Head Hash)。
 * 3. 【内存高速缓存层 (Memory Cache)】: 运行时高速无阻塞追加写入，并在 pagehide / beforeunload / 关键节点时瞬间持久化。
 */

export const DB_NAME = 'CyberForge_BlockchainDB_v1';
export const DB_VERSION = 1;
export const STORE_BLOCKS = 'chain_blocks';

export const HEAD_KEYS = {
    BLOCK_HEIGHT: 'cyber_forge_head_height',
    BLOCK_HASH: 'cyber_forge_head_hash',
    LAST_SNAPSHOT_TIME: 'cyber_forge_last_snapshot_time',
    BASE_HEIGHT: 'cyber_forge_ledger_base_height',
    BASE_HASH: 'cyber_forge_ledger_base_hash',
};

export class BlockchainStorageAdapter {
    constructor() {
        this.db = null;
        this.isReady = false;
        this.initPromise = this._openDatabase();
    }

    /**
     * 打开并初始化浏览器原生 IndexedDB
     */
    async _openDatabase() {
        if (typeof window === 'undefined' || !window.indexedDB) {
            console.warn('[BlockchainStorage] 当前环境不支持 IndexedDB，降级使用内存与 LocalStorage');
            this.isReady = true;
            return null;
        }

        return new Promise((resolve) => {
            try {
                const request = window.indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_BLOCKS)) {
                        const store = db.createObjectStore(STORE_BLOCKS, { keyPath: 'height' });
                        store.createIndex('synced', 'synced', { unique: false });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('action_type', 'action_type', { unique: false });
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isReady = true;
                    resolve(this.db);
                };

                request.onerror = (event) => {
                    console.warn('[BlockchainStorage] 打开 IndexedDB 失败，启用降级模式:', event.target.error);
                    this.isReady = true;
                    resolve(null);
                };
            } catch (err) {
                console.warn('[BlockchainStorage] 初始化 IndexedDB 发生异常:', err);
                this.isReady = true;
                resolve(null);
            }
        });
    }

    /**
     * 确保数据库已初始化就绪
     */
    async ensureReady() {
        if (!this.isReady) {
            await this.initPromise;
        }
    }

    /**
     * 写入单个区块至 IndexedDB 并更新快速索引
     */
    async saveBlock(block) {
        await this.ensureReady();

        // 1. 更新 LocalStorage 快速索引
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem(HEAD_KEYS.BLOCK_HEIGHT, String(block.height));
                localStorage.setItem(HEAD_KEYS.BLOCK_HASH, String(block.block_hash));
                if (localStorage.getItem(HEAD_KEYS.BASE_HASH) === null) {
                    localStorage.setItem(HEAD_KEYS.BASE_HEIGHT, String(Math.max(0, block.height - 1)));
                    localStorage.setItem(HEAD_KEYS.BASE_HASH, String(block.prev_hash));
                }
            }
        } catch (e) {
            console.warn('[BlockchainStorage] 写入 Head 快速索引失败:', e);
        }

        // 2. 写入 IndexedDB 主力数据库
        if (!this.db) return false;

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_BLOCKS, 'readwrite');
                const store = tx.objectStore(STORE_BLOCKS);
                const req = store.put(block);

                req.onsuccess = () => resolve(true);
                req.onerror = (err) => {
                    console.warn('[BlockchainStorage] 写入区块失败:', err);
                    resolve(false);
                };
            } catch (err) {
                console.warn('[BlockchainStorage] 开启事务失败:', err);
                resolve(false);
            }
        });
    }

    /**
     * 批量追加写入多个区块 (Bulk Save within one transaction)
     */
    async saveBlocks(blocks) {
        if (!blocks || blocks.length === 0) return true;
        await this.ensureReady();

        const top = blocks[blocks.length - 1];
        if (top) {
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    localStorage.setItem(HEAD_KEYS.BLOCK_HEIGHT, String(top.height));
                    localStorage.setItem(HEAD_KEYS.BLOCK_HASH, String(top.block_hash));
                    if (localStorage.getItem(HEAD_KEYS.BASE_HASH) === null) {
                        localStorage.setItem(HEAD_KEYS.BASE_HEIGHT, String(Math.max(0, top.height - blocks.length)));
                        localStorage.setItem(HEAD_KEYS.BASE_HASH, String(blocks[0]?.prev_hash || '0000000000000000genesis_hash'));
                    }
                }
            } catch (e) {
                console.warn('[BlockchainStorage] 批量写入 Head 快速索引失败:', e);
            }
        }

        if (!this.db) return false;

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_BLOCKS, 'readwrite');
                const store = tx.objectStore(STORE_BLOCKS);
                for (const b of blocks) {
                    store.put(b);
                }
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (err) {
                console.warn('[BlockchainStorage] 批量写入事务异常:', err);
                resolve(false);
            }
        });
    }

    /**
     * 获取所有区块列表（按高度升序）
     */
    async getAllBlocks() {
        await this.ensureReady();
        if (!this.db) return [];

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_BLOCKS, 'readonly');
                const store = tx.objectStore(STORE_BLOCKS);
                const req = store.getAll();

                req.onsuccess = () => {
                    const list = req.result || [];
                    list.sort((a, b) => a.height - b.height);
                    resolve(list);
                };
                req.onerror = () => resolve([]);
            } catch {
                resolve([]);
            }
        });
    }

    /**
     * 获取所有待对账同步的区块 (synced === false)
     */
    async getPendingBlocks() {
        await this.ensureReady();
        if (!this.db) return [];

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_BLOCKS, 'readonly');
                const store = tx.objectStore(STORE_BLOCKS);
                const index = store.index('synced');
                const req = index.getAll(IDBKeyRange.only(false));

                req.onsuccess = () => {
                    const list = req.result || [];
                    list.sort((a, b) => a.height - b.height);
                    resolve(list);
                };
                req.onerror = () => resolve([]);
            } catch {
                resolve([]);
            }
        });
    }

    /**
     * 标记指定高度及以前的区块为已对账 (synced = true)
     */
    async markSyncedUpTo(height, confirmedHash) {
        await this.ensureReady();
        if (!this.db) return;

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_BLOCKS, 'readwrite');
                const store = tx.objectStore(STORE_BLOCKS);
                const range = IDBKeyRange.upperBound(height);
                const req = store.openCursor(range);

                req.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const block = cursor.value;
                        if (!block.synced) {
                            block.synced = true;
                            cursor.update(block);
                        }
                        cursor.continue();
                    } else {
                        resolve(true);
                    }
                };
                req.onerror = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    }

    /**
     * 强制回滚至指定安全高度（删除所有 height > safeHeight 的非法区块）
     */
    async rollbackTo(safeHeight) {
        await this.ensureReady();
        if (!this.db) return;

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_BLOCKS, 'readwrite');
                const store = tx.objectStore(STORE_BLOCKS);
                const range = IDBKeyRange.lowerBound(safeHeight + 1);
                const req = store.openCursor(range);

                req.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        resolve(true);
                    }
                };
                req.onerror = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    }

    /**
     * 全量清空并以服务端权威快照重置创世高度
     */
    async resetWithGenesis(genesisHeight = 0, genesisHash = '0000000000000000genesis_hash') {
        await this.ensureReady();
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem(HEAD_KEYS.BLOCK_HEIGHT, String(genesisHeight));
                localStorage.setItem(HEAD_KEYS.BLOCK_HASH, String(genesisHash));
                localStorage.setItem(HEAD_KEYS.BASE_HEIGHT, String(genesisHeight));
                localStorage.setItem(HEAD_KEYS.BASE_HASH, String(genesisHash));
            }
        } catch (e) {
            console.warn('[BlockchainStorage] 重置快速索引失败:', e);
        }

        if (!this.db) return;

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(STORE_BLOCKS, 'readwrite');
                const store = tx.objectStore(STORE_BLOCKS);
                const req = store.clear();
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    }
}

export const blockchainStorage = new BlockchainStorageAdapter();
