/*
 * 模块功能: 游戏全局系统参数、按键速度配置与导航定义
 * 修改时间: 2026-08-16 19:35
 */

export const gameConfig = {
    // 🌟 1. 按键频率与心跳配置 (毫秒)
    spaceIntervalMs: 35,          // 空格疯狂扫射间隔
    otherKeysIntervalMs: 250,     // 默认其他按键连发间隔 (250ms)
    heartbeatIntervalMs: 150,     // 后端心跳同步间隔 (150ms)

    // 🌟 2. 阶梯提速算法配置表 (随时可调整点数与倍率)
    stepTiers: [
        { hitsThreshold: 1000, stepSize: 1000 },  // 1000点后: 每次 +1000
        { hitsThreshold: 100,  stepSize: 100 },   // 100点后: 每次 +100
        { hitsThreshold: 10,   stepSize: 10 },    // 10点后: 每次 +10
        { hitsThreshold: 0,    stepSize: 1 }      // 初始阶段: 每次 +1
    ],

    // 🌟 3. 统一顶部四大功能导航栏定义 (彻底根绝坐标偏移 Bug)
    navButtons: [
        { id: 'stash', label: '🎒 锦囊(B)', color: '#38bdf8', defaultKey: 'KeyB' },
        { id: 'auction', label: '🏛️ 拍阁(P)', color: '#e0a050', defaultKey: 'KeyP' },
        { id: 'apprentice', label: '🛠️ 学徒(M)', color: '#f59e0b', defaultKey: 'KeyM' },
        { id: 'logs', label: '📜 日志(I)', color: '#a855f7', defaultKey: 'KeyI' },
        { id: 'body', label: '👤 身体(C)', color: '#22c55e', defaultKey: 'KeyC' }
    ],

    // 快捷键排除黑名单
    excludeHoldKeys: ['KeyP', 'KeyH', 'Digit0', 'Escape']
};
