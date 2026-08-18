import { gameState, uiState, syncState } from './state.js';
import { invoke } from './core.js';
import { drawHoloModalFrame } from './hud.js';
import { getModalBounds } from './input.js';

let selectedQuest = null;
let scrollY = 0;

export function scrollQuest(deltaY) {
    const offerHeight = (gameState.quests || []).length * 76;
    const activeHeight = (gameState.active_quests || []).length * 70;
    const maxScroll = Math.max(0, offerHeight + activeHeight - 270);
    scrollY = Math.max(0, Math.min(maxScroll, scrollY + deltaY * 0.8));
}

const send = (key) => invoke('action', { key }).then((snap) => { if (snap) syncState(snap); });

export function handleQuestClick(x, y, bounds) {
    const { mx, my, mw, mh } = bounds;
    if (x < mx || x > mx + mw || y < my || y > my + mh) return false;
    const offers = gameState.quests || [];
    const active = gameState.active_quests || [];
    let curY = my + 80 - scrollY;
    
    if (selectedQuest) {
        // 放行标题栏，允许拖拽和关闭
        if (y < my + 44) return false;
        
        const items = (gameState.backpack || []).filter((item) => item && !item.is_tool);
        for (let i = 0; i < items.length; i++) {
            const iy = my + 92 + i * 28;
            if (x >= mx + 20 && x <= mx + mw - 20 && y >= iy && y <= iy + 24) {
                send(`quest_submit_${selectedQuest}_${items[i].id}`); 
                selectedQuest = null; 
                return true;
            }
        }
        // 任何非物品区域（在窗口内部）的点击都会取消物品选择
        selectedQuest = null;
        return true;
    }

    // 进行中的任务在上方
    let activeY = curY;
    for (let i = 0; i < active.length; i++) {
        const ay = activeY + i * 70;
        // 放宽点击范围，点击卡片右半部分都算点击按钮
        const btnLeft = mx + 16 + (mw - 42) * 0.5;
        if (x >= btnLeft && x <= mx + mw - 26 && y >= ay && y <= ay + 58) {
            if (y > my + 50 && y < my + mh - 28) { // 必须在剪裁区域内可见
                if (active[i].completed) send(`quest_claim_${active[i].offer.id}`);
                else if (active[i].offer.kind === 'SubmitItem') selectedQuest = active[i].offer.id;
                else send(`quest_abandon_${active[i].offer.id}`);
            }
            return true;
        }
    }
    
    curY += active.length * 70 + 20;
    
    // 可接任务在下方
    let listY = curY;
    for (let i = 0; i < offers.length; i++) {
        const oy = listY + i * 76;
        const btnLeft = mx + 16 + (mw - 42) * 0.5;
        if (x >= btnLeft && x <= mx + mw - 26 && y >= oy && y <= oy + 64) { 
            if (y > my + 50 && y < my + mh - 28) {
                send(`quest_accept_${offers[i].id}`); 
            }
            return true; 
        }
    }
    
    if (x >= mx + mw - 18 && y >= my + 52 && y <= my + mh - 28) { scrollY = Math.max(0, scrollY + (y < my + mh / 2 ? -120 : 120)); return true; }
    
    // 内容区域拦截点击，防止穿透到底层设施
    if (y >= my + 44) return true;
    
    // 标题栏(y < my + 44)放行返回 false，这样 input.js 就能继续执行窗口拖拽逻辑
    return false;
}

export function drawQuestModal(ctx, w, h, time) {
    if (!uiState.isOpen('quest')) return;
    const bounds = getModalBounds('quest', w, h);
    const { mx, my, mw, mh } = bounds;
    drawHoloModalFrame(ctx, mx, my, mw, mh, '#f97316', '【天道任务 · 押镖/跑商/悬赏】', time);
    // 任务面板独立重置 Canvas 状态，避免被世界特效或前一个弹窗的透明度/字体污染。
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '12px sans-serif';
    const offers = gameState.quests || [], active = gameState.active_quests || [];
    ctx.save(); ctx.beginPath(); ctx.rect(mx + 10, my + 50, mw - 20, mh - 78); ctx.clip();
    let y = my + 68 - scrollY;
    
    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#fbbf24'; ctx.fillText(`进行中 (${active.length}/5)`, mx + 18, y); y += 12;
    for (const q of active) { const remain = Math.max(0, q.complete_at - Math.floor(Date.now() / 1000)); drawCard(ctx, mx + 16, y, mw - 42, 58, `${q.offer.title} · ${q.completed ? '已完成' : `剩余 ${remain}s`}`, q.offer.description, q.completed ? '领取' : (q.offer.kind === 'SubmitItem' ? '选择物品' : '放弃')); y += 70; }
    
    y += 8; ctx.fillStyle = '#fb923c'; ctx.fillText(`可接任务 (${offers.length})`, mx + 18, y); y += 12;
    for (const q of offers) { drawCard(ctx, mx + 16, y, mw - 42, 64, `${q.title} · 保证金 ${q.deposit}${q.currency === 'Jade' ? '仙玉' : '金币'}`, `${q.description} · ${q.duration_secs}s · 奖励金币${q.reward.coins} 仙玉${q.reward.jade}`, '接取'); y += 76; }
    
    ctx.restore();
    if (selectedQuest) {
        ctx.fillStyle = 'rgba(8,12,20,0.98)';
        ctx.fillRect(mx + 12, my + 48, mw - 24, mh - 72);
        ctx.fillStyle = '#fb923c';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('选择提交物品（点击后立即消耗）', mx + 24, my + 76);
        ctx.font = '12px sans-serif';
        (gameState.backpack || []).filter((item) => item && !item.is_tool).forEach((item, i) => {
            ctx.fillStyle = '#f1f5f9';
            ctx.fillText(`${item.quality} ${item.name} · ${item.price}`, mx + 24, my + 108 + i * 28);
        });
    }
    ctx.restore();
}

function drawCard(ctx, x, y, w, h, title, detail, action) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(22, 30, 48, 0.98)';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(title, x + 8, y + 18);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText(detail, x + 8, y + 36);
    ctx.fillStyle = '#fdba74';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`[${action}]`, x + w - 58, y + h - 10);
    ctx.restore();
}