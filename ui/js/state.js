/*
 * 模块功能: 游戏全局状态机、物理时钟、最多并存3窗口与坐标记忆管理器
 * 修改时间: 2026-08-18 (添加音频 diff 检测)
 */

import { audio } from './audio.js';

export const gameState = {
    copper: '0', coins: '0', jade: '0',
    level: 1, exp: 0, max_exp: 5000,
    hammer_name: '凡铁锤', hammer_level: 1, hammer_power: '1.00',
    interval_secs: 1.0, forge_qte_hits: 0,
    sub_level: 1, realm_name: '炼体',
    matrix_slots: 1, concurrent_hammers: 1,
    currency_protocol: '[天道纳玉]',
    currency_protocol_color: '#00ffc8',
    matrix_progresses: [],
    backpack: [],
    lots: [],
    logs: [],
    quests: [],
    active_quests: [],
    quest_next_refresh_secs: 0
};

// 🌟 多窗口并存 (最多3个) 与坐标记忆总控
export const uiState = {
    activeModals: new Set(), // 记录当前打开的窗口集合 (最多3个)
    maxModals: 3,

    // 🌟 坐标记忆库：记录每个窗口最后被拖拽的位置
    modalPositions: {
        stash: { x: null, y: null },
        auction: { x: null, y: null },
        apprentice: { x: null, y: null },
        logs: { x: null, y: null },
        body: { x: null, y: null },
        inspect: { x: null, y: null },
        quest: { x: null, y: null },
        debug: { x: null, y: null }
    },

    draggingModal: null, // 当前正在拖拽的窗口 ID
    dragOffset: { x: 0, y: 0 },

    toggleModal(id) {
        if (this.activeModals.has(id)) {
            this.activeModals.delete(id);
        } else {
            // 若超过 3 个窗口，自动关闭最早打开的那个
            if (this.activeModals.size >= this.maxModals) {
                const oldest = this.activeModals.values().next().value;
                this.activeModals.delete(oldest);
            }
            this.activeModals.add(id);
        }
        // 🎵 弹窗开合 UI 音
        audio.playUI();
    },

    closeModal(id) {
        if (id) {
            this.activeModals.delete(id);
        } else {
            this.activeModals.clear();
        }
        this.draggingModal = null;
    },

    isOpen(id) {
        return this.activeModals.has(id);
    },

    // 全局指针坐标（背包/拍卖悬停 tooltip）
    mouseX: 0,
    mouseY: 0
};

export const clock = {
    localCycleStartTime: performance.now(),
    get duration() {
        return Math.max(0.05, gameState.interval_secs);
    },
    get progress() {
        const elapsed = ((performance.now() - this.localCycleStartTime) / 1000) % this.duration;
        return Math.min(1.0, elapsed / this.duration);
    },
    get isCrit() {
        const p = this.progress;
        return p >= 0.76 && p < 0.88;
    },
    resetCycle() {
        this.localCycleStartTime = performance.now();
    }
};

let _audioInitialized = false; // 首次同步防抖标志

export function syncState(snap) {
    if (!snap) return;

    // 首次同步：只记录状态，不触发音效
    if (!_audioInitialized) {
        _audioInitialized = true;
        Object.assign(gameState, snap);
        if (stashLayoutHook && stashLayoutHook.isOff()) {
            gameState.backpack = stashLayoutHook.merge(
                [],
                snap.backpack,
                snap.max_backpack || gameState.max_backpack
            );
        }
        return;
    }

    // 🎵 音频 diff 检测：在 Object.assign 覆盖前捕获旧值
    const before = {
        level: gameState.level,
        sub_level: gameState.sub_level,
        realm_name: gameState.realm_name,
        copper: Number(gameState.copper) || 0,
        coins: Number(gameState.coins) || 0,
        jade: Number(gameState.jade) || 0,
        backpack_len: (gameState.backpack || []).length,
        quests: (gameState.active_quests || []).length,
        pending_breakthrough: gameState.pending_breakthrough,
    };

    // 延迟 require 式导入会循环；由 stash-view 在下方静态导入处理关闭排序合并
    const localBag = gameState.backpack;
    Object.assign(gameState, snap);

    if (stashLayoutHook && stashLayoutHook.isOff()) {
        gameState.backpack = stashLayoutHook.merge(
            localBag,
            snap.backpack,
            snap.max_backpack || gameState.max_backpack
        );
    }

    // 🎵 音频事件触发 (基于新旧状态 diff)
    playEventSounds(before, snap);
}

/** 🎵 基于新旧状态差异触发对应音效 (节流由 audio 内部处理) */
function playEventSounds(before, snap) {
    // 防抖：首次同步不触发音效 (初始化)
    if (before.level === 0 && before.copper === 0) return;

    // 金币增加 -> 入账音
    const newCoins = Number(snap.coins) || 0;
    if (newCoins > before.coins && snap.coins !== undefined) {
        audio.playCoin();
    }

    // 铜钱增加
    const newCopper = Number(snap.copper) || 0;
    if (newCopper > before.copper && snap.copper !== undefined) {
        audio.playCopper();
    }

    // 仙玉增加 -> 水晶音
    const newJade = Number(snap.jade) || 0;
    if (newJade > before.jade && snap.jade !== undefined) {
        audio.playJade();
    }

    // 等级提升 -> 升级音
    if (Number(snap.level) > before.level) {
        audio.playUpgrade();
    }

    // 境界变化 (sub_level 或 realm_name 改变) -> 突破音 + Juice 大阵震
    const newSub = Number(snap.sub_level) || 0;
    const newRealm = snap.realm_name;
    if ((newSub < before.sub_level) || (newRealm && newRealm !== before.realm_name)) {
        // 渡劫失败 (层数回退) 或成功换境界
        audio.playBreakthrough();
        // 🌟 P0-2 Juice: 解耦事件总线，world.js 监听后触发大震屏 + 慢镜头
        window.dispatchEvent(new CustomEvent('game:breakthrough'));
    }

    // 背包新增物品 -> 神兵诞生音 (排除初始状态)
    if ((snap.backpack || []).length > before.backpack_len) {
        audio.playSwordBorn();
    }
}

/** stash-view 注册：关闭自动排序时保留格子布局 */
let stashLayoutHook = null;
export function registerStashLayoutHook(hook) {
    stashLayoutHook = hook;
}
