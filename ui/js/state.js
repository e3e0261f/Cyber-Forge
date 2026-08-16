/*
 * 模块功能: 游戏全局状态机、物理时钟、最多并存3窗口与坐标记忆管理器
 * 修改时间: 2026-08-16 19:35
 */

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
    logs: []
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
        inspect: { x: null, y: null }
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

export function syncState(snap) {
    if (!snap) return;

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
}

/** stash-view 注册：关闭自动排序时保留格子布局 */
let stashLayoutHook = null;
export function registerStashLayoutHook(hook) {
    stashLayoutHook = hook;
}
