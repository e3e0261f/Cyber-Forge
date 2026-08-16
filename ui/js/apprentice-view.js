/*
 * 模块功能: 铁匠铺学徒工坊全息弹窗 (5大岗位调度与多窗口并存)
 * 修改时间: 2026-08-16 19:40
 */

import { gameState, uiState } from './state.js';
import { drawHoloModalFrame } from './hud.js';
import { getModalBounds } from './input.js';

export function drawApprenticeModal(ctx, w, h, time) {
    if (!uiState.isOpen('apprentice')) return;

    const bounds = getModalBounds('apprentice', w, h);
    const { mx, my, mw, mh } = bounds;

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#f59e0b', `【铁匠铺 · 学徒工坊】 ${gameState.apprentices || 0}/${gameState.max_apprentices || 10} 人`, time);

    const jobs = [
        { key: '1', name: '磨剑台', desc: '持续打磨提升武器锋锐与估价', count: gameState.sharpen_workers || 0, color: '#38bdf8' },
        { key: '2', name: '附魔台', desc: '为出炉武器随机注入五行属性', count: gameState.enchant_workers || 0, color: '#a855f7' },
        { key: '3', name: '熔铸台', desc: '消耗碎铁自动精修高质量神兵', count: gameState.repair_workers || 0, color: '#e0a050' },
        { key: '4', name: '盲锻坊', desc: '消耗金币持续批量盲锻农具工具', count: gameState.forge_workers || 0, color: '#22c55e' },
        { key: '5', name: '拍卖行', desc: '派遣茶童侍者加快藏宝阁竞价落槌', count: gameState.auction_workers || 0, color: '#ffd700' },
    ];

    const startY = my + 58;
    const cardH = 46;

    jobs.forEach((job, idx) => {
        const cy = startY + idx * (cardH + 8);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx + 16, cy, mw - 32, cardH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = job.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`[${job.key}] ${job.name}`, mx + 24, cy + 18);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.fillText(job.desc, mx + 24, cy + 34);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`${job.count} 人`, mx + mw - 75, cy + 28);
    });

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText('提示：按住键盘 [1]~[5] 快速调配学徒到指定岗位 | 按 [A] 招募 | 按 [R] 扩建厢房', mx + 16, my + mh - 12);
}
