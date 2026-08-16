/*
 * 模块功能: 锻造粒子物理、冲击波、3D地脉涟漪与浮空飘字 (修复 bgMetrics 引用)
 * 修改时间: 2026-08-16 20:15
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
    ambientMotes: [],
    isHoloHovered: false,

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
    // 浮空飘字
    for (let i = fx.floatingTexts.length - 1; i >= 0; i--) {
        const ft = fx.floatingTexts[i];
        ft.y += ft.vy;
        ft.alpha -= 0.02;
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
        sw.radius += 4.5;
        sw.alpha -= 0.04;
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
        sp.x += sp.vx; sp.y += sp.vy;
        sp.size += 0.4; sp.alpha -= 0.02;
        if (sp.alpha <= 0) { fx.steamPuffs.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(220, 235, 255, ${sp.alpha})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // 熔炉火星
    for (let i = fx.furnaceEmbers.length - 1; i >= 0; i--) {
        const em = fx.furnaceEmbers[i];
        em.x += em.vx; em.y += em.vy;
        em.life -= 0.02;
        if (em.life <= 0) { fx.furnaceEmbers.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255, ${150 + Math.random() * 80}, 30, ${em.life})`;
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // 击锤火花
    for (let i = fx.sparks.length - 1; i >= 0; i--) {
        const pt = fx.sparks[i];
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vy += 0.24;
        pt.life -= pt.crit ? 0.025 : 0.04;
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
        m.x += m.vx; m.y += m.vy;
        if (m.y < 0) { m.y = h; m.x = Math.random() * w; }
        ctx.fillStyle = m.color;
        ctx.globalAlpha = m.alpha;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}
