/**
 * 维度二：【状态机集中化（Single Source of Truth / Store）】
 * 
 * 模块功能: 游戏全局中央状态机管理器 (Central Game Store)
 * 设计理念: 对标 Rust 的 `Bevy Resource` 或状态机 `struct GameStore`。
 * 所有业务逻辑变更（QTE 采集、获得灵矿、商票买卖、物价与车队流转、坐标持久化）必须通过此 Store 进行状态迁移。
 * 严禁在各个 UI 按钮的回调函数或 Canvas 绘制代码中直接侵入修改全局状态。
 */

import { storageAdapter, STORAGE_KEYS } from '../adapters/storage-adapter.js';
import { networkAdapter } from '../adapters/network-adapter.js';
import { 
    createDefaultGameState, 
    createPlayerLocation, 
    createGameItem, 
    createCommerceState 
} from '../models/structs.js';
import { audio } from '../audio.js';
import { localHashChain } from '../security/hash-chain.js';
import { RESOURCE_TOOL_MAP, normalizeGatherItemNames, deriveGatherFields } from '../world/world-topology.js';

// 🌟 采集工具等级持久化键 (防刷新回落: 工具等级只存于客户端 gameState, 不落服务端字段)
export const TOOL_LEVELS_KEY = 'cyber_forge_tool_levels';

export class GameStore {
    constructor() {
        // 核心不可分割的游戏状态 (Single Source of Truth)
        this.state = createDefaultGameState();

        // 插件式 Hook：如背包网格自定义排序记忆
        this.stashLayoutHook = null;

        // 内部时序控制
        this._lastPosPersistTime = 0;
        this._lastPosServerSyncTime = 0;
        this._audioInitialized = false;

        // 初始化加载本地持久化状态
        this.loadPersistedCoordinates();
    }

    /**
     * 注册背包布局 Hook
     */
    registerStashLayoutHook(hook) {
        this.stashLayoutHook = hook;
    }

    /**
     * 从持久化存储适配器加载玩家坐标 (对标 Rust: store.load_persisted_position())
     */
    loadPersistedCoordinates() {
        const saved = storageAdapter.get(STORAGE_KEYS.PLAYER_POSITION);
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number' && saved.zoneId) {
            this.state.player_x = saved.x;
            this.state.player_y = saved.y;
            this.state.current_zone_id = saved.zoneId;
            return true;
        }
        return false;
    }

    /**
     * 将当前玩家坐标持久化至存储适配器 (对标 Rust: store.save_persisted_position())
     */
    persistCoordinates(force = false) {
        const now = Date.now();
        // 防抖/节流：默认至少间隔 300ms 或强制写入
        if (!force && (now - this._lastPosPersistTime < 300)) {
            return;
        }
        this._lastPosPersistTime = now;

        const loc = createPlayerLocation(
            this.state.player_x,
            this.state.player_y,
            this.state.current_zone_id
        );
        storageAdapter.set(STORAGE_KEYS.PLAYER_POSITION, loc);
    }

    /**
     * 集中式坐标变更与移动驱动 (对标 Rust: store.update_player_position(x, y, zone_id))
     */
    updatePlayerPosition(x, y, zoneId = null, options = { syncServer: false, persist: true }) {
        if (typeof x === 'number' && !isNaN(x)) {
            this.state.player_x = Math.max(100, Math.min(26900, x));
        }
        if (typeof y === 'number' && !isNaN(y)) {
            this.state.player_y = Math.max(100, Math.min(26900, y));
        }
        if (zoneId) {
            this.state.current_zone_id = String(zoneId);
        }

        if (options.persist) {
            this.persistCoordinates(false);
        }
    }

    /**
     * 🌟 采集工具等级对账 (防刷新后回落为 T1)
     * 双通道恢复: 1) localStorage 持久化等级 2) 从当前持有的工具物品 (背包+银行) 按名字推导品阶。
     * 工具物品本身已由区块链快照落库, 故推导通道天然抗刷新/多端同步。只升不降。
     */
    _reconcileToolLevels() {
        const levels = storageAdapter.get(TOOL_LEVELS_KEY, {}) || {};
        const toolEntries = Object.values(RESOURCE_TOOL_MAP); // [{ toolKey, toolName }]

        const scan = (it) => {
            if (!it || !it.name) return;
            const hit = toolEntries.find((v) => it.name.includes(v.toolName));
            if (!hit) return;
            // 品阶: 优先取 tier 字段, 其次从名字前缀 T8 提取 (服务端落库后 tier 仍在)
            const tier = Number(it.tier) || Number((it.name.match(/^T(\d+)/) || [])[1]) || 0;
            if (tier > 0) {
                levels[hit.toolKey] = Math.max(levels[hit.toolKey] || 0, tier);
            }
        };
        (this.state.backpack || []).forEach(scan);
        (this.state.bank_items || []).forEach(scan);

        // 写回 gameState (只升不降) 并回存本地持久化
        let changed = false;
        for (const key of Object.keys(levels)) {
            if (levels[key] > (this.state[key] || 0)) {
                this.state[key] = levels[key];
                changed = true;
            }
        }
        if (changed) {
            storageAdapter.set(TOOL_LEVELS_KEY, levels);
            console.log('[GameStore] 采集工具等级已对账恢复:', Object.entries(levels).filter(([, v]) => v > 0).map(([k, v]) => `${k}=T${v}`).join(', '));
        }
    }

    /**
     * 同步服务端全量快照 (状态机 Reducer / Diffing)
     * 对标 Rust: store.apply_snapshot(snapshot)
     */
    syncState(snap) {
        if (!snap) return;

        // 如果本地有持久化坐标且是首次同步，优先保持本地记忆
        const savedPos = storageAdapter.get(STORAGE_KEYS.PLAYER_POSITION);
        if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number' && savedPos.zoneId) {
            if (!this._audioInitialized) {
                snap.current_zone_id = savedPos.zoneId;
                snap.player_x = savedPos.x;
                snap.player_y = savedPos.y;
            }
        }

        // 规范化背包物品数据结构 (对齐双端 stack_count / stackCount / glyph / color)
        if (Array.isArray(snap.backpack)) {
            snap.backpack = snap.backpack.map((it) => {
                if (!it) return null;
                // 🌟 旧采集物命名迁移: 无品阶后缀的采集物改名 名字·T品阶.子品阶 (幂等);
                //    并从名字后缀推导补齐 subLevel/isGatherMat (服务端无这两个字段), 供乐观入包找堆与四圆点渲染
                it = deriveGatherFields(normalizeGatherItemNames(it));
                const name = it.name || '五行玄晶';
                const tier = Number(it.tier) || 1;
                const glyph = it.glyph || (
                    name.includes('铜钱') ? '🪙' :
                    name.includes('金币') ? '💰' :
                    name.includes('仙玉') || name.includes('纳玉') ? '💎' :
                    name.includes('木') ? '🪵' :
                    name.includes('草') || name.includes('芝') || name.includes('叶') || name.includes('药') ? '🌿' :
                    name.includes('皮') || name.includes('兽') ? '🦊' :
                    name.includes('石') || name.includes('矿') || name.includes('铁') || name.includes('晶') ? '⛏️' : '💎'
                );
                const colorHex = it.colorHex || it.color || (
                    name.includes('铜钱') ? '#f59e0b' :
                    name.includes('金币') ? '#eab308' :
                    name.includes('仙玉') ? '#38bdf8' :
                    tier >= 6 ? '#ef4444' :
                    tier >= 5 ? '#f59e0b' :
                    tier >= 4 ? '#a855f7' :
                    tier >= 3 ? '#38bdf8' : '#10b981'
                );
                const count = Number(it.stack_count !== undefined ? it.stack_count : it.stackCount) || 1;
                return {
                    ...it,
                    id: it.id || `item_${tier}_${Math.random().toString(36).slice(2, 7)}`,
                    itemId: it.itemId || it.item_id || name,
                    item_id: it.item_id || it.itemId || name,
                    name,
                    tier,
                    stack_count: count,
                    stackCount: count,
                    glyph,
                    color: colorHex,
                    colorHex,
                    weight: Number(it.weight) || 1.0
                };
            });
        }

        // 🌟 银行库存同步迁移旧采集物命名 (仓库中旧名物品改名后四圆点可从名字推导恢复)
        if (Array.isArray(snap.bank_items)) {
            snap.bank_items = snap.bank_items.map((it) => deriveGatherFields(normalizeGatherItemNames(it)));
        }

        if (!this._audioInitialized) {
            this._audioInitialized = true;
            Object.assign(this.state, snap);
            if (this.stashLayoutHook) {
                // 🌟 首次同步以持久化的手动布局为骨架 (含空格占位), 服务端物品按 id/name 回填原位,
                //    刷新页面后不再压实重排 (旧实现传空数组 → 物品全堆到前排 = "刷新后被排序")
                const savedLayout = this.stashLayoutHook.loadLayout ? this.stashLayoutHook.loadLayout() : [];
                this.state.backpack = this.stashLayoutHook.merge(
                    savedLayout,
                    snap.backpack,
                    snap.max_backpack || this.state.max_backpack
                );
            }
            this._reconcileToolLevels();
            this.persistCoordinates(true);
            return;
        }

        // 状态差异捕获用于音效与动效反馈
        const before = {
            level: this.state.level,
            sub_level: this.state.sub_level,
            realm_name: this.state.realm_name,
            copper: Number(this.state.copper) || 0,
            coins: Number(this.state.coins) || 0,
            jade: Number(this.state.jade) || 0,
            backpack_len: (this.state.backpack || []).filter(Boolean).length,
            quests: (this.state.active_quests || []).length,
            pending_breakthrough: this.state.pending_breakthrough,
        };

        const currentLocalX = this.state.player_x;
        const currentLocalY = this.state.player_y;
        const currentLocalZone = this.state.current_zone_id;

        // 🌟 在 Object.assign 之前保存本地背包引用，防止调试/本地添加的物品被服务端快照覆盖
        const localBackpackBefore = this.state.backpack;

        Object.assign(this.state, snap);

        // 🌟 防回弹平滑保护 (Anti-Rubberband Smooth Reconcile)
        // 若处于同一张地图内且偏差在正常移动延迟阈值 (250px) 内，保留客户端本地预测高频坐标，杜绝小回弹
        if (snap.player_x !== undefined && snap.player_y !== undefined && snap.current_zone_id === currentLocalZone) {
            const dist = Math.hypot(snap.player_x - currentLocalX, snap.player_y - currentLocalY);
            if (dist < 250) {
                this.state.player_x = currentLocalX;
                this.state.player_y = currentLocalY;
            }
        }

        // 持久化当前有效区域与坐标
        if (snap.current_zone_id && snap.player_x !== undefined && snap.player_y !== undefined) {
            this.persistCoordinates(false);
        }

        // 🌟 背包网格合并：以本地背包为基础，用服务端数据刷新同 id/name 物品，保留本地独有物品。
        //    无论排序模式如何都走合并保布局: 排序只在点击瞬间物理重排一次,
        //    若同步时用服务端顺序整体替换 (旧"排序开启"分支), 拖拽换位会在下一秒被冲回原位。
        const serverBp = Array.isArray(snap.backpack) ? snap.backpack : [];
        if (this.stashLayoutHook) {
            this.state.backpack = this.stashLayoutHook.merge(
                localBackpackBefore || [],
                serverBp,
                snap.max_backpack || this.state.max_backpack
            );
        } else if (serverBp.length > 0) {
            this.state.backpack = serverBp;
        }

        // 触发音效系统
        this._playEventSounds(before, snap);

        // 🌟 每次快照同步后对账工具等级 (刷新/存取/多端同步后都不回落)
        this._reconcileToolLevels();
    }

    /**
     * 中央动作分发派发器 (对标 Rust: store.dispatch(Action::BuyTradeGoods(...)))
     */
    async dispatchAction(actionKey, payload = {}) {
        // 关键业务动作自动存入本地区块链单向哈希日志
        const internalKeys = ['sync_pos', 'audit_movement_report', 'sync_hash_chain', 'cloud_state_snapshot', 'audit_item_drop'];
        if (actionKey && !internalKeys.includes(actionKey)) {
            localHashChain.appendAction(actionKey, payload);
        }

        const fullPayload = { 
            key: actionKey, 
            player_x: this.state.player_x,
            player_y: this.state.player_y,
            zone_id: this.state.current_zone_id,
            ...payload 
        };
        const snap = await networkAdapter.invoke('action', fullPayload);
        if (snap) {
            this.syncState(snap);
        }
        return snap;
    }

    /**
     * 基础敲击 / 锻造动作分发
     */
    async dispatchStrike() {
        localHashChain.appendAction('strike_forge', { timestamp: Date.now() });
        const snap = await networkAdapter.invoke('strike');
        if (snap) {
            this.syncState(snap);
        }
        return snap;
    }

    /**
     * 周期 Tick 分发
     */
    async dispatchTick() {
        const snap = await networkAdapter.invoke('tick');
        if (snap) {
            this.syncState(snap);
        }
        return snap;
    }

    /**
     * 获取全量状态只读视图
     */
    getState() {
        return this.state;
    }

    /**
     * 设置全屏/中央浮空提示 (Toast)
     */
    setToast(msg, color = '#00ffc8') {
        if (!msg) return;
        this.state.toast = msg;
        this.state.last_log = msg;
        this.addLog(msg);
        if (typeof window !== 'undefined') {
            try {
                import('../world/fx.js').then(({ fx }) => {
                    if (fx && fx.addCriticalText) {
                        fx.addCriticalText(msg, color, 18, 1.8);
                    }
                }).catch(() => {});
            } catch (_) {}
        }
    }

    set_toast(msg, color = '#00ffc8') {
        this.setToast(msg, color);
    }

    /**
     * 追加游戏日志
     */
    addLog(msg) {
        if (!msg) return;
        if (!Array.isArray(this.state.logs)) {
            this.state.logs = [];
        }
        this.state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
        if (this.state.logs.length > 100) {
            this.state.logs.length = 100;
        }
        this.state.last_log = msg;
    }

    add_log(msg) {
        this.addLog(msg);
    }

    /**
     * 音效与天道突破事件流
     */
    _playEventSounds(before, snap) {
        if (before.level === 0 && before.copper === 0) return;

        const newCoins = Number(snap.coins) || 0;
        if (newCoins > before.coins && snap.coins !== undefined) {
            audio.playCoin();
        }

        const newCopper = Number(snap.copper) || 0;
        if (newCopper > before.copper && snap.copper !== undefined) {
            audio.playCopper();
        }

        const newJade = Number(snap.jade) || 0;
        if (newJade > before.jade && snap.jade !== undefined) {
            audio.playJade();
        }

        if (Number(snap.level) > before.level) {
            audio.playUpgrade();
        }

        // 突破事件与境界音效判断：必须 snap 明确提供了有效字段且确实发生了境界突破才触发
        if (snap.sub_level !== undefined && before.sub_level !== undefined) {
            const newSub = Number(snap.sub_level) || 0;
            const newRealm = snap.realm_name;
            if (newSub < before.sub_level || (newRealm && before.realm_name && newRealm !== before.realm_name)) {
                audio.playBreakthrough();
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('game:breakthrough'));
                }
            }
        } else if (snap.realm_name && before.realm_name && snap.realm_name !== before.realm_name) {
            audio.playBreakthrough();
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('game:breakthrough'));
            }
        }

        // 🌟 比较实际物品数而非数组长度 (背包是 null 填充的定长槽位数组, 长度含空槽会误报新物品音效);
        //    并做 1.5 秒节流: 银行批量取出时多次同步各增 1 件, 旧实现每次同步都响一声狂叫个不停,
        //    节流后一波入包只响一次; 正常单次采集读条远超 1.5 秒不受影响。
        if ((snap.backpack || []).filter(Boolean).length > before.backpack_len) {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (!this._lastNewItemSfxAt || now - this._lastNewItemSfxAt > 1500) {
                this._lastNewItemSfxAt = now;
                audio.playSwordBorn();
            }
        }
    }
}

// 导出全局单例状态存储器
export const gameStore = new GameStore();
