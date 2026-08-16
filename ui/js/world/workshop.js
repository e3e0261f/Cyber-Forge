/**
 * 锻造构件系统：黑金铁砧绝对锚定背景石台 + 圣剑 + 重锤 + 交互蓝图
 * 文件路径：ui/js/world/workshop.js
 */
import { textures } from './assets.js';
import { gameState, clock } from '../state.js';
import { fx } from './fx.js';
import { bgMetrics } from './environment.js';

let hammerAngle = -0.48;
let hammerTargetAngle = -0.48;

export function setHammerTarget(angle) {
    hammerTargetAngle = angle;
}

// 获取铁砧在屏幕上的绝对锚定坐标 (死死锁在背景石台中心)
export function getAnvilAnchor() {
    return {
        x: bgMetrics.daisX || window.innerWidth * 0.5,
        y: bgMetrics.daisY || window.innerHeight * 0.59
    };
}

// 文件路径：ui/js/world/workshop.js

// =========================================================================
// 🎛️ 【铁砧与圣剑位置/角度自由微调面板 - 随时在此直接修改数字】
// =========================================================================
export const ANVIL_CONFIG = {
    // 1. 铁砧贴图参数
    scale: 1.0,           // 铁砧整体缩放比例 (1.0 为标准, 可改 1.1, 0.9 等)
    angle: -0.07,         // 铁砧旋转角度 (弧度，正数顺时针，负数逆时针)
    offsetX: 0,           // 水平偏移像素 (正数向右，负数向左)
    offsetY: -15,         // 垂直偏移像素 (正数向下，负数向上)

    // 2. 砧上圣剑参数
    swordScale: 1.0,      // 圣剑缩放
    swordAngle: -0.10,    // 圣剑倾斜角度 (与砧面斜度贴合)
    swordOffsetX: -95,    // 圣剑 X 偏移
    swordOffsetY: -38,    // 圣剑 Y 偏移 (贴合铁砧上表面)
};
// =========================================================================

export function drawAnvil(ctx, w, h, now, time) {
    const anchor = getAnvilAnchor();
    const ax = anchor.x + ANVIL_CONFIG.offsetX;
    const ay = anchor.y + ANVIL_CONFIG.offsetY;

    // 1. 绘制真实天道铁砧 (结合微调配置)
    if (textures.anvil) {
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ANVIL_CONFIG.angle);
        ctx.scale(ANVIL_CONFIG.scale, ANVIL_CONFIG.scale);
        ctx.drawImage(textures.anvil, -130, -110, 260, 220);
        ctx.restore();
    }

    // 2. 绘制砧上圣剑 (结合微调配置)
    const sx = ax + ANVIL_CONFIG.swordOffsetX;
    const sy = ay + ANVIL_CONFIG.swordOffsetY;
    const swordW = 190 * ANVIL_CONFIG.swordScale;
    const swordH = 42 * ANVIL_CONFIG.swordScale;

    if (textures.sword) {
        ctx.save();
        ctx.translate(sx + swordW / 2, sy + swordH / 2);
        ctx.rotate(ANVIL_CONFIG.swordAngle);

        // 绘制剑胚底胎
        ctx.drawImage(textures.sword, -swordW / 2, -swordH / 2, swordW, swordH);

        // 熔岩光刃充能
        const p = clock.progress;
        const inCrit = clock.isCrit;
        if (p > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const bladeGrad = ctx.createLinearGradient(-50, 0, 85, 0);
            if (inCrit) {
                bladeGrad.addColorStop(0, 'rgba(255, 77, 122, 0.95)');
                bladeGrad.addColorStop(1, 'rgba(255, 255, 255, 1.0)');
            } else {
                bladeGrad.addColorStop(0, 'rgba(255, 60, 0, 0.85)');
                bladeGrad.addColorStop(0.6, 'rgba(255, 140, 0, 0.85)');
                bladeGrad.addColorStop(1, 'rgba(255, 215, 0, 0.95)');
            }
            ctx.fillStyle = bladeGrad;
            ctx.shadowColor = inCrit ? '#ff4d7a' : '#ffd700';
            ctx.shadowBlur = inCrit ? 26 : 14;
            ctx.fillRect(-50, -6, 130 * p, 12);
            ctx.restore();
        }

        ctx.restore();
    }
}

// 🌟 2. 绘制重锤 (握柄悬于右上方，重击正中剑胚)
export function drawHammer(ctx, w, h) {
    const anchor = getAnvilAnchor();
    const ax = anchor.x;
    const ay = anchor.y;

    hammerAngle += (hammerTargetAngle - hammerAngle) * 0.32;
    if (hammerTargetAngle > -0.48) hammerTargetAngle -= 0.14;

    ctx.save();
    ctx.translate(ax + 30, ay - 60);
    ctx.rotate(hammerAngle);

    // 锤柄 (皮绳缠绕)
    ctx.fillStyle = '#8c5836';
    ctx.fillRect(-7, -75, 14, 70);
    ctx.strokeStyle = '#d4a878';
    ctx.lineWidth = 1.2;
    for (let y = -70; y <= -15; y += 11) {
        ctx.beginPath();
        ctx.moveTo(-7, y); ctx.lineTo(7, y + 4);
        ctx.stroke();
    }

    // 重型八角玄铁锤头
    const isCritHit = clock.isCrit;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = isCritHit ? '#ff4d7a' : '#ffd700';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-30, -102, 60, 35, 6);
    ctx.fill(); ctx.stroke();

    // 锤心雷灵珠
    ctx.fillStyle = isCritHit ? '#ff4d7a' : '#00e5ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, -84, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
}

// 🌟 3. 发条小机偶 (站立在石台右侧)
export function drawApprentice(ctx, w, h, time) {
    const anchor = getAnvilAnchor();
    const gx = anchor.x + 135;
    const gy = anchor.y + 15;

    if (textures.robot) {
        ctx.save();
        ctx.translate(gx, gy);
        const bob = Math.sin(time * 3) * 3;
        ctx.drawImage(textures.robot, -40, -55 + bob, 80, 110);
        ctx.restore();
    }
}

// 🌟 4. 动力活塞机械臂 (置于石台左上方连接处)
export function drawPiston(ctx, w, h, time) {
    const anchor = getAnvilAnchor();
    const px = anchor.x - 170;
    const py = anchor.y - 45;
    const shift = Math.sin(time * (2.0 / Math.max(0.1, gameState.interval_secs))) * 14;

    if (textures.piston) {
        ctx.save();
        ctx.translate(px + shift, py);
        ctx.drawImage(textures.piston, -80, -60, 160, 120);
        ctx.restore();
    }
}

// 🌟 5. 灵晶簇 (左右两端台阶处)
export function drawCrystals(ctx, w, h, time) {
    if (!textures.crystals) return;
    const breath = 0.8 + Math.sin(time * 2) * 0.2;

    // 左下石阶晶石
    ctx.save();
    ctx.translate(w * 0.08, h * 0.82);
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 22 * breath;
    ctx.drawImage(textures.crystals, -65, -75, 130, 150);
    ctx.restore();

    // 右下石阶晶石
    ctx.save();
    ctx.translate(w * 0.90, h * 0.82);
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 22 * breath;
    ctx.drawImage(textures.crystals, -65, -75, 130, 150);
    ctx.restore();
}

export function drawRunicFloor(ctx, w, h, time) {
    // 原画地面自带了极品太极八卦金光阵，此处仅绘制击锤扩散光圈
}

export function drawBlueprint(ctx, w, h, time) {
    const hx = w * 0.80, hy = h * 0.35, bw = 180, bh = 130;
    ctx.fillStyle = fx.isHoloHovered ? 'rgba(0, 60, 95, 0.65)' : 'rgba(0, 40, 65, 0.45)';
    ctx.strokeStyle = fx.isHoloHovered ? '#00ffff' : 'rgba(0, 229, 255, 0.65)';
    ctx.lineWidth = fx.isHoloHovered ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(hx - bw / 2, hy - bh / 2, bw, bh, 8);
    ctx.fill(); ctx.stroke();

    const scanY = hy - bh / 2 + ((time * 42) % bh);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - bw / 2 + 4, scanY);
    ctx.lineTo(hx + bw / 2 - 4, scanY);
    ctx.stroke();

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('⚡ 全息神兵蓝图 (点击查看)', hx - bw / 2 + 10, hy - bh / 2 + 22);

    ctx.fillStyle = '#99f6e4';
    ctx.font = '10px monospace';
    ctx.fillText(`品阶: 绝品 · 九劫圣器`, hx - bw / 2 + 12, hy - bh / 2 + 44);
    ctx.fillText(`五行: 庚金生水 · 阳极`, hx - bw / 2 + 12, hy - bh / 2 + 60);
    ctx.fillText(`锋锐: 100% 满淬炼`, hx - bw / 2 + 12, hy - bh / 2 + 76);
    ctx.fillText(`指纹: #Z7kQ-9mA3F2`, hx - bw / 2 + 12, hy - bh / 2 + 92);
    ctx.fillText(`始祖: 纯阳真仙`, hx - bw / 2 + 12, hy - bh / 2 + 108);
}
