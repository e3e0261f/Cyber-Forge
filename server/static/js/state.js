/*
 * 模块功能: 游戏全局状态机、物理时钟、多窗口并存与坐标记忆管理器
 * 文件路径: ui/js/state.js
 * 
 * 遵循 Rust 预备役架构规范：
 * 维度一：数据结构与逻辑/UI彻底分离 (通过 models/structs.js)
 * 维度二：全局状态机集中化 (通过 store/game-store.js 单一真实数据源)
 * 维度三：I/O与存储抽象隔离 (通过 adapters/storage-adapter.js 与 network-adapter.js)
 */

import { audio } from './audio.js';
import { gameStore } from './store/game-store.js';

/** 向中央 Store 注册：关闭自动排序时保留格子布局 */
export function registerStashLayoutHook(hook) {
    gameStore.registerStashLayoutHook(hook);
}

// 导出中央状态机的唯一状态引用 (Single Source of Truth)
export const gameState = gameStore.state;

// 🌟 多窗口并存 (无上限) 与坐标记忆总控
export const uiState = {
    activeModals: new Set(),

    modalMaximized: {},

    modalPositions: {
        map: { x: null, y: null },
        stash: { x: null, y: null },
        auction: { x: null, y: null },
        apprentice: { x: null, y: null },
        logs: { x: null, y: null },
        body: { x: null, y: null },
        inspect: { x: null, y: null },
        quest: { x: null, y: null },
        debug: { x: null, y: null },
        settings: { x: null, y: null },
        trade: { x: null, y: null },
        bank: { x: null, y: null }
    },

    draggingModal: null,
    dragOffset: { x: 0, y: 0 },

    openModal(id) {
        if (!this.activeModals.has(id)) {
            this.activeModals.add(id);
            audio.playUI();
        } else {
            // 已打开的窗口移到最前
            this.bringToFront(id);
        }
    },

    toggleModal(id) {
        if (this.activeModals.has(id)) {
            this.activeModals.delete(id);
        } else {
            this.activeModals.add(id);
        }
        audio.playUI();
    },

    /** 将指定窗口移到最顶层 (Set 末尾 = 最后绘制 = 最上层) */
    bringToFront(id) {
        if (this.activeModals.has(id)) {
            this.activeModals.delete(id);
            this.activeModals.add(id);
        }
    },

    toggleMaximize(id) {
        this.modalMaximized[id] = !this.modalMaximized[id];
        return this.modalMaximized[id];
    },

    isMaximized(id) {
        return this.modalMaximized[id] === true;
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

/**
 * 统一状态同步函数 (委托给 Central GameStore 处理)
 */
export function syncState(snap) {
    gameStore.syncState(snap);
}

export { gameStore };
