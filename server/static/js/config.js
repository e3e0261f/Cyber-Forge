/*
 * 模块功能: 游戏全局系统参数、按键速度配置与导航定义
 */

/** 开发者模式检测：仅本地/回环地址访问时开启调试面板 */
export const isDevMode = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '0.0.0.0' || location.hostname === '';

export const gameConfig = {
    spaceIntervalMs: 35,
    otherKeysIntervalMs: 250,
    heartbeatIntervalMs: 150,

    stepTiers: [
        { hitsThreshold: 1000000, stepSize: 1000000 }, 
        { hitsThreshold: 100000, stepSize: 100000 },
        { hitsThreshold: 10000, stepSize: 10000 },
        { hitsThreshold: 1000, stepSize: 1000 },
        { hitsThreshold: 100,  stepSize: 100 },
        { hitsThreshold: 10,   stepSize: 10 },
        { hitsThreshold: 0,    stepSize: 1 }
    ],

    // 🌟 规范化导航快捷键：[Tab/M]区域地图 [Shift+Tab/L]世界地图 [T]商票驿站 [B]锦囊 [P]拍阁 [J]任务 [N]学徒 [I]日志 [C]身体 [F3]调试 [系统]设置
    navButtons: [
        { id: 'map_zone', targetModal: 'map', tab: 'zone', label: '🧭 区域(Tab)', color: '#38bdf8', defaultKey: 'Tab' },
        { id: 'map_world', targetModal: 'map', tab: 'world', label: '🗺️ 九州(S+Tab)', color: '#00ffc8', defaultKey: 'KeyL' },
        { id: 'trade', targetModal: 'trade', label: '📜 驿站(T)', color: '#f59e0b', defaultKey: 'KeyT' },
        { id: 'stash', targetModal: 'stash', label: '🎒 锦囊(B)', color: '#38bdf8', defaultKey: 'KeyB' },
        { id: 'auction', targetModal: 'auction', label: '🏛️ 拍阁(P)', color: '#e0a050', defaultKey: 'KeyP' },
        { id: 'quest', targetModal: 'quest', label: '📋 任务(J)', color: '#f97316', defaultKey: 'KeyJ' },
        { id: 'apprentice', targetModal: 'apprentice', label: '🛠️ 学徒(N)', color: '#f59e0b', defaultKey: 'KeyN' },
        { id: 'logs', targetModal: 'logs', label: '📜 日志(I)', color: '#a855f7', defaultKey: 'KeyI' },
        { id: 'body', targetModal: 'body', label: '👤 身体(C)', color: '#22c55e', defaultKey: 'KeyC' },
        ...(isDevMode ? [{ id: 'debug', targetModal: 'debug', label: '🎛️ 调试(F3)', color: '#ec4899', defaultKey: 'F3' }] : []),
        { id: 'settings', targetModal: 'settings', label: '⚙️ 系统', color: '#38bdf8' }
    ],

    excludeHoldKeys: ['KeyP', 'KeyH', 'Digit0', 'Escape', 'KeyL', 'KeyM', 'KeyB', 'KeyJ', 'KeyN', 'KeyI', 'KeyC', 'KeyT', 'Tab']
};
