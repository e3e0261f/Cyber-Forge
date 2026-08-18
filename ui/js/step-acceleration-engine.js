/*
 * 模块功能: 阶梯加速引擎 (Step Acceleration Engine)
 */
import { gameConfig } from './config.js';

// 不需要加速的按键白名单：空格、上下左右、自动上架、自动熔炼、排序、互换协议等选择功能按键
const NO_ACCELERATION_WHITELIST = [
    'Space',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'KeyW', 'KeyS', 'KeyA', 'KeyD', // 方向控制
    'Btn_i', 'Btn_o', // 自动上架, 自动熔炼
    'Btn_I', 'Btn_O', // 排序
    'Btn_u', 'Btn_w', 'Btn_n', 'Btn_r', 'Btn_d', 'Btn_e', // 互换协议等面板操作
    'KeyU', 'KeyN', 'KeyR', 'KeyD', 'KeyE', // 互换协议对应的键盘按键
    'Escape', 'Digit0'
];

export function getStepMultiplier(code, hits) {
    if (NO_ACCELERATION_WHITELIST.includes(code)) {
        return 1;
    }
    
    // 无极阶梯加速，没有封顶限制
    // 根据按压次数 hits 动态计算
    if (hits <= 0) return 1;
    
    let step = 1;
    let threshold = 10;
    while (hits >= threshold) {
        step *= 10;
        threshold *= 10;
    }
    return step;
}
