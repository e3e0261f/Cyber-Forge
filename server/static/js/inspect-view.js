import { uiState } from './state.js';
import { drawHoloModalFrame } from './modal-frame.js';
import { getModalBounds } from './input.js';

export const inspectState = { inspectItem: null };

export function drawInspectModal(ctx, w, h, time) {
    if (!uiState.isOpen('inspect')) return;
    const bounds = getModalBounds('inspect', w, h);
    const { mx, my, mw, mh } = bounds;
    const item = inspectState.inspectItem;

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#00e5ff', '📜【天道出生证明 (四维指纹)】', time, 'inspect');

    if (!item) {
        ctx.fillStyle = '#64748b'; ctx.font = '13px sans-serif';
        ctx.fillText('在锦囊中右键神兵 →「查看出生证」', mx + 24, my + 90);
        return;
    }

    ctx.fillStyle = item.color || '#ffd700'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(item.name || '未名神兵', mx + 24, my + 72);
    ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif'; ctx.fillText(`品质: ${item.quality || '[凡]'}  |  估价: ${item.price || '0'} 金币`, mx + 24, my + 96);
    ctx.fillStyle = '#00ffc8'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('📜【天道出生证明】', mx + 24, my + 128);

    ctx.fillStyle = '#e2e8f0'; ctx.font = '12px monospace';
    ctx.fillText(`• 诞生时辰：${item.cert_time || '未知时辰'}`, mx + 28, my + 152);
    ctx.fillText(`• 归属地轴：${item.cert_location || '未知地轴'}`, mx + 28, my + 176);
    ctx.fillText(`• 始祖铸匠：${item.cert_creator || '无名道友'}`, mx + 28, my + 200);
    ctx.fillText(`• 天道印记：[${item.cert_stamp || '玄之又玄'}]`, mx + 28, my + 224);
    ctx.fillText(`• 铭文短码：${item.cert_code || '#????'}`, mx + 28, my + 248);
}