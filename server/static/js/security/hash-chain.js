/**
 * 本地区块链哈希链与离线加密存储模块 (Local Blockchain Hash Chain & Offline Store)
 * 
 * 核心原理：
 * 1. 采用不可篡改的单向哈希链（Append-Only Hash Chain）。
 * 2. 每一个 Block 包含：height, prev_hash, action_type, payload_json, timestamp, block_hash。
 * 3. 任何关键动作（获取矿物、丢弃、跨城、金币变动、QTE结果、离线收益）均铸造新区块并追加到本地链。
 * 4. 底层采用 IndexedDB (BlockchainStorageAdapter) 存储结构化大容量区块，LocalStorage 维护 Head 索引，内存高速缓存支撑 0 延迟追加。
 * 5. 联网恢复时将未提交的区块打包批量发送服务端对账验证；若被篡改则触发回滚。
 * 6. 支持换设备/多端登录时以云端权威快照作为 Genesis 重新建立链。
 */

import { blockchainStorage, HEAD_KEYS } from '../adapters/blockchain-storage.js';

export const GENESIS_HASH = '0000000000000000genesis_hash';

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/**
 * 确定性 64 位 FNV-1a 哈希算法（标准 UTF-8 字节流计算，与 Rust / Server 端完全一致）
 * @param {string} str 
 * @returns {string} 16 进制 16 位哈希字符串
 */
export function calculateBlockHash(str) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask64 = 0xffffffffffffffffn;

    if (utf8Encoder) {
        const bytes = utf8Encoder.encode(str);
        for (let i = 0; i < bytes.length; i++) {
            const code = BigInt(bytes[i]);
            hash = hash ^ code;
            hash = (hash * prime) & mask64;
        }
    } else {
        // 兼容环境 manual UTF-8 编码
        const encoded = unescape(encodeURIComponent(str));
        for (let i = 0; i < encoded.length; i++) {
            const code = BigInt(encoded.charCodeAt(i) & 0xff);
            hash = hash ^ code;
            hash = (hash * prime) & mask64;
        }
    }

    let hex = hash.toString(16);
    while (hex.length < 16) {
        hex = '0' + hex;
    }
    return hex;
}

/**
 * 区块结构工厂
 */
export function createBlock(height, prevHash, actionType, payloadObj, timestamp = Date.now()) {
    const payloadJson = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);
    const rawContent = `${height}:${prevHash}:${actionType}:${payloadJson}:${timestamp}`;
    const blockHash = calculateBlockHash(rawContent);

    return {
        height,
        prev_hash: prevHash,
        action_type: actionType,
        payload_json: payloadJson,
        timestamp,
        block_hash: blockHash,
        synced: false, // 是否已获服务端对账仲裁
    };
}

/**
 * 本地区块链管理器 (Local Hash Chain Manager)
 */
export class LocalHashChain {
    constructor() {
        this.blocks = [];
        this.currentHeight = 0;
        this.currentHash = GENESIS_HASH;
        this.isLoaded = false;
        
        // 🌟 动作交易缓冲池 (Mempool): 避免单动作生成单块的高冗余开销，支持批量多动作扩容
        this.pendingActions = [];
        this.maxBlockCapacity = 100; // 🌟 每个区块容纳上限 100 个动作 (参考比特币区块容量)
        this._autoSealTimer = null;

        // 快速同步读取 LocalStorage 中的 Head 索引
        this._readFastHead();

        // 异步全量加载 IndexedDB
        this.readyPromise = this.loadFromStorage();

        // 绑定页面退出保存事件
        this._bindUnloadFlush();
    }

    /**
     * 快速同步从 LocalStorage 获取最新高度与哈希
     */
    _readFastHead() {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const savedHeight = parseInt(localStorage.getItem(HEAD_KEYS.BLOCK_HEIGHT) || '0', 10);
                const savedHash = localStorage.getItem(HEAD_KEYS.BLOCK_HASH);
                if (savedHeight > 0 && savedHash) {
                    this.currentHeight = savedHeight;
                    this.currentHash = savedHash;
                }
            }
        } catch {
            // 忽略快速读取异常
        }
    }

    /**
     * 页面关闭/切换标签页时触发内存区块向 IndexedDB 紧急冲刷
     */
    _bindUnloadFlush() {
        if (typeof window !== 'undefined') {
            const flushHandler = () => {
                this.sealPendingBlock();
                if (this.blocks.length > 0) {
                    blockchainStorage.saveBlocks(this.blocks);
                }
            };
            window.addEventListener('pagehide', flushHandler);
            window.addEventListener('beforeunload', flushHandler);
        }
    }

    /**
     * 从 IndexedDB 加载完整区块链
     */
    async loadFromStorage() {
        try {
            await blockchainStorage.ensureReady();
            const loadedBlocks = await blockchainStorage.getAllBlocks();

            if (loadedBlocks && loadedBlocks.length > 0) {
                // 校验本地链完整性
                if (this.verifyChainIntegrity(loadedBlocks)) {
                    this.blocks = loadedBlocks;
                    const top = this.blocks[this.blocks.length - 1];
                    this.currentHeight = top.height;
                    this.currentHash = top.block_hash;
                    this.isLoaded = true;
                    console.log(`⛓️ [HashChain] 已从 IndexedDB 载入区块链日志，共 ${this.blocks.length} 个区块，高度 #${this.currentHeight}`);
                    return this.blocks;
                } else {
                    console.warn('⚠️ [HashChain] IndexedDB 本地链校验失败或被篡改，自动重置创世高度');
                }
            }
        } catch (e) {
            console.error('Failed to load local hash chain from IndexedDB', e);
        }

        // 初始化/重置
        this.blocks = [];
        this.pendingActions = [];
        this.currentHeight = this.currentHeight || 0;
        this.currentHash = this.currentHash || GENESIS_HASH;
        this.isLoaded = true;
        return this.blocks;
    }

    /**
     * 校验整条链的哈希指针与连续性
     */
    verifyChainIntegrity(chain = this.blocks) {
        if (!chain || chain.length === 0) return true;
        let expectedPrevHash = chain[0].prev_hash;

        for (let i = 0; i < chain.length; i++) {
            const b = chain[i];
            if (b.prev_hash !== expectedPrevHash) return false;

            const rawContent = `${b.height}:${b.prev_hash}:${b.action_type}:${b.payload_json}:${b.timestamp}`;
            const computed = calculateBlockHash(rawContent);
            if (computed !== b.block_hash) return false;

            expectedPrevHash = b.block_hash;
        }
        return true;
    }

    /**
     * 将动作投递至交易缓冲池，并在达到阈值或定时器触发时封包为大容量区块
     * @param {string} actionType - 'mine' | 'drop' | 'teleport' | 'coin_change' | 'qte_result' | 'recycle' | 'offline_tick' | 'cloud_snapshot'
     * @param {Object} payload 
     */
    appendAction(actionType, payload) {
        this.pendingActions.push({
            action_type: actionType,
            payload: payload || {},
            timestamp: Date.now()
        });

        // 1. 若缓冲池达到容量上限，立即铸造并封包新区块
        if (this.pendingActions.length >= this.maxBlockCapacity) {
            return this.sealPendingBlock();
        }

        // 2. 否则启动/刷新 60 秒自动封包定时器 (避免区块高度增长过快)
        if (!this._autoSealTimer) {
            this._autoSealTimer = setTimeout(() => {
                this._autoSealTimer = null;
                // 只有存在待封包动作时才封包
                if (this.pendingActions.length > 0) {
                    this.sealPendingBlock();
                }
            }, 60000);  // 60 秒
        }

        return null;
    }

    /**
     * 将当前交易缓冲池中的所有未封包动作打包封铸为 1 个新区块 (Seal Block)
     */
    sealPendingBlock() {
        if (this._autoSealTimer) {
            clearTimeout(this._autoSealTimer);
            this._autoSealTimer = null;
        }

        if (!this.pendingActions || this.pendingActions.length === 0) {
            return null;
        }

        const actionsToSeal = this.pendingActions.splice(0, this.pendingActions.length);
        const nextHeight = this.currentHeight + 1;
        const now = Date.now();

        let actionType = 'batch_actions';
        let payloadJson = '';

        if (actionsToSeal.length === 1) {
            actionType = actionsToSeal[0].action_type;
            payloadJson = typeof actionsToSeal[0].payload === 'string' 
                ? actionsToSeal[0].payload 
                : JSON.stringify(actionsToSeal[0].payload);
        } else {
            actionType = 'batch_actions';
            payloadJson = JSON.stringify({
                count: actionsToSeal.length,
                actions: actionsToSeal
            });
        }

        const rawContent = `${nextHeight}:${this.currentHash}:${actionType}:${payloadJson}:${now}`;
        const blockHash = calculateBlockHash(rawContent);

        const block = {
            height: nextHeight,
            prev_hash: this.currentHash,
            action_type: actionType,
            payload_json: payloadJson,
            timestamp: now,
            block_hash: blockHash,
            synced: false
        };

        // 1. 内存追加
        this.blocks.push(block);
        this.currentHeight = block.height;
        this.currentHash = block.block_hash;

        // 2. 异步持久化至 IndexedDB
        blockchainStorage.saveBlock(block).catch(err => {
            console.warn('[HashChain] 异步写入 IndexedDB 失败:', err);
        });

        console.log(`⛓️ [HashChain] 已封装并铸造大容量区块 #${block.height} (包含 ${actionsToSeal.length} 笔动作, Hash: ${block.block_hash.slice(0, 8)}...)`);
        return block;
    }

    /**
     * 获取指定高度以上的所有已封包区块（用于按服务端最新高度对账补漏）
     * @param {number} fromHeight 
     */
    getBlocksFromHeight(fromHeight = 0) {
        return this.blocks.filter(b => b.height > fromHeight);
    }

    /**
     * 获取所有尚未同步到服务端的待对账区块 (不会强行切分未满额的交易池)
     */
    getPendingBlocks(serverHeight = undefined) {
        if (serverHeight !== undefined) {
            return this.getBlocksFromHeight(serverHeight);
        }
        return this.blocks.filter(b => !b.synced);
    }

    /**
     * 标记指定高度及以前的区块为已对账
     */
    markSyncedUpTo(height, confirmedHash) {
        let matched = false;
        for (const b of this.blocks) {
            if (b.height <= height) {
                b.synced = true;
                if (b.height === height && b.block_hash === confirmedHash) {
                    matched = true;
                }
            }
        }
        // 异步更新 IndexedDB
        blockchainStorage.markSyncedUpTo(height, confirmedHash);
        return matched;
    }

    /**
     * 强制回滚到指定安全高度（Rollback on Security Violation）
     */
    rollbackTo(safeHeight, safeHash) {
        console.warn(`🚨 [HashChain] 执行强制回滚至高度: ${safeHeight}, Hash: ${safeHash}`);
        this.pendingActions = [];
        this.blocks = this.blocks.filter(b => b.height <= safeHeight);
        if (this.blocks.length > 0) {
            const top = this.blocks[this.blocks.length - 1];
            this.currentHeight = top.height;
            this.currentHash = top.block_hash;
        } else {
            this.currentHeight = safeHeight;
            this.currentHash = safeHash || GENESIS_HASH;
        }
        blockchainStorage.rollbackTo(safeHeight);
    }

    /**
     * 以服务端权威快照重置/建立创世区块（多端登录 / 换电脑换设备无损恢复）
     */
    resetWithServerState(height, hash) {
        this.pendingActions = [];
        this.blocks = [];
        this.currentHeight = height || 0;
        this.currentHash = hash || GENESIS_HASH;
        blockchainStorage.resetWithGenesis(this.currentHeight, this.currentHash);
        console.log(`🌐 [HashChain] 以云端权威状态建立基线，高度 #${this.currentHeight} [${this.currentHash}]`);
    }
}

export const localHashChain = new LocalHashChain();
