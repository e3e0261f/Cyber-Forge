/*
 * 模块功能: 全局输入监听、MMO快捷键、拦截Ctrl+滚轮缩放、多窗口拖拽与按钮精准点击
 * 修改时间: 2026-08-16 19:35
 */

import { invoke } from './core.js';
import { clock, syncState, uiState, gameState } from './state.js';
import { triggerStrikeImpact, fx } from './world.js';
import { hudState, scrollLogs, setLogsScroll, logsScrollY, logsMaxScroll, scrollBody, openItemContextMenu, closeContextMenu, hitTestContextMenu } from './hud.js';
import { gameConfig } from './config.js';
import { stashDrag, cycleSortMode, scrollStash, setStashScroll, stashScrollY, stashMaxScroll, hitTestStashSlot, padBackpackSlots, isStashSortOff } from './stash-view.js';
import { scrollAuction, setAuctionScroll, auctionScrollY, auctionMaxScroll } from './auction-view.js';
import { handleQuestClick, scrollQuest } from './quest-view.js';

let autoStrikeOn = false;
let actionBusy = false;
let strikeBusy = false;
let mainLoopTimer = null;

const scrollbarDrag = {
  active: false,
  modalId: null,
  pointerId: null,
  grabOffsetY: 0,
};

function getScrollbarState(id) {
  if (id === 'stash') return { scrollY: stashScrollY, maxScroll: stashMaxScroll, setScroll: setStashScroll };
  if (id === 'auction') return { scrollY: auctionScrollY, maxScroll: auctionMaxScroll, setScroll: setAuctionScroll };
  if (id === 'logs') return { scrollY: logsScrollY, maxScroll: logsMaxScroll, setScroll: setLogsScroll };
  return null;
}

function getScrollbarMetrics(id, bounds) {
  const state = getScrollbarState(id);
  if (!state || state.maxScroll <= 0) return null;
  const trackY = bounds.my + 54;
  const trackH = bounds.mh - 85;
  const contentH = trackH + state.maxScroll;
  const thumbH = Math.max(24, (trackH / contentH) * trackH);
  const travel = trackH - thumbH;
  const thumbY = trackY + (state.scrollY / state.maxScroll) * travel;
  return {
    ...state,
    hitX: bounds.mx + bounds.mw - 18,
    hitW: 16,
    trackY,
    trackH,
    thumbY,
    thumbH,
    travel,
  };
}

function hitScrollbar(x, y, id, bounds) {
  const bar = getScrollbarMetrics(id, bounds);
  if (!bar) return null;
  return x >= bar.hitX && x <= bar.hitX + bar.hitW && y >= bar.trackY && y <= bar.trackY + bar.trackH
    ? bar
    : null;
}

function updateScrollbarDrag(clientY) {
  if (!scrollbarDrag.active) return;
  const bounds = getModalBounds(scrollbarDrag.modalId, window.innerWidth, window.innerHeight);
  const bar = getScrollbarMetrics(scrollbarDrag.modalId, bounds);
  if (!bar || bar.travel <= 0) return;
  const thumbTop = Math.max(bar.trackY, Math.min(bar.trackY + bar.travel, clientY - scrollbarDrag.grabOffsetY));
  bar.setScroll(((thumbTop - bar.trackY) / bar.travel) * bar.maxScroll);
}

function resetScrollbarDrag() {
  scrollbarDrag.active = false;
  scrollbarDrag.modalId = null;
  scrollbarDrag.pointerId = null;
  scrollbarDrag.grabOffsetY = 0;
}

const KEY_MAP = {
  Space: 'strike',
  KeyU: 'u', KeyW: 'w', KeyN: 'n', KeyR: 'r', KeyD: 'd', KeyE: 'e',
  KeyT: 't', KeyG: 'g', KeyF: 'f', KeyS: 's', KeyX: 'b',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  Btn_i: 'i', Btn_I: 'I', Btn_o: 'o', Btn_O: 'O',
  Btn_u: 'u', Btn_w: 'w', Btn_n: 'n', Btn_r: 'r', Btn_d: 'd', Btn_e: 'e',
};

// 📍 本地客户端预测坐标
export const playerPos = {
  x: 400,
  y: 300,
  vx: 0,
  vy: 0,
  speed: 300 // 像素/秒
};
let lastSyncTime = 0;
let lastTickTime = performance.now();

const heldKeys = new Map();

export async function doStrike() {
  if (strikeBusy || document.hidden) return;
  strikeBusy = true;
  const crit = clock.isCrit;
  try {
    clock.resetCycle();
    triggerStrikeImpact(crit, window.innerWidth, window.innerHeight);

    const snap = await invoke('strike');
    if (snap) syncState(snap);
  } finally {
    strikeBusy = false;
  }
}

function getStepMultiplier(hits) {
  for (const tier of gameConfig.stepTiers) {
    if (hits >= tier.hitsThreshold) return tier.stepSize;
  }
  return 1;
}

async function fireKey(code, shiftKey, ctrlKey, hitCount = 1) {
  if (actionBusy && code !== 'Space') return;
  let k = KEY_MAP[code];
  if (!k) return;

  if (k === 'strike') {
    doStrike();
    return;
  }

  if (!gameConfig.excludeHoldKeys.includes(code)) {
    const step = getStepMultiplier(hitCount);
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
      if (ctrlKey) k = k + '_100';
      else if (shiftKey) k = k + '_10';
      else if (step > 1) k = `${k}_${step}`;
    } else if (step > 1) {
      k = `${k}_${step}`;
    }
  }

  actionBusy = true;
  try {
    const t = await invoke('action', { key: k });
    if (t) syncState(t);
  } finally {
    actionBusy = false;
  }
}

function startMainLoop() {
  if (mainLoopTimer) return;
  lastTickTime = performance.now();
  mainLoopTimer = setInterval(async () => {
    // 📍 Albion 模式本地平滑预测移动逻辑
    const now = performance.now();
    const dt = (now - lastTickTime) / 1000;
    lastTickTime = now;

    let moveX = 0;
    let moveY = 0;
    
    if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) moveY -= 1;
    if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) moveY += 1;
    if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) moveX -= 1;
    if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) moveX += 1;

    // 向量归一化，防止对角线移动过快
    if (moveX !== 0 || moveY !== 0) {
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      playerPos.vx = (moveX / len) * playerPos.speed;
      playerPos.vy = (moveY / len) * playerPos.speed;
    } else {
      playerPos.vx = 0;
      playerPos.vy = 0;
    }

    playerPos.x += playerPos.vx * dt;
    playerPos.y += playerPos.vy * dt;

    // 限定范围，不要跑出测试地图边界
    playerPos.x = Math.max(0, Math.min(playerPos.x, 2000));
    playerPos.y = Math.max(0, Math.min(playerPos.y, 1500));

    // 每 200ms 心跳同步一次坐标到后端进行校验
    if ((moveX !== 0 || moveY !== 0) && now - lastSyncTime > 200) {
        lastSyncTime = now;
        invoke('action', { key: 'sync_pos', x: playerPos.x, y: playerPos.y })
            .then(snap => { 
                if (snap) {
                    syncState(snap);
                    // 校验被拉回逻辑：如果后端返回的坐标和本地差距过大（比如超过50像素），说明被拉回了
                    const dx = snap.player_x - playerPos.x;
                    const dy = snap.player_y - playerPos.y;
                    if (Math.sqrt(dx*dx + dy*dy) > 50) {
                        playerPos.x = snap.player_x;
                        playerPos.y = snap.player_y;
                    }
                }
            });
    }

    if (!heldKeys.size) {
      clearInterval(mainLoopTimer);
      mainLoopTimer = null;
      return;
    }

    // 剔除 WASD，不把它们当做连续触发的普通快捷键处理（不发火）
    for (const [code, info] of heldKeys.entries()) {
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) continue;
      
      const interval = (code === 'Space') ? gameConfig.spaceIntervalMs : gameConfig.otherKeysIntervalMs;
      if (performance.now() - info.lastFiredTime >= interval) {
        info.lastFiredTime = performance.now();
        info.hitCount++;
        await fireKey(code, info.shiftKey, info.ctrlKey, info.hitCount);
      }
    }
  }, 10);
}

// 计算指定弹窗的实际屏幕位置与尺寸
export function getModalBounds(id, w, h) {
  let mw = 520, mh = 390;
  if (id === 'inspect') { mw = 480; mh = 320; }
  if (id === 'body') { mw = 580; mh = 560; }
  if (id === 'auction') { mw = 560; mh = 420; }
  mw = Math.min(mw, w * 0.9);
  mh = Math.min(mh, h * 0.85);

  const pos = uiState.modalPositions[id] || { x: null, y: null };
  const mx = pos.x !== null ? pos.x : (w * 0.5 - mw / 2);
  const my = pos.y !== null ? pos.y : (h * 0.5 - mh / 2);
  return { mx, my, mw, mh };
}

export function setupInteractions() {
  // 🌟 0. 拦截浏览器默认右键菜单，改用游戏内菜单
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    const w = window.innerWidth, h = window.innerHeight;
    const x = e.clientX, y = e.clientY;

    if (uiState.isOpen('stash')) {
      const bounds = getModalBounds('stash', w, h);
      if (bounds) {
        const idx = hitTestStashSlot(x, y, bounds);
        const item = idx >= 0 ? (gameState.backpack || [])[idx] : null;
        if (item) {
          openItemContextMenu(x, y, item);
          return;
        }
      }
    }

    closeContextMenu();
  });

  // 🌟 1. 滚轮：拦截 Ctrl 缩放；背包/拍卖行/日志内滚动列表
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      return;
    }

    const w = window.innerWidth, h = window.innerHeight;
    const mx = e.clientX, my = e.clientY;

    // 优先响应最上层打开的可滚动窗口
    for (const id of [...uiState.activeModals].reverse()) {
      if (id !== 'stash' && id !== 'auction' && id !== 'logs' && id !== 'body' && id !== 'quest') continue;
      const bounds = getModalBounds(id, w, h);
      if (!bounds) continue;
      const { mx: bx, my: by, mw, mh } = bounds;
      if (mx < bx || mx > bx + mw || my < by || my > by + mh) continue;

      e.preventDefault();
      if (id === 'stash') scrollStash(e.deltaY);
      else if (id === 'auction') scrollAuction(e.deltaY);
      else if (id === 'logs') scrollLogs(e.deltaY);
      else if (id === 'quest') scrollQuest(e.deltaY);
      else scrollBody(e.deltaY);
      return;
    }
  }, { passive: false });

  // 🌟 2. 鼠标移动监听 (多窗口拖拽与悬停)
  window.addEventListener('pointermove', (e) => {
    const w = window.innerWidth, h = window.innerHeight;

    // 始终跟踪坐标，供背包/拍卖悬停 tooltip 使用
    uiState.mouseX = e.clientX;
    uiState.mouseY = e.clientY;
    stashDrag.mouseX = e.clientX;
    stashDrag.mouseY = e.clientY;

    // 滚动条滑块拖拽优先于窗口和物品拖拽
    if (scrollbarDrag.active) {
      updateScrollbarDrag(e.clientY);
      document.body.style.cursor = 'grabbing';
      return;
    }

    // 拖拽窗口移动
    if (uiState.draggingModal) {
      const id = uiState.draggingModal;
      uiState.modalPositions[id].x = e.clientX - uiState.dragOffset.x;
      uiState.modalPositions[id].y = e.clientY - uiState.dragOffset.y;
      document.body.style.cursor = 'move';
      return;
    }

    // 背包物品拖拽中
    if (stashDrag.active) {
      document.body.style.cursor = 'grabbing';
      return;
    }

    // 可交互滚动条悬停反馈；只检测鼠标所在的最上层窗口
    for (const id of [...uiState.activeModals].reverse()) {
      const bounds = getModalBounds(id, w, h);
      const inside = e.clientX >= bounds.mx && e.clientX <= bounds.mx + bounds.mw &&
        e.clientY >= bounds.my && e.clientY <= bounds.my + bounds.mh;
      if (!inside) continue;
      if ((id === 'stash' || id === 'auction' || id === 'logs') && hitScrollbar(e.clientX, e.clientY, id, bounds)) {
        document.body.style.cursor = 'grab';
        return;
      }
      break;
    }

    // 全息蓝图悬停
    const hx = w * 0.78, hy = h * 0.38, bw = 180, bh = 130;
    fx.isHoloHovered = (e.clientX >= hx - bw / 2 && e.clientX <= hx + bw / 2 &&
    e.clientY >= hy - bh / 2 && e.clientY <= hy + bh / 2);
    document.body.style.cursor = fx.isHoloHovered ? 'pointer' : 'default';
  });

  // 🌟 3. 鼠标按下统一判定 (修复拍阁点错与多窗口管理)
  window.addEventListener('pointerdown', (e) => {
    const w = window.innerWidth, h = window.innerHeight;
    const clickX = e.clientX, clickY = e.clientY;

    // 右键由 contextmenu 处理
    if (e.button === 2) return;

    // 优先处理自定义右键菜单点击
    if (hudState.contextMenu) {
      const hit = hitTestContextMenu(clickX, clickY);
      if (hit >= 0) {
        const entry = hudState.contextMenu.items[hit];
        const item = hudState.contextMenu.item;
        closeContextMenu();
        if (!entry || entry.disabled || entry.id === 'cancel') return;

        if (entry.id === 'inspect') {
          hudState.inspectItem = item;
          if (!uiState.isOpen('inspect')) uiState.toggleModal('inspect');
          return;
        }
        if (entry.id === 'list' && item?.id != null) {
          invoke('action', { key: `list_id_${item.id}` }).then(snap => { if (snap) syncState(snap); });
          return;
        }
        if (entry.id === 'melt' && item?.id != null) {
          invoke('action', { key: `melt_id_${item.id}` }).then(snap => { if (snap) syncState(snap); });
          return;
        }
        return;
      }
      // 点在菜单外：关闭菜单，继续后续点击逻辑
      closeContextMenu();
    }

    // A. 顶部导航按钮点击 (从统一配置文件读取，彻底解决点拍阁打开背包 Bug)
    const btnW = 76, btnH = 26, btnY = 21, btnGap = 8;
    const navs = gameConfig.navButtons;
    const navStartX = w - 32 - (btnW + btnGap) * navs.length;

    for (let i = 0; i < navs.length; i++) {
      const bx = navStartX + i * (btnW + btnGap);
      if (clickX >= bx && clickX <= bx + btnW && clickY >= btnY && clickY <= btnY + btnH) {
        uiState.toggleModal(navs[i].id);
        return;
      }
    }

    // B. 多窗口交互与拖拽检测 (倒序检测，优先响应最上层窗口)
    for (const id of [...uiState.activeModals].reverse()) {
      const bounds = getModalBounds(id, w, h);
      if (!bounds) continue;
      const { mx, my, mw, mh } = bounds;

      // 1) 点击右上角 [✕] 关闭单窗口
      if (clickX >= mx + mw - 32 && clickX <= mx + mw && clickY >= my && clickY <= my + 42) {
        uiState.closeModal(id);
        return;
      }

      if (id === 'quest' && handleQuestClick(clickX, clickY, bounds)) {
        return;
      }

      if (id === 'apprentice') {
        // Handle apprentice modal click if needed
      }

      // 2) 可滚动窗口：点击轨道定位，按住滑块拖拽
      if (id === 'stash' || id === 'auction' || id === 'logs') {
        const bar = hitScrollbar(clickX, clickY, id, bounds);
        if (bar) {
          e.preventDefault();
          const onThumb = clickY >= bar.thumbY && clickY <= bar.thumbY + bar.thumbH;
          scrollbarDrag.active = true;
          scrollbarDrag.modalId = id;
          scrollbarDrag.pointerId = e.pointerId;
          scrollbarDrag.grabOffsetY = onThumb ? clickY - bar.thumbY : bar.thumbH / 2;
          if (!onThumb) updateScrollbarDrag(clickY);
          e.currentTarget?.setPointerCapture?.(e.pointerId);
          document.body.style.cursor = 'grabbing';
          return;
        }
      }

      // 3) 背包弹窗内的专用交互
      if (id === 'stash') {
        // 点击协议按钮
        const protoX = mx + mw - 185, protoY = my + 14;
        if (clickX >= protoX && clickX <= protoX + 110 && clickY >= protoY && clickY <= protoY + 24) {
          invoke('action', { key: 'toggle_currency_protocol' }).then(snap => { if (snap) syncState(snap); });
          return;
        }

        // 点击排序循环按钮
        const sortBtnX = mx + mw - 275, sortBtnY = my + 14;
        if (clickX >= sortBtnX && clickX <= sortBtnX + 80 && clickY >= sortBtnY && clickY <= sortBtnY + 24) {
          cycleSortMode();
          return;
        }

        // 货币互换按钮点击
        const hubY = my + mh - 46;
        if (clickY >= hubY + 5 && clickY <= hubY + 23) {
          let k = null;
          if (clickX >= mx + 120 && clickX <= mx + 148) k = 'Btn_i';
          else if (clickX >= mx + 152 && clickX <= mx + 180) k = 'Btn_I';
          else if (clickX >= mx + 286 && clickX <= mx + 314) k = 'Btn_o';
          else if (clickX >= mx + 318 && clickX <= mx + 346) k = 'Btn_O';

          if (k) {
              heldKeys.set(k, { hitCount: 1, lastFiredTime: performance.now(), shiftKey: e.shiftKey, ctrlKey: e.ctrlKey });
              fireKey(k, e.shiftKey, e.ctrlKey, 1);
              startMainLoop();
              return;
          }
        }

        // 背包格子内按下 -> 开启物品拖拽
        const idx = hitTestStashSlot(clickX, clickY, bounds);
        const items = gameState.backpack || [];
        if (idx >= 0 && items[idx]) {
          stashDrag.active = true;
          stashDrag.fromIndex = idx;
          stashDrag.item = items[idx];
          stashDrag.mouseX = clickX;
          stashDrag.mouseY = clickY;
          return;
        }
      }

      // 4) 点击标题栏 -> 开启该窗口的拖拽移动
      if (clickX >= mx && clickX <= mx + mw && clickY >= my && clickY <= my + 44) {
        uiState.draggingModal = id;
        uiState.dragOffset.x = clickX - mx;
        uiState.dragOffset.y = clickY - my;
        return;
      }

      // 5) 处于窗口内部点击，阻止击锤穿透
      if (clickX >= mx && clickX <= mx + mw && clickY >= my && clickY <= my + mh) {
        return;
      }
    }

    // C. 底部功能栏点击 [T]/[G]/[X]/[K]
    const dockY = h - 38;
    if (clickY >= dockY) {
      if (clickX >= 16 && clickX <= 136 && clickY >= dockY + 6 && clickY <= dockY + 32) {
        fireKey('KeyT', false, false, 1);
        return;
      }
      if (clickX >= 146 && clickX <= 276 && clickY >= dockY + 6 && clickY <= dockY + 32) {
        fireKey('KeyG', false, false, 1);
        return;
      }
      if (clickX >= 286 && clickX <= 411 && clickY >= dockY + 6 && clickY <= dockY + 32) {
        fireKey('KeyX', false, false, 1);
        return;
      }
      if (clickX >= 421 && clickX <= 516 && clickY >= dockY + 6 && clickY <= dockY + 32) {
        autoStrikeOn = !autoStrikeOn;
        return;
      }
    }

    // D. 点击全息蓝图
    const hx = w * 0.78, hy = h * 0.38, bw = 180, bh = 130;
    if (clickX >= hx - bw / 2 && clickX <= hx + bw / 2 &&
      clickY >= hy - bh / 2 && clickY <= hy + bh / 2) {
      uiState.toggleModal('inspect');
      return;
    }

    // F. 点击左侧升级面板
    const panelX = 16;
    const panelY = 80;
    const upBtnW = 160;
    const upBtnH = 32;
    const gap = 8;
    if (clickX >= panelX && clickX <= panelX + upBtnW) {
        for (let i = 0; i < 6; i++) {
            const upY = panelY + i * (upBtnH + gap);
            if (clickY >= upY && clickY <= upY + upBtnH) {
                const keys = ['Btn_u', 'Btn_w', 'Btn_n', 'Btn_r', 'Btn_d', 'Btn_e'];
                const k = keys[i];
                heldKeys.set(k, { hitCount: 1, lastFiredTime: performance.now(), shiftKey: e.shiftKey, ctrlKey: e.ctrlKey });
                fireKey(k, e.shiftKey, e.ctrlKey, 1);
                startMainLoop();
                return;
            }
        }
    }

    // E. 点击工坊区域挥锤
    if (clickY > h * 0.25 && clickY < h * 0.85 && clickX > 250) { // 避开左侧面板
      doStrike();
    }
  });

  // 🌟 4. 鼠标抬起 -> 结束窗口拖拽或完成背包物品换位
  window.addEventListener('pointerup', (e) => {
    const mouseKeys = ['Btn_i', 'Btn_I', 'Btn_o', 'Btn_O', 'Btn_u', 'Btn_w', 'Btn_n', 'Btn_r', 'Btn_d', 'Btn_e'];
    let cleared = false;
    for (const k of mouseKeys) {
        if (heldKeys.has(k)) {
            heldKeys.delete(k);
            cleared = true;
        }
    }
    if (cleared && !heldKeys.size && mainLoopTimer) {
        clearInterval(mainLoopTimer);
        mainLoopTimer = null;
    }

    if (scrollbarDrag.active && (scrollbarDrag.pointerId === null || scrollbarDrag.pointerId === e.pointerId)) {
      updateScrollbarDrag(e.clientY);
      resetScrollbarDrag();
      document.body.style.cursor = 'default';
    }

    // 结束窗口拖拽
    if (uiState.draggingModal) {
      uiState.draggingModal = null;
    }

    // 完成背包物品拖拽换位（关闭排序时可拖入空格留下空洞）
    if (stashDrag.active && uiState.isOpen('stash')) {
      const w = window.innerWidth, h = window.innerHeight;
      const bounds = getModalBounds('stash', w, h);
      if (bounds) {
        if (isStashSortOff()) padBackpackSlots();
        const items = gameState.backpack || [];
        const toIndex = hitTestStashSlot(e.clientX, e.clientY, bounds);
        if (toIndex >= 0 && toIndex !== stashDrag.fromIndex) {
          const temp = items[toIndex] || null;
          items[toIndex] = stashDrag.item;
          items[stashDrag.fromIndex] = temp;
        }
      }
      stashDrag.active = false;
      stashDrag.item = null;
      stashDrag.fromIndex = -1;
    }
  });

  window.addEventListener('pointercancel', () => {
    resetScrollbarDrag();
    document.body.style.cursor = 'default';
    const mouseKeys = ['Btn_i', 'Btn_I', 'Btn_o', 'Btn_O', 'Btn_u', 'Btn_w', 'Btn_n', 'Btn_r', 'Btn_d', 'Btn_e'];
    let cleared = false;
    for (const k of mouseKeys) {
        if (heldKeys.has(k)) {
            heldKeys.delete(k);
            cleared = true;
        }
    }
    if (cleared && !heldKeys.size && mainLoopTimer) {
        clearInterval(mainLoopTimer);
        mainLoopTimer = null;
    }
  });

  // 🌟 5. 键盘快捷键 (C/B/P/I/M 独立开关窗口)
  window.addEventListener('keydown', async (e) => {
    if (e.code === 'F5' || e.code === 'F12' || (e.ctrlKey && e.code === 'KeyR') || (e.metaKey && e.code === 'KeyR')) {
      return;
    }
    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      invoke('action', { key: 'p' }).then(snap => { if (snap) syncState(snap); });
      return;
    }
    if (e.ctrlKey || e.metaKey) return;

    // MMO 单独切换弹窗
    if (e.code === 'KeyC') { e.preventDefault(); uiState.toggleModal('body'); return; }
    if (e.code === 'KeyB') { e.preventDefault(); uiState.toggleModal('stash'); return; }
    if (e.code === 'KeyP') { e.preventDefault(); uiState.toggleModal('auction'); return; }
    if (e.code === 'KeyM') { e.preventDefault(); uiState.toggleModal('apprentice'); return; }
    if (e.code === 'KeyJ') { e.preventDefault(); uiState.toggleModal('quest'); return; }
    if (e.code === 'KeyI') { e.preventDefault(); uiState.toggleModal('logs'); return; }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (hudState.contextMenu) { closeContextMenu(); return; }
      uiState.closeModal();
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      doStrike();
      return;
    }
    if (e.code === 'KeyK') {
      autoStrikeOn = !autoStrikeOn;
      return;
    }

    const isMovementKey = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code);

    if (!KEY_MAP[e.code] && !isMovementKey) return;
    if (e.repeat) return;

    e.preventDefault();
    if (!heldKeys.has(e.code)) {
      heldKeys.set(e.code, { hitCount: 1, lastFiredTime: performance.now(), shiftKey: e.shiftKey, ctrlKey: e.ctrlKey });
      
      if (!isMovementKey) {
        await fireKey(e.code, e.shiftKey, e.ctrlKey, 1);
      }
      
      startMainLoop();
    }
  });

  window.addEventListener('keyup', (e) => {
    heldKeys.delete(e.code);
    if (!heldKeys.size && mainLoopTimer) {
      clearInterval(mainLoopTimer);
      mainLoopTimer = null;
    }
  });

  window.addEventListener('blur', () => {
    heldKeys.clear();
    uiState.draggingModal = null;
    resetScrollbarDrag();
    if (mainLoopTimer) {
      clearInterval(mainLoopTimer);
      mainLoopTimer = null;
    }
  });
}

export function isAutoStrikeActive() {
  return autoStrikeOn;
}
