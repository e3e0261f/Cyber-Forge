/**
 * 客户端反作弊、审计上报与延迟云端快照同步引擎 (Anti-Cheat & Lazy Cloud Snapshot Sync)
 * 
 * 核心功能：
 * 维度一：移动系统抽查上报 (Movement Report every 5s)
 * 维度二：物品丢弃乐观执行与事后审计 (Item Drop Audit)
 * 维度三：区块链日志异步对账与断网重连同步 (Hash Chain Sync & Rollback Handler)
 * 
 * 关键双保险机制（应对关闭网页/换电脑/清空缓存数据丢失）：
 * 保险一：【高频轻量快照上云 (Lazy Cloud Snapshot)】
 *   - 关键节点（获得稀有矿、过图、完成跑商、每隔 60 秒、下线前 beforeunload）打包当前全量资产与坐标快照加密上传云端。
 * 保险二：【双向冗余与多端冲突仲裁 (Bi-directional Redundancy & Conflict Resolution)】
 *   - 新电脑/清空缓存登录时拉取云端最新快照作为 Genesis 重新建链；老电脑过期未同步日志被服务端权威仲裁覆盖。
 */

import { localHashChain } from './hash-chain.js';
import { networkAdapter } from '../adapters/network-adapter.js';
// 🌟 直接导入中央状态机 (修复: 此前依赖 window.gameState 但从未被挂载, 导致快照/移动上报静默失效)
import { gameState as centralGameState, gameStore as centralGameStore } from '../state.js';

export class AuditReporter {
    constructor() {
        this.reportIntervalMs = 5000; // 每 5 秒移动抽查
        this.snapshotIntervalMs = 60000; // 每 60 秒进行一次全量快照上云
        this.lastReportTime = performance.now();
        this.lastSnapshotTime = Date.now();
        this.periodStartX = 13500;
        this.periodStartY = 13500;
        this.periodStartTime = Date.now();
        this.lastZoneId = 'beijing';
        this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

        this.initNetworkListeners();
        this.initUnloadBeacon();
        this.startPeriodicReporter();
        this.startPeriodicSnapshot();
    }

    /** 🌟 统一获取中央状态机引用 (模块导入优先, window 挂载兼容) */
    _getState() {
        return centralGameState || (typeof window !== 'undefined' ? window.gameState : null);
    }

    _getStore() {
        return centralGameStore || (typeof window !== 'undefined' ? window.gameStore : null);
    }

    /**
     * 初始化网络恢复监听器 (Online / Offline Event)
     */
    initNetworkListeners() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('🌐 [Network] 网络已恢复连接，触发区块链式日志异步对账与快照同步...');
                this.isOnline = true;
                this.syncPendingHashChain();
                this.uploadCloudSnapshot('network_reconnected');
            });

            window.addEventListener('offline', () => {
                console.log('📴 [Network] 当前处于离线状态，所有操作将进入本地 IndexedDB 区块链安全日志');
                this.isOnline = false;
            });
        }
    }

    /**
     * 绑定页面退出/关闭前的快照信标 (Beacon on pagehide / beforeunload)
     */
    initUnloadBeacon() {
        if (typeof window !== 'undefined') {
            const sendExitSnapshot = () => {
                this.uploadCloudSnapshot('page_unload', true);
            };
            window.addEventListener('pagehide', sendExitSnapshot);
            window.addEventListener('beforeunload', sendExitSnapshot);
        }
    }

    /**
     * 记录位置初始化
     */
    initPosition(x, y, zoneId) {
        this.periodStartX = x;
        this.periodStartY = y;
        this.periodStartTime = Date.now();
        this.lastZoneId = zoneId;
    }

    /**
     * 启动周期性移动抽查
     */
    startPeriodicReporter() {
        setInterval(() => {
            this.checkAndSendMovementReport();
            if (this.isOnline) {
                this.syncPendingHashChain();
            }
        }, this.reportIntervalMs);
    }

    /**
     * 启动周期性云端快照备份 (每 60 秒)
     */
    startPeriodicSnapshot() {
        setInterval(() => {
            if (this.isOnline) {
                this.uploadCloudSnapshot('periodic_60s_interval');
            }
        }, this.snapshotIntervalMs);
    }

    /**
     * 维度一：移动行为抽查上报 (Movement Report)
     */
    async checkAndSendMovementReport() {
        if (typeof window === 'undefined') return;
        const state = this._getState();
        if (!state) return;

        const currentX = state.player_x || 13500;
        const currentY = state.player_y || 13500;
        const currentZone = state.current_zone_id || 'beijing';
        const now = Date.now();
        const durationSecs = Math.max(0.1, (now - this.periodStartTime) / 1000);

        if (currentZone !== this.lastZoneId) {
            this.periodStartX = currentX;
            this.periodStartY = currentY;
            this.periodStartTime = now;
            this.lastZoneId = currentZone;
            return;
        }

        const dist = Math.hypot(currentX - this.periodStartX, currentY - this.periodStartY);
        
        if (dist > 5.0) {
            const report = {
                start_x: Math.round(this.periodStartX * 10) / 10,
                start_y: Math.round(this.periodStartY * 10) / 10,
                end_x: Math.round(currentX * 10) / 10,
                end_y: Math.round(currentY * 10) / 10,
                zone_id: currentZone,
                duration_secs: Math.round(durationSecs * 100) / 100,
                timestamp: now,
            };

            // 1. 写入本地 IndexedDB 区块链日志
            localHashChain.appendAction('movement_interval', report);

            // 2. 异步上报至服务端抽查
            if (this.isOnline) {
                networkAdapter.invoke('action', {
                    key: 'audit_movement_report',
                    ...report
                }).catch(err => {
                    console.warn('[AuditReporter] 移动抽查上报暂缓:', err);
                });
            }
        }

        this.periodStartX = currentX;
        this.periodStartY = currentY;
        this.periodStartTime = now;
        this.lastZoneId = currentZone;
    }

    /**
     * 维度二：物品丢弃审计上报 (Item Drop Report)
     */
    async reportItemDrop(item, count = 1) {
        const dropPayload = {
            item_id: item.id || item.item_id,
            name: item.name || '未知物品',
            count: count || item.stack_count || 1,
            timestamp: Date.now(),
        };

        // 1. 写入本地 IndexedDB 区块链日志
        localHashChain.appendAction('drop', dropPayload);

        // 2. 触发一次云端快照更新
        this.uploadCloudSnapshot('item_dropped');

        // 3. 异步向服务端发送审计报告
        try {
            const res = await networkAdapter.invoke('action', {
                key: 'audit_item_drop',
                ...dropPayload
            });

            if (res && res.error && res.kick) {
                this.handleSecurityKick(res.error || '物品丢弃审计异常');
            }
        } catch (e) {
            console.warn('[AuditReporter] 物品丢弃审计日志离线挂起，已计入本地 HashChain:', e);
        }
    }

    /**
     * 维度二-B：物品获得审计上报 (Item Gain Report, 区块链背书)
     * 获得 → 本地 HashChain gain 块 → 立即云端快照落库 → 服务端审计上报。
     * 快照落库后刷新页面即可从服务端权威账本恢复背包, 杜绝资产丢失。
     */
    async reportItemGain(item, count = 1, source = 'unknown') {
        const gainPayload = {
            item_id: item.id || item.item_id || item.itemId,
            name: item.name || '未知物品',
            count: count || item.stack_count || item.stackCount || 1,
            source,
            timestamp: Date.now(),
        };

        // 1. 写入本地 IndexedDB 区块链日志 (gain 块推进区块高度)
        localHashChain.appendAction('gain', gainPayload);

        // 2. 立即触发云端快照更新 (背包落库服务端, 高度推进保证服务端接受)
        this.uploadCloudSnapshot('item_gained');

        // 3. 异步向服务端发送审计报告
        try {
            await networkAdapter.invoke('action', {
                key: 'audit_item_gain',
                ...gainPayload
            });
        } catch (e) {
            console.warn('[AuditReporter] 物品获得审计日志离线挂起，已计入本地 HashChain:', e);
        }
    }

    /**
     * 保险一：延迟云端快照同步 (Lazy Cloud Snapshot)
     * @param {string} triggerReason - 'rare_drop' | 'zone_transfer' | 'periodic_60s' | 'page_unload'
     * @param {boolean} isBeacon - 是否以非阻塞 Beacon 发送
     */
    async uploadCloudSnapshot(triggerReason = 'manual', isBeacon = false) {
        if (typeof window === 'undefined') return;
        const state = this._getState();
        if (!state) return;

        const snapshotData = {
            trigger: triggerReason,
            timestamp: Date.now(),
            block_height: localHashChain.currentHeight,
            block_hash: localHashChain.currentHash,
            player_x: state.player_x,
            player_y: state.player_y,
            current_zone_id: state.current_zone_id,
            current_city_id: state.current_city_id,
            backpack: state.backpack || [],
            copper: state.copper,
            coins: state.coins,
            jade: state.jade || state.sky_jade,
            gold: state.gold,
            lingshi: state.lingshi,
            slag: state.slag,
            level: state.level,
            strikes: state.strikes,
        };

        // 写入本地 Hash Chain 快照区块
        localHashChain.appendAction('cloud_snapshot', {
            trigger: triggerReason,
            block_height: localHashChain.currentHeight,
            timestamp: snapshotData.timestamp
        });

        if (isBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
            try {
                const blob = new Blob([JSON.stringify({ key: 'cloud_state_snapshot', ...snapshotData })], { type: 'application/json' });
                navigator.sendBeacon('/api/action', blob);
                return;
            } catch (e) {
                console.warn('[Snapshot] sendBeacon 上报失败:', e);
            }
        }

        try {
            const res = await networkAdapter.invoke('action', {
                key: 'cloud_state_snapshot',
                ...snapshotData
            });

            if (res) {
                if (res.override_with_cloud) {
                    console.warn('⚠️ [Snapshot] 服务端指示当前设备存在多端冲突，重置本地状态至云端权威账本');
                    localHashChain.resetWithServerState(res.block_height, res.block_hash);
                    const store = this._getStore();
                    if (store) {
                        store.syncState(res);
                    }
                } else {
                    this.lastSnapshotTime = Date.now();
                }
            }
        } catch (e) {
            console.warn('[Snapshot] 延迟快照上传离线挂起:', e);
        }
    }

    /**
     * 维度三：区块链日志异步对账与强制回滚
     */
    async syncPendingHashChain(explicitServerHeight = undefined) {
        if (this._isSyncing) return;
        
        const serverHeight = explicitServerHeight !== undefined 
            ? explicitServerHeight 
            : (this._getStore()?.state?.block_height !== undefined ? this._getStore().state.block_height : 0);
        const serverHash = this._getStore()?.state?.block_hash || '0000000000000000genesis_hash';

        const pending = localHashChain.getPendingBlocks(serverHeight);
        if (!pending || pending.length === 0) return;

        // 若本地待对账块与服务端基线断裂（例如本地最早块 > serverHeight + 1 或已落后），自动重置基线
        if (pending[0].height !== serverHeight + 1) {
            console.log(`🔄 [HashChain] 本地历史区块基线不连续 (待发 #${pending[0].height} vs 服务端基线 #${serverHeight})，自动平滑对齐服务端权威基线`);
            localHashChain.resetWithServerState(serverHeight, serverHash);
            return;
        }

        this._isSyncing = true;
        try {
            const res = await networkAdapter.invoke('action', {
                key: 'sync_hash_chain',
                blocks: pending
            });

            if (res) {
                if (res.security_violation || res.kick) {
                    // 若仅为高度不连续或父哈希断层，自动平滑重置，避免误踢
                    const reason = res.reason || res.message || '';
                    if (reason.includes('高度不连续') || reason.includes('父哈希不匹配') || reason.includes('断层')) {
                        console.log(`🔄 [HashChain] 服务端反馈基线断层 (${reason})，平滑重置本地基线至 #${res.rollback_height || res.block_height || 0}`);
                        localHashChain.resetWithServerState(res.rollback_height || res.block_height || 0, res.rollback_hash || res.block_hash || serverHash);
                    } else {
                        // 真正的恶意数据篡改 -> 处理回滚并踢下线
                        this.handleSecurityViolation(res);
                    }
                } else if (res.override_with_cloud) {
                    // 多端冲突仲裁：服务端权威覆盖老设备
                    console.log('🔄 [HashChain] 服务端云端账本已更新，重置本端区块链基线');
                    localHashChain.resetWithServerState(res.block_height, res.block_hash);
                    const store = this._getStore();
                    if (store) {
                        store.syncState(res);
                    }
                } else {
                    const confirmedH = res.block_height !== undefined ? res.block_height : res.current_height;
                    const confirmedHash = res.block_hash || res.current_hash;
                    if (confirmedH !== undefined && confirmedHash) {
                        // 对账成功，推进本地已对账指针
                        const prevSynced = this._lastSyncedHeight || 0;
                        localHashChain.markSyncedUpTo(confirmedH, confirmedHash);
                        if (confirmedH > prevSynced) {
                            this._lastSyncedHeight = confirmedH;
                            console.log(`⛓️ [HashChain] 区块链异步对账成功，已确认最新高度: #${confirmedH}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[HashChain] 异步对账网络重试等待中...', e);
        } finally {
            this._isSyncing = false;
        }
    }

    /**
     * 处理服务端安全裁决与踢下线 (Kick & Rollback)
     */
    handleSecurityViolation(res) {
        const safeHeight = res.rollback_height || 0;
        const safeHash = res.rollback_hash || '0000000000000000genesis_hash';
        const reason = res.reason || res.message || '检测到作弊或非法状态篡改';

        // 1. 客户端强制回滚本地区块链
        localHashChain.rollbackTo(safeHeight, safeHash);

        // 2. 弹窗锁定并踢下线
        this.handleSecurityKick(`【天道律令·反作弊仲裁】\n原因：${reason}\n状态已强制回滚至安全高度 [Block #${safeHeight}]，请重新认证登录。`);
    }

    /**
     * 踢下线统一处理
     */
    handleSecurityKick(msg) {
        console.error('🚨 玩家被服务端安全仲裁强制下线:', msg);
        if (typeof window !== 'undefined') {
            window.isSecurityLocked = true;
            alert(msg);
            localStorage.removeItem('cyber_forge_auth_token');
            window.location.reload();
        }
    }
}

export const auditReporter = new AuditReporter();
