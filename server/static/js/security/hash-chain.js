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
export const LEDGER_VERSION = 2;
export const MAX_LEDGER_SEGMENT_BYTES = 1024 * 1024; // 第一阶段工程目标：约 1 MiB，不作为硬协议限制

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
        ledger_version: LEDGER_VERSION,
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
        
        // 第一阶段：每一个玩家动作直接成为一个 Ledger Block。
        // 这里不再把多个动作揉成 batch block，因为账本首先要承担“录像机”的职责：
        // 一笔动作 = 一条可回放、可审计的历史记录。
        this.pendingActions = []; // 兼容旧 UI / API；第一阶段不再用于延迟封块
        this.maxBlockCapacity = 100; // 仅保留为兼容字段，不再决定封块行为
        this._autoSealTimer = null;
        this.lastPersistError = null;

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
        if (!Array.isArray(chain) || chain.length === 0) return true;

        let expectedHeight = chain[0].height;
        let expectedPrevHash = chain[0].prev_hash;

        // 注意：这里验证的是“录像带本身”的内部完整性。
        // Server baseline 属于另一层验证，不应该混入本地 Hash Chain Integrity，
        // 否则旧基线/多端同步元数据变化会把一条内部完整的录像误判为损坏。
        for (let i = 0; i < chain.length; i++) {
            const b = chain[i];
            if (!b || !Number.isSafeInteger(b.height) || b.height !== expectedHeight) return false;
            if (typeof b.prev_hash !== 'string' || b.prev_hash !== expectedPrevHash) return false;
            if (typeof b.action_type !== 'string' || typeof b.payload_json !== 'string') return false;
            if (!Number.isSafeInteger(b.timestamp) || b.timestamp < 0) return false;

            const rawContent = `${b.height}:${b.prev_hash}:${b.action_type}:${b.payload_json}:${b.timestamp}`;
            const computed = calculateBlockHash(rawContent);
            if (computed !== b.block_hash) return false;

            expectedHeight += 1;
            expectedPrevHash = b.block_hash;
        }
        return true;
    }

    /**
     * 单独验证本地录像的第一块是否接在指定服务器基线之后。
     * 这是“与服务器对齐”的验证，不属于本地录像带自身的完整性验证。
     */
    verifyAgainstBaseline(baseHeight, baseHash, chain = this.blocks) {
        if (!Array.isArray(chain) || chain.length === 0) return true;
        if (!Number.isSafeInteger(Number(baseHeight)) || typeof baseHash !== 'string') return false;
        const first = chain[0];
        return first.height === Number(baseHeight) + 1 && first.prev_hash === baseHash;
    }

    /**
     * 当前账本头信息：用于调试、同步与故障诊断。
     */
    getHead() {
        return {
            height: this.currentHeight,
            hash: this.currentHash,
            block_count: this.blocks.length,
            pending_actions: this.pendingActions.length,
            ledger_bytes: this.getApproximateSizeBytes(),
            ledger_version: LEDGER_VERSION,
        };
    }

    /** 返回最近 N 个区块，默认 20 个。 */
    getRecentBlocks(limit = 20) {
        const n = Math.max(0, Math.floor(limit));
        return n === 0 ? [] : this.blocks.slice(-n).reverse();
    }

    /** 估算当前账本 JSON 大小，用于 1 MiB 分段目标的观测。 */
    getApproximateSizeBytes() {
        try {
            return new TextEncoder().encode(JSON.stringify(this.blocks)).byteLength;
        } catch (_) {
            return JSON.stringify(this.blocks).length;
        }
    }

    /** 当前账本是否接近第一阶段的 1 MiB 工程目标。 */
    isNearSegmentLimit(ratio = 0.9) {
        return this.getApproximateSizeBytes() >= MAX_LEDGER_SEGMENT_BYTES * ratio;
    }

    /**
     * 将动作投递至交易缓冲池，并在达到阈值或定时器触发时封包为大容量区块
     * @param {string} actionType - 'mine' | 'drop' | 'teleport' | 'coin_change' | 'qte_result' | 'recycle' | 'offline_tick' | 'cloud_snapshot'
     * @param {Object} payload 
     */
    appendAction(actionType, payload) {
        const normalizedActionType = String(actionType || 'unknown_action');
        const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
        const timestamp = Date.now();
        const nextHeight = this.currentHeight + 1;
        const rawContent = `${nextHeight}:${this.currentHash}:${normalizedActionType}:${payloadJson}:${timestamp}`;
        const block = {
            ledger_version: LEDGER_VERSION,
            height: nextHeight,
            prev_hash: this.currentHash,
            action_type: normalizedActionType,
            payload_json: payloadJson,
            timestamp,
            block_hash: calculateBlockHash(rawContent),
            synced: false,
        };

        // 先进入内存链，保证游戏逻辑与录像记录保持同一动作顺序。
        this.blocks.push(block);
        this.currentHeight = block.height;
        this.currentHash = block.block_hash;

        // 每笔动作立即落 IndexedDB；不再等待“攒够 100 笔”才落盘。
        blockchainStorage.saveBlock(block).then(ok => {
            if (!ok) {
                this.lastPersistError = `Block #${block.height} 持久化失败`;
                console.warn(`[HashChain] ${this.lastPersistError}`);
            }
        }).catch(err => {
            this.lastPersistError = `Block #${block.height} 持久化异常`;
            console.warn('[HashChain] 异步写入 IndexedDB 失败:', err);
        });

        return block;
    }

    /**
     * 兼容旧调用：第一阶段已经是一动作一块，因此无需再次封包。
     */
    sealPendingBlock() {
        return null;
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
