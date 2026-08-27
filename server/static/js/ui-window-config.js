/**
 * UI 弹窗与模态框几何尺寸配置 (量化游戏内每一个弹出窗口的大小)
 * 与 Rust `cyber_forge_shared::UIWindowConfig` 完全一一对应
 * 文件路径: server/static/js/ui-window-config.js
 */

export const UI_WINDOW_CONFIG = {
  // 1. 九州导航网络地图 (map)
  map: { width: 880, height: 640 },

  // 2. 矩阵锦囊背包 (stash)
  stash: { width: 560, height: 420 },

  // 3. 藏宝阁拍卖大厅 (auction)
  auction: { width: 580, height: 440 },

  // 4. 天道任务 (quest)
  quest: { width: 560, height: 420 },

  // 5. 铁匠铺学徒工坊 (apprentice)
  apprentice: { width: 560, height: 420 },

  // 6. 宗门天道日志 (logs)
  logs: { width: 560, height: 420 },

  // 7. 身体素质/炼体 (body)
  body: { width: 580, height: 560 },

  // 8. 天道出生证明 (inspect)
  inspect: { width: 480, height: 320 },

  // 9. 调试控制台 (debug)
  debug: { width: 480, height: 440 },

  // 10. 系统设置 (settings)
  settings: { width: 560, height: 440 },

  // 11. 跑商与特产行 (trade)
  trade: { width: 600, height: 560 },

  // 12. 万宝金库/银行 (bank)
  bank: { width: 640, height: 440 },

  // 13. 地牢探索 (dungeon)
  dungeon: { width: 640, height: 480 },

  // 14. 丢弃销毁确认 (drop_confirm)
  drop_confirm: { width: 360, height: 220 },
  drop: { width: 360, height: 220 },

  // 15. 右键上下文菜单 (context_menu)
  context_menu: { width: 184, rowHeight: 28, pad: 6 },

  // 默认回退尺寸
  default: { width: 560, height: 420 }
};

/**
 * 获取指定弹窗的量化宽高参数
 * @param {string} modalId 弹窗唯一标识
 * @returns {{ width: number, height: number }}
 */
export function getModalDimensions(modalId) {
  const cfg = UI_WINDOW_CONFIG[modalId] || UI_WINDOW_CONFIG.default;
  return {
    width: cfg.width || 560,
    height: cfg.height || 420
  };
}

/**
 * 动态修改指定弹窗的尺寸参数 (Library 开放接口)
 * @param {string} modalId 弹窗唯一标识
 * @param {number} width 窗口宽度 (px)
 * @param {number} height 窗口高度 (px)
 */
export function setModalDimensions(modalId, width, height) {
  if (!UI_WINDOW_CONFIG[modalId]) {
    UI_WINDOW_CONFIG[modalId] = { width, height };
  } else {
    if (typeof width === 'number') UI_WINDOW_CONFIG[modalId].width = width;
    if (typeof height === 'number') UI_WINDOW_CONFIG[modalId].height = height;
  }
}
