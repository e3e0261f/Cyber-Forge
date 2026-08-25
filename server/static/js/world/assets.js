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
