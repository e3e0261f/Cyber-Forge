/** 专门负责安全导出全局 PIXI 对象的桥梁文件 */
// 假设 pixi.min.js 挂载在 window.PIXI 上
import '/home/lee/DOwn/Cyber-Forge/ui/js/pixi.min.js';

export const PIXI = window.PIXI;
