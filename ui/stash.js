// src-tauri/src-ui/stash.js
export function renderStash(s) {
    const container = document.getElementById('stash');
    if (!container) return;

    container.innerHTML = '';
    const slots = Math.max(s.max_backpack || 20, s.backpack.length);

    for (let i = 0; i < slots; i++) {
        const it = s.backpack[i];
        const cell = document.createElement('div');
        cell.className = `cell ${it?.is_tool ? 'tool' : ''}`;
        cell.textContent = it ? (it.is_tool ? '锤' : (it.glyph || it.name.slice(0,1) || '·')) : '·';
        container.appendChild(cell);
    }
}
