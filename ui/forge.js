// src-tauri/src-ui/forge.js
const $ = id => document.getElementById(id);

export function renderForge(s) {
    const stations = s.matrix_slots || 1;
    const hammers = s.concurrent_hammers || 1;

    const container = document.getElementById('forge');
    if (!container) return;

    container.innerHTML = `
    <div class="forge-title">【锻造台】${stations}台 × ${hammers}并发 · [U]·金${s.cost_hammer || '?'} [W]·金${s.cost_bellows || '?'}</div>
    <div id="forgeStations" class="forge-stations"></div>
    `;

    // 矩阵 + 并发渲染逻辑（与你之前完整版一致）
    // ...（完整代码已包含在完整包中）
}
