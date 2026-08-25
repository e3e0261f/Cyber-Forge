/** 悬浮查看神兵/材料属性与鼠标提示圆形数量角标 Tooltip */
import { gameState } from './state.js';

/** 🌟 商票专属悬停详情: 查看商票需要的总额度 (信用额度/已用/交割目标进度) */
function drawTicketTooltip(ctx, info, w, h, item) {
    const t = gameState.merchant_ticket || {};
    const limit = Number(t.credit_limit || 30000);
    const used = Number(t.used_credit || 0);
    const earned = Number(t.earned_total || 0);
    const target = 100000;
    const itemColor = '#f59e0b';

    const tw = 290, th = 190;
    let tx = info.x, ty = info.y;
    if (tx + tw > w - 10) tx = w - tw - 15;
    if (ty + th > h - 45) ty = h - th - 50;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.96)';
    ctx.strokeStyle = itemColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = itemColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
    ctx.fillStyle = itemColor;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('📜 商票 (跨城贸易凭证)', tx + 12, ty + 23);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText('【跑商凭证】悬停查看商票需要的总额度', tx + 12, ty + 41);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(tx + 8, ty + 49);
    ctx.lineTo(tx + tw - 8, ty + 49);
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '10px monospace';
    ctx.fillText(`• 信用总额度: ${limit.toLocaleString()} 铜 (赊购上限)`, tx + 12, ty + 68);
    ctx.fillText(`• 已用额度: ${used.toLocaleString()} ｜ 可用: ${(limit - used).toLocaleString()} 铜`, tx + 12, ty + 88);
    ctx.fillText(`• 累计回款: ${earned.toLocaleString()} 铜`, tx + 12, ty + 108);
    ctx.fillText(`• 交割目标: 回款达 ${target.toLocaleString()} 铜可交割`, tx + 12, ty + 128);

    // 交割进度条
    const prog = Math.min(1, earned / target);
    const barX = tx + 12, barY = ty + 140, barW = tw - 24, barH = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 4); ctx.fill();
    ctx.fillStyle = prog >= 1 ? '#34d399' : '#f59e0b';
    if (prog > 0) { ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(6, barW * prog), barH, 4); ctx.fill(); }

    ctx.fillStyle = prog >= 1 ? '#34d399' : '#94a3b8';
    ctx.fillText(prog >= 1 ? '✅ 已达交割目标, 可到驿馆交割商票' : `• 交割进度 ${(prog * 100).toFixed(1)}% (把 3 万赚到 10 万)`, tx + 12, ty + 162);
    ctx.fillStyle = '#64748b';
    ctx.fillText('• 提示: 存入银行的货物无法在驿馆卖出', tx + 12, ty + 178);
    ctx.restore();
    return;
}

export function drawItemTooltip(ctx, info, w, h) {
    const item = info.item || info.lot;
    if (!item) return;

    // 🌟 商票物品专属悬停详情 (额度总额/交割进度)
    const iid = item.item_id || item.itemId || item.id || '';
    if (iid === 'merchant_ticket' || item.name === '商票') {
        drawTicketTooltip(ctx, info, w, h, item);
        return;
    }

    const count = Number(item.stackCount || item.stack_count || 1);
    const maxStack = Number(item.maxStack || item.max_stack || 99);
    const itemColor = item.color || item.colorHex || '#38bdf8';
    const isMaterial = item.itemType === 'Material' || !item.cert_creator;
    const isTradeGood = item.isTradeGood || item.itemType === 'TradeGood';
    const unitW = item.weight || (item.attributes && item.attributes.unit_weight) || 1.0;
    const totalW = (unitW * count).toFixed(1);

    const tw = 270, th = isMaterial ? 190 : 200;
    let tx = info.x, ty = info.y;
    if (tx + tw > w - 10) tx = w - tw - 15;
    if (ty + th > h - 45) ty = h - th - 50;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.96)';
    ctx.strokeStyle = itemColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = itemColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 🌟 1. 标题与图标
    ctx.textAlign = 'left';
    ctx.fillStyle = itemColor;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${item.glyph || '💎'} ${item.name || '天地奇珍'}`, tx + 12, ty + 23);

    // 估价与类型
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    const typeLabel = isMaterial ? '灵矿玄材' : isTradeGood ? '行商特产' : '天道神兵';
    ctx.fillText(`【${typeLabel}】估价: ${item.price || item.fair || '50'} 金币`, tx + 12, ty + 41);

    // 🌟 2. 鼠标提示圆形角标 (标记数量 Circular Count Badge)
    const badgeCenterX = tx + tw - 26;
    const badgeCenterY = ty + 24;
    const badgeRadius = 14;

    ctx.save();
    // 圆形外发光与底盘
    ctx.shadowColor = itemColor;
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(10, 18, 30, 0.95)';
    ctx.strokeStyle = itemColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(badgeCenterX, badgeCenterY, badgeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 圆形内环高光边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(badgeCenterX, badgeCenterY, badgeRadius - 2.5, 0, Math.PI * 2);
    ctx.stroke();

    // 圆形角标内居中数量文字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = count > 1 ? '#00ffc8' : '#ffffff';
    ctx.font = 'bold 10px monospace';
    const badgeStr = count > 999 ? '999+' : `x${count}`;
    ctx.fillText(badgeStr, badgeCenterX, badgeCenterY + 0.5);
    ctx.restore();

    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(tx + 8, ty + 49);
    ctx.lineTo(tx + tw - 8, ty + 49);
    ctx.stroke();

    // 🌟 3. 详细属性与天道信息
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (isMaterial) {
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('🌿【天道灵材资质】', tx + 12, ty + 68);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px monospace';
        ctx.fillText(`• 当前数量: ${count} 份 (最大堆叠: ${maxStack})`, tx + 12, ty + 88);
        ctx.fillText(`• 负重属性: 组总重 ${totalW} KG (单件 ${unitW}KG)`, tx + 12, ty + 108);
        ctx.fillText(`• 灵材品阶: 阶位 T${item.tier || 1} ｜ 品质点 ${item.qualityRank || item.quality_rank || 10}`, tx + 12, ty + 128);
        ctx.fillText(`• 地脉特性: 五行灵气汇聚，质地精纯`, tx + 12, ty + 148);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`• 功用: 可用于神兵淬火、宗门炼器与万国商市`, tx + 12, ty + 168);
    } else {
        ctx.fillStyle = '#00ffc8';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('📜【天道出生证明】', tx + 12, ty + 68);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px monospace';
        ctx.fillText(`• 数量堆叠: ${count} 件 ｜ 负重 ${totalW} KG`, tx + 12, ty + 88);
        ctx.fillText(`• 时辰: ${item.cert_time || '甲辰年·子时三刻'}`, tx + 12, ty + 108);
        ctx.fillText(`• 地轴: ${item.cert_location || '离火九五·阳极'}`, tx + 12, ty + 128);
        ctx.fillText(`• 始祖: ${item.cert_creator || '纯阳真仙'}`, tx + 12, ty + 148);
        ctx.fillText(`• 印记: [${item.cert_stamp || '玄之又玄·众妙'}]`, tx + 12, ty + 168);
        ctx.fillText(`• 短码: ${item.cert_code || '#Z7kQ-9mA3'}`, tx + 12, ty + 188);
    }

    ctx.restore();
}
