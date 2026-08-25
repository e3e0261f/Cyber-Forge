import { gameState, uiState } from './state.js';
import { drawHoloModalFrame } from './modal-frame.js';
import { getModalBounds } from './input.js';

export let bodyScrollY = 0;
export let bodyMaxScroll = 0;

export function scrollBody(deltaY) {
    bodyScrollY = Math.max(0, Math.min(bodyMaxScroll, bodyScrollY + deltaY * 0.8));
}

export function drawBodyModal(ctx, w, h, time) {
    if (!uiState.isOpen('body')) return;
    const bounds = getModalBounds('body', w, h);
    const { mx, my, mw, mh } = bounds;
    const s = gameState;
    const title = s.title ? ` · ${s.title}` : '';
    const pending = s.pending_breakthrough ? ' ⚡待渡劫' : '';

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#22c55e', `【身体素质】${s.realm_name || '炼体'} ${s.sub_level || 1}层${title}${pending}`, time);

    const n = (x) => (x === 0 || x ? String(x) : '0');
    const colW = (mw - 48) / 2, leftX = mx + 24, rightX = leftX + colW;
    const clipY = my + 52, clipH = mh - 78, contentH = 620;
    bodyMaxScroll = Math.max(0, contentH - clipH);
    bodyScrollY = Math.max(0, Math.min(bodyMaxScroll, bodyScrollY));

    ctx.save(); ctx.beginPath(); ctx.rect(mx + 8, clipY, mw - 16, clipH); ctx.clip();
    let y = clipY + 10 - bodyScrollY;

    const drawSec = (label, yy) => { ctx.fillStyle = '#4ade80'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(label, leftX, yy); };
    const drawLine = (leftLabel, leftVal, rightLabel, rightVal, yy) => {
        ctx.fillStyle = '#64748b'; ctx.font = '11px sans-serif'; ctx.fillText(leftLabel, leftX, yy);
        ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 12px monospace'; ctx.fillText(String(leftVal), leftX + 92, yy);
        if (rightLabel != null) {
            ctx.fillStyle = '#64748b'; ctx.font = '11px sans-serif'; ctx.fillText(rightLabel, rightX, yy);
            ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 12px monospace'; ctx.fillText(String(rightVal), rightX + 92, yy);
        }
    };

    drawSec('【道基】', y); y += 16;
    drawLine('本境底蕴', s.realm_exp || '0', '距下层', s.exp_to_next || '0', y); y += 18;
    drawLine('累计修为', s.cultivation || '0', '神兵机缘', s.god_rate || '0', y); y += 18;
    drawLine('铁渣凝炼', n(s.iron_slag), '体魄强度', n(s.physique), y); y += 14;

    ctx.strokeStyle = 'rgba(34, 197, 94, 0.22)'; ctx.beginPath(); ctx.moveTo(mx + 18, y); ctx.lineTo(mx + mw - 18, y); ctx.stroke(); y += 18;

    drawSec('【炼体 / 练气 / 练神】基础素质', y); y += 16;
    drawLine('气感', n(s.qi_sense), '精神力', n(s.spirit), y); y += 22;

    drawSec('【金丹期 / 元婴期】核心造化', y); y += 16;
    drawLine('金丹个数', n(s.core_count), '金丹大小', n(s.core_size), y); y += 18;
    drawLine('元婴大小', n(s.infant_size), '元婴强度', n(s.infant_power), y); y += 22;

    drawSec('【化神 / 合体 / 大乘】法则矩阵', y); y += 16;
    drawLine('气机强度', n(s.qi_machine), '矩阵', n(s.matrix), y); y += 18;
    drawLine('法则碎片', n(s.law_shards), '反重力', n(s.anti_gravity), y); y += 18;
    drawLine('雷劫强度', n(s.tribulation), '因果律', n(s.causality), y);

    ctx.restore();

    if (bodyMaxScroll > 0) {
        const thumbH = Math.max(24, (clipH / contentH) * clipH);
        const thumbY = clipY + (bodyScrollY / bodyMaxScroll) * (clipH - thumbH);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.55)';
        ctx.beginPath(); ctx.roundRect(mx + mw - 10, thumbY, 4, thumbH, 2); ctx.fill();
    }

    ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif';
    ctx.fillText('1~10层圆满 · [X]渡劫 · [C]关闭', mx + 16, my + mh - 12);
}