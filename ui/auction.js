// src-tauri/src-ui/auction.js
export function renderAuction(s) {
    const container = document.getElementById('auction');
    if (!container) return;

    const current = s.market?.current_pavilion || 0;
    const capacity = s.market?.pavilion_capacity || 344;
    const auctioners = s.market?.auctioners || 0;

    container.innerHTML = `
    <div class="auction-header">【藏宝阁拍卖】${current}/${capacity} · 拍卖师 ${auctioners}人</div>
    <div id="auctionList" class="auction-list"></div>
    <div class="auction-status">候场 ${s.market?.waiting || 0} · 云集道友 ${s.swarm?.agents?.length || 0}</div>
    `;
}
