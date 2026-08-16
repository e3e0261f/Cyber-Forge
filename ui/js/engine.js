/**
 * 赛博锻造大师 v2.5.1 - 全屏 Pixi 根引擎与场景树总控
 */
export const pixiApp = new window.PIXI.Application();

// 🌟 四大核心场景层级（Scene Graph Layers）
export const layers = {
    bg: null,      // 背景层 (星空深渊、网格、雷劫背景)
    world: null,   // 🌟 2D游戏世界层 (预留：打怪地图、玩家角色走位、怪物动画)
    ui: null,      // UI界面层 (三大面板、HUD、状态栏)
    overlay: null, // 悬浮顶层 (Tooltip全息卡片、弹窗、Toast)
};

// 面板矩形尺寸数据缓存
export const layout = {
    width: 0,
    height: 0,
    leftPanel: { x: 0, y: 0, w: 0, h: 0 },
    midPanel: { x: 0, y: 0, w: 0, h: 0 },
    rightPanel: { x: 0, y: 0, w: 0, h: 0 },
    bottomBar: { x: 0, y: 0, w: 0, h: 0 },
};

let panelGfx = null;
let isReady = false;

export async function initEngine(containerEl) {
    if (isReady) return;
    const PIXI = window.PIXI;

    // 1. 初始化全屏 Pixi 画布
    await pixiApp.init({
        resizeTo: window,
        background: 0x050508,
        antialias: true,
        preference: 'webgl'
    });

    const canvas = pixiApp.canvas || pixiApp.view;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    containerEl.appendChild(canvas);

    // 2. 初始化层级树
    layers.bg = new PIXI.Container();
    layers.world = new PIXI.Container();
    layers.ui = new PIXI.Container();
    layers.overlay = new PIXI.Container();

    pixiApp.stage.addChild(layers.bg);
    pixiApp.stage.addChild(layers.world);
    pixiApp.stage.addChild(layers.ui);
    pixiApp.stage.addChild(layers.overlay);

    // 面板线框画笔
    panelGfx = new PIXI.Graphics();
    layers.ui.addChild(panelGfx);

    // 3. 计算并绘制初始三栏布局
    computeLayout();
    drawBasePanels();

    // 4. 监听窗口缩放事件自适应
    window.addEventListener('resize', () => {
        computeLayout();
        drawBasePanels();
    });

    isReady = true;
    console.log("【Pixi.js 全屏根引擎】三大场景层级与响应式视口初始化完毕！");
}

// 🌟 动态计算 22% | 50% | 28% 赛博三栏几何尺寸
function computeLayout() {
    const pad = 8;
    const gap = 8;
    const bottomH = 30;

    const w = window.innerWidth;
    const h = window.innerHeight;

    layout.width = w;
    layout.height = h;

    const mainH = h - pad * 2 - bottomH - gap;
    const totalW = w - pad * 2 - gap * 2;

    const leftW = Math.floor(totalW * 0.22);
    const rightW = Math.floor(totalW * 0.28);
    const midW = totalW - leftW - rightW;

    layout.leftPanel = { x: pad, y: pad, w: leftW, h: mainH };
    layout.midPanel = { x: pad + leftW + gap, y: pad, w: midW, h: mainH };
    layout.rightPanel = { x: pad + leftW + gap + midW + gap, y: pad, w: rightW, h: mainH };
    layout.bottomBar = { x: pad, y: h - pad - bottomH, w: w - pad * 2, h: bottomH };
}

// 🌟 显卡纯几何绘制四大面板外框（深邃暗黑 + 优雅边框）
function drawBasePanels() {
    if (!panelGfx) return;
    panelGfx.clear();

    const panels = [layout.leftPanel, layout.midPanel, layout.rightPanel, layout.bottomBar];

    panels.forEach((p, idx) => {
        const isBottom = idx === 3;
        const isMid = idx === 1;
        const radius = isBottom ? 6 : 10;

        // 中栏面板使用更深邃通透的黑曜石渐变底色，衬托 2D 世界
        const bgColor = isMid ? 0x07090e : 0x0c0e14;
        const borderColor = isMid ? 0xe0a050 : 0x3d4654; // 中栏金边

        panelGfx.roundRect(p.x, p.y, p.w, p.h, radius)
        .fill({ color: bgColor, alpha: 0.95 })
        .stroke({ width: 1, color: borderColor, alpha: isMid ? 0.65 : 0.4 });
    });
}
