// 文件路径：ui/js/world/assets.js

/** 高清 2D 原画素材预加载管理器 */
export const textures = {
    bg: null,
    anvil: null,
    sword: null,
    piston: null,
    robot: null,
    crystals: null,
    player: null,
    isLoaded: false,
};

export function loadGameAssets() {
    const assetList = [
        //{ key: 'bg', src: 'assets/workshop_bg.webp', fallback: 'assets/workshop_bg.png' },
        { key: 'anvil', src: 'assets/anvil.png' },
        { key: 'sword', src: 'assets/sword_base.png' },
        { key: 'piston', src: 'assets/piston_arm.png' },
        { key: 'robot', src: 'assets/apprentice_robot.png' },
        { key: 'crystals', src: 'assets/crystals.png' },
        { key: 'player', src: 'assets/player_avatar.png' },
    ];

    let loadedCount = 0;

    assetList.forEach((item) => {
        const img = new Image();
        img.src = item.src;
        img.onload = () => {
            textures[item.key] = img;
            loadedCount++;
            if (loadedCount === assetList.length) {
                textures.isLoaded = true;
                console.log("【素材系统】所有 2D 高清原画贴图全部装配就绪！");
            }
        };
        img.onerror = () => {
            if (item.fallback) {
                const fallbackImg = new Image();
                fallbackImg.src = item.fallback;
                fallbackImg.onload = () => {
                    textures[item.key] = fallbackImg;
                    loadedCount++;
                    if (loadedCount === assetList.length) textures.isLoaded = true;
                };
            }
        };
    });
}

// 假设这是你在渲染玩家时的核心逻辑
function renderPlayerAvatar(ctx, player, camera) {
    // 1. 获取当前头像贴图（如果玩家画了自己的，它就是玩家画的；否则是默认的 player_avatar.png）
    const img = textures.player; 
    if (!img || !textures.isLoaded) return;

    ctx.save();
    
    // 计算屏幕上的坐标
    let drawX = player.x - camera.x;
    let drawY = player.y - camera.y;

    // --- 🌟 灵魂动态效果计算 ---
    let scaleX = 1.0;
    let scaleY = 1.0;
    let rotation = 0.0;
    let bounceOffsetY = 0.0;

    // 如果玩家在移动，或者处于某种“搞笑动作”状态
    if (player.isMoving || player.isGathering) {
        // 利用时间戳制造周期性的弹性波动
        const time = Date.now() * 0.012; // 调整数字可以改变抖动速度
        
        // Q弹压扁与拉伸 (Squash & Stretch)
        scaleY = 1.0 + Math.sin(time * 3) * 0.12; // 上下拉伸 12%
        scaleX = 1.0 - Math.sin(time * 3) * 0.12; // 左右压扁 12%
        
        // 左右歪头晃动 (约正负 10 度)
        rotation = Math.sin(time * 1.5) * 0.18;   
        
        // 上下跳动的高度
        bounceOffsetY = -Math.abs(Math.sin(time * 3)) * 6; 
    } else {
        // 即使站着不动，也有轻微的呼吸起伏感 (Idle 状态)
        const time = Date.now() * 0.005;
        scaleY = 1.0 + Math.sin(time) * 0.03;
        scaleX = 1.0;
    }

    // 应用变换到 Canvas 画布
    ctx.translate(drawX, drawY + bounceOffsetY);
    ctx.rotate(rotation);
    ctx.scale(scaleX, scaleY);

    // 居中绘制头像
    const width = img.width || 64;
    const height = img.height || 64;
    ctx.drawImage(img, -width / 2, -height / 2, width, height);

    ctx.restore();
}