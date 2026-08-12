// src-tauri/src-ui/body.js
export function renderBody(s) {
    const container = document.getElementById('body');
    if (!container) return;

    container.innerHTML = `
    <div class="body-header">${s.realm_name || ''} ${s.sub_level || 1}层</div>
    <div id="bodyGrid" class="body-grid"></div>
    `;
}
