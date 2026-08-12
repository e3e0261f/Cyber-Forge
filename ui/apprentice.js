// src-tauri/src-ui/apprentice.js
export function renderApprentice(s) {
    const container = document.getElementById('apprentice');
    if (!container) return;

    const costRecruit = s.apprentice?.cost_recruit || 666;
    const costExpand = s.apprentice?.cost_expand || 9999;

    container.innerHTML = `
    <div class="apprentice-header">【铁匠铺】学徒分配</div>
    <div id="apprenticeGrid" class="apprentice-grid">
    <div class="apprentice-post">磨剑 <span class="num">${s.apprentice?.forge || 0}</span></div>
    <div class="apprentice-post">附魔 <span class="num">${s.apprentice?.enchant || 0}</span></div>
    <div class="apprentice-post">精修 <span class="num">${s.apprentice?.refine || 0}</span></div>
    <div class="apprentice-post">盲锻 <span class="num">${s.apprentice?.blind || 0}</span></div>
    <div class="apprentice-post">拍卖 <span class="num">${s.apprentice?.auction || 0}</span></div>
    </div>
    <div class="apprentice-costs">
    [A]招募 · 金币 ${costRecruit}<br>
    [R]扩房 · 金币 ${costExpand}
    </div>
    `;
}
