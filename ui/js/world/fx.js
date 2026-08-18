/*
 * 模块功能: 锻造粒子物理、冲击波、3D地脉涟漪、浮空飘字 + Juice屏幕反馈 (v2.5.10 P0-2)
 * 新增: 全屏闪光、慢镜头 (timeScale)、连击聚能光环、大飘字、渡劫大震触发
 * 修改时间: 2026-08-18
 */

import { gameState } from '../state.js';
import { bgMetrics } from './environment.js';

export const fx = {
    sparks: [],
    shockwaves: [],
    steamPuffs: [],
    furnaceEmbers: [],
    gridRipples: [],
    floatingTexts: [],
    criticalTexts: [],
    flashes: [],
    ambientMotes: [],

    // 🌟 P0-2 Juice 新状态
    comboCount: 0,           // 连击数 (input.js 维护)
    comboColor: '#ffd700',   // 连击光环颜色 (随连击升级)
    timeScale: 1.0,          // 慢动作系数 0~1
    timeFrames: 0,           // 慢动作剩余帧数
    breakthroughTick: 0,     // 渡劫大震剩余帧数 (world.js 驱动)

    isHoloHovered: false,

    /** 清理所有瞬态特效 */
    clearTransient() {
        this.sparks.length = 0;
        this.shockwaves.length = 0;
        this.steamPuffs.length = 0;
        this.floatingTexts.length = 0;
        this.criticalTexts.length = 0;
        this.flashes.length = 0;
        this.gridRipples.length = 0;
        this.comboCount = 0;
        this.comboColor = '#ffd700';
        this.timeScale = 1.0;
        this.timeFrames = 0;
        this.breakthroughTick = 0;
    },

    /** ⚡ 设置连击数 (由 input.js 调用) */
    setCombo(count) {
        this.comboCount = Math.max(0, count);
        if (count >= 20) this.comboColor = '#ffffff';
        else if (count >= 10) this.comboColor = '#ff4d7a';
        else this.comboColor = '#ffd700';
    },

    /** 💥 添加全屏闪光层 */
    addFlash(color, maxAlpha, decayRate = 0.08) {
        this.flashes.push({ color, alpha: maxAlpha, decay: decayRate });
    },

    /** 🐌 慢镜头 (持续 frames 帧后恢复) */
    setTimeScale(scale = 0.4, frames = 12) {
        this.timeScale = scale;
        this.timeFrames = frames;
    },

    /** 📝 大飘字 */
    addCriticalText(text, color, size = 30, life = 1.2) {
        const w = window.innerWidth || 800, h = window.innerHeight || 600;
        const x = (bgMetrics && bgMetrics.daisX) ? bgMetrics.daisX : w * 0.5;
        const y = (bgMetrics && bgMetrics.daisY) ? (bgMetrics.daisY - 30) : (h * 0.59 - 30);
        this.criticalTexts.push({
            x, y,
            text, color, size,
            life,
            vy: -0.8,
            alpha: 1.0
        });
    },

    /** ⛩️ 渡劫/大境界突破 - 大震屏 (由 state.js 境界变化时调用) */
    triggerBreakthroughJuice() {
        // 全屏白金闪光
        this.addFlash('#fff8e0', 0.55, 0.018);
        // 慢镜头 0.25x 持续 20 帧
        this.setTimeScale(0.25, 20);
        // 大飘字
        this.addCriticalText('⛩ 天劫降临', '#ffffff', 42, 1.8);
        this.addCriticalText('勘破迷障 · 境界提升', 'rgba(255,220,120,1)', 22, 1.2);
        // 巨型双冲击波
        const w = window.innerWidth || 800, h = window.innerHeight || 600;
        const ax = (bgMetrics && bgMetrics.daisX) ? bgMetrics.daisX : w * 0.5;
        const ay = (bgMetrics && bgMetrics.daisY) ? (bgMetrics.daisY - 30) : h * 0.59 - 30;
        this.shockwaves.push({ x: ax, y: ay, radius: 16, maxRadius: 340, alpha: 1.0, color: '#ffffff', width: 6 });
        this.shockwaves.push({ x: ax, y: ay, radius: 8, maxRadius: 220, alpha: 0.9, color: '#ffd700', width: 4 });
        // 大震动标记 (world.js 每帧读取)
        this.breakthroughTick = 14;
    },

    /** 🖊️ 挥锤打击特效 */
    triggerStrikeFX(isCrit, w, h) {
        const anchorX = (bgMetrics && bgMetrics.daisX) ? bgMetrics.daisX : (w * 0.5);
        const anchorY = (bgMetrics && bgMetrics.daisY) ? (bgMetrics.daisY - 30) : (h * 0.59 - 30);

        this.floatingTexts.push({
            x: anchorX + (Math.random() - 0.5) * 30,
            y: anchorY - 25,
            text: isCrit ? `⚡ 完美暴击 +${gameState.hammer_power}` : `+${gameState.hammer_power} 淬火`,
            color: isCrit ? '#ff4d7a' : '#ffd700',
            scale: isCrit ? 1.4 : 1.0,
            alpha: 1.0,
            vy: -(1.8 + Math.random() * 0.8)
        });

        this.shockwaves.push({
            x: anchorX, y: anchorY,
            radius: 12, maxRadius: isCrit ? 135 : 70,
            alpha: 1.0,
            color: isCrit ? '#ff4d7a' : '#ffd700',
            width: isCrit ? 4.0 : 2.5
        });

        if (this.gridRipples.length < 4) {
            this.gridRipples.push({
                progress: 0.0,
                speed: isCrit ? 0.025 : 0.016,
                color: isCrit ? 'rgba(255, 77, 122,' : 'rgba(224, 160, 80,',
                alpha: 0.85
            });
        }

        const fistX = w * 0.31, fistY = h * 0.55;
        for (let i = 0; i < 8; i++) {
            this.steamPuffs.push({
                x: fistX - 35, y: fistY - 15,
                vx: -(2.0 + Math.random() * 3.0),
                vy: (Math.random() - 0.5) * 1.8,
                size: 10 + Math.random() * 12,
                alpha: 0.8
            });
        }

        const count = isCrit ? 36 : 18;
        for (let i = 0; i < count; i++) {
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
            const spd = (isCrit ? 7.5 : 4.2) + Math.random() * 5.5;
            this.sparks.push({
                x: anchorX, y: anchorY,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 1.0,
                crit: isCrit,
                size: isCrit ? 3.5 + Math.random() * 2.0 : 2.0 + Math.random() * 1.5
            });
        }

        // 🌟 P0-2 Juice: 暴击附加全屏闪光 + 大飘字 + 慢镜头
        if (isCrit) {
            this.addFlash('#ffd700', 0.35, 0.06);
            this.setTimeScale(0.35, 8);
            this.addCriticalText('完美暴击！', '#ff4d7a', 42, 1.1);
        }
    }
};

export function initMotes(w, h) {
    fx.ambientMotes = [];
    for (let i = 0; i < 30; i++) {
        fx.ambientMotes.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.4,
            vy: -(0.2 + Math.random() * 0.5),
            size: 1.0 + Math.random() * 2.0,
            alpha: 0.2 + Math.random() * 0.5,
            color: Math.random() > 0.5 ? '#00e5ff' : '#ffd700'
        });
    }
}

export function drawParticles(ctx, w, h) {
    // ===== 慢镜头帧递减 =====
    if (fx.timeFrames > 0) {
        fx.timeFrames--;
        if (fx.timeFrames <= 0) fx.timeScale = 1.0;
    }
    const ts = Math.max(0.15, fx.timeScale);

    // 全屏闪光层 (最先绘制，背景之上粒子之下)
    for (let i = fx.flashes.length - 1; i >= 0; i--) {
        const fl = fx.flashes[i];
        fl.alpha -= fl.decay * ts;
        if (fl.alpha <= 0) { fx.flashes.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, fl.alpha));
        ctx.fillStyle = fl.color;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    // 大飘字
    for (let i = fx.criticalTexts.length - 1; i >= 0; i--) {
        const ct = fx.criticalTexts[i];
        ct.y += ct.vy * ts;
        ct.life -= 0.016 * ts;
        if (ct.life <= 0) { fx.criticalTexts.splice(i, 1); continue; }
        const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.05;
        ctx.save();
        ctx.globalAlpha = Math.min(1, ct.life * 1.5);
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(ct.size * pulse)}px "Microsoft YaHei", sans-serif`;
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(ct.text, ct.x, ct.y);
        ctx.fillStyle = ct.color;
        ctx.fillText(ct.text, ct.x, ct.y);
        ctx.restore();
    }

    // 连击聚能光晕
    if (fx.comboCount >= 2) {
        const ax = (bgMetrics && bgMetrics.daisX) ? bgMetrics.daisX : w * 0.5;
        const ay = (bgMetrics && bgMetrics.daisY) ? (bgMetrics.daisY - 30) : h * 0.59 - 30;
        const t = performance.now() * 0.001;
        const radius = 50 + Math.min(80, fx.comboCount * 2.5) + Math.sin(t * 5) * 6;
        const alpha = Math.min(0.55, 0.15 + fx.comboCount * 0.015);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.comboColor;
        ctx.lineWidth = 3 + Math.min(5, fx.comboCount * 0.1);
        ctx.shadowBlur = 25;
        ctx.shadowColor = fx.comboColor;
        ctx.beginPath();
        ctx.arc(ax, ay, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = Math.min(0.85, alpha + 0.3);
        ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = fx.comboColor;
        ctx.fillText(`⚡ ${fx.comboCount}`, ax, ay - radius - 14);
        ctx.restore();
    }

    // 浮空飘字
    for (let i = fx.floatingTexts.length - 1; i >= 0; i--) {
        const ft = fx.floatingTexts[i];
        ft.y += ft.vy * ts;
        ft.alpha -= 0.02 * ts;
        if (ft.alpha <= 0) { fx.floatingTexts.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.fillStyle = ft.color;
        ctx.font = `bold ${Math.round(14 * ft.scale)}px sans-serif`;
        ctx.fillText(ft.text, ft.x - 40, ft.y);
        ctx.restore();
    }

    // 冲击波
    for (let i = fx.shockwaves.length - 1; i >= 0; i--) {
        const sw = fx.shockwaves[i];
        sw.radius += 4.5 * ts;
        sw.alpha -= 0.04 * ts;
        if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) { fx.shockwaves.splice(i, 1); continue; }
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = Math.max(0, sw.alpha);
        ctx.lineWidth = sw.width;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    // 蒸汽
    for (let i = fx.steamPuffs.length - 1; i >= 0; i--) {
        const sp = fx.steamPuffs[i];
        sp.x += sp.vx * ts; sp.y += sp.vy * ts;
        sp.size += 0.4 * ts; sp.alpha -= 0.02 * ts;
        if (sp.alpha <= 0) { fx.steamPuffs.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(220, 235, 255, ${sp.alpha})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // 熔炉火星
    for (let i = fx.furnaceEmbers.length - 1; i >= 0; i--) {
        const em = fx.furnaceEmbers[i];
        em.x += em.vx * ts; em.y += em.vy * ts;
        em.life -= 0.02 * ts;
        if (em.life <= 0) { fx.furnaceEmbers.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255, ${150 + Math.random() * 80}, 30, ${em.life})`;
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // 击锤火花
    for (let i = fx.sparks.length - 1; i >= 0; i--) {
        const pt = fx.sparks[i];
        pt.x += pt.vx * ts; pt.y += pt.vy * ts;
        pt.vy += 0.24 * ts;
        pt.life -= (pt.crit ? 0.025 : 0.04) * ts;
        if (pt.life <= 0) { fx.sparks.splice(i, 1); continue; }
        const a = Math.max(0, pt.life);
        ctx.fillStyle = pt.crit ? `rgba(255, 77, 122, ${a})` : `rgba(255, 185, 40, ${a})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * a, 0, Math.PI * 2);
        ctx.fill();
    }

    // 灵气微尘
    for (let i = 0; i < fx.ambientMotes.length; i++) {
        const m = fx.ambientMotes[i];
        m.x += m.vx * ts; m.y += m.vy * ts;
        if (m.y < 0) { m.y = h; m.x = Math.random() * w; }
        ctx.fillStyle = m.color;
        ctx.globalAlpha = m.alpha;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}