/**
 * 《天道锻造大师》 全息系统设置面板与配置存储模块 (Settings Modal & Storage)
 * =========================================================================
 * 包含：
 * 1. 🔊 音频设置：主音量、SFX 音效音量、BGM 音乐音量、一键静音
 * 2. 🖥️ 画面设置：屏幕震动开关 (防头晕)、粒子特效档位 (高/中/低/关)、FPS 帧率显示
 * 3. 🎮 游戏性设置：QTE 节奏辅助提示 (QTE Helper 开关，控制 76%~88% 黄金暴击区高亮)
 * 4. ⛓️ 区块链与存档：当前区块高度与哈希、手动强制对账、导出区块链日志 JSON
 * 5. 📜 账号与密证：查看账号 ID、复制天道密证助记词
 */

import { storageAdapter } from './adapters/storage-adapter.js';
import { audio } from './audio.js';
import { drawHoloModalFrame } from './modal-frame.js';
import { localHashChain } from './security/hash-chain.js';
import { auditReporter } from './security/audit-reporter.js';
import { auth } from './auth.js';
import { gameStore } from './store/game-store.js';

export const SETTINGS_KEY = 'cyber_forge_system_settings';

export const settingsState = {
  // 音频
  masterVolume: 0.7,
  sfxVolume: 0.8,
  bgmVolume: 0.5,
  isMuted: false,

  // 画面 & Juice
  screenShakeEnabled: true,
  particleQuality: 'high', // 'high' | 'medium' | 'low' | 'off'
  showFPS: true,
  showPlayerName: true,    // 玩家名字对自己显示
  showRealmTitle: true,    // 头顶境界称号显示 (如“练气期一层”)

  // 玩法
  qteHelperEnabled: true, // 阿尔比恩采矿 & 锻造 QTE 76%~88% 暴击区高亮

  // 激活分页
  activeTab: 'audio', // 'audio' | 'graphics' | 'gameplay' | 'blockchain' | 'account'

  // 拖拽状态
  draggingSlider: null, // 'master' | 'sfx' | 'bgm'

  // 🌟 助记词防窥屏状态
  mnemonicVisible: false,
  // 🌟 复制反馈计时器
  _copyFeedbackTimer: null,
  _copyFeedbackTarget: null, // 'account' | 'mnemonic' | null

  init() {
    try {
      const saved = storageAdapter.get(SETTINGS_KEY);
      console.log('[Settings] 从 localStorage 加载设置:', saved);
      if (saved && typeof saved === 'object') {
        if (typeof saved.masterVolume === 'number') this.masterVolume = saved.masterVolume;
        if (typeof saved.sfxVolume === 'number') this.sfxVolume = saved.sfxVolume;
        if (typeof saved.bgmVolume === 'number') this.bgmVolume = saved.bgmVolume;
        if (typeof saved.isMuted === 'boolean') this.isMuted = saved.isMuted;
        if (typeof saved.screenShakeEnabled === 'boolean') this.screenShakeEnabled = saved.screenShakeEnabled;
        if (saved.particleQuality) this.particleQuality = saved.particleQuality;
        if (typeof saved.showFPS === 'boolean') this.showFPS = saved.showFPS;
        if (typeof saved.showPlayerName === 'boolean') this.showPlayerName = saved.showPlayerName;
        if (typeof saved.showRealmTitle === 'boolean') this.showRealmTitle = saved.showRealmTitle;
        if (typeof saved.qteHelperEnabled === 'boolean') this.qteHelperEnabled = saved.qteHelperEnabled;
        console.log('[Settings] 设置已恢复 → masterVol:', this.masterVolume, 'sfxVol:', this.sfxVolume, 'bgmVol:', this.bgmVolume, 'muted:', this.isMuted);
      } else {
        console.log('[Settings] 未找到已保存的设置，使用默认值');
      }
    } catch (e) {
      console.warn('[Settings] 读取设置失败:', e);
    }
    this.applyAudioSettings();
  },

  save() {
    try {
      storageAdapter.set(SETTINGS_KEY, {
        masterVolume: this.masterVolume,
        sfxVolume: this.sfxVolume,
        bgmVolume: this.bgmVolume,
        isMuted: this.isMuted,
        screenShakeEnabled: this.screenShakeEnabled,
        particleQuality: this.particleQuality,
        showFPS: this.showFPS,
        showPlayerName: this.showPlayerName,
        showRealmTitle: this.showRealmTitle,
        qteHelperEnabled: this.qteHelperEnabled,
      });
    } catch (e) {
      console.warn('[Settings] 保存设置失败:', e);
    }
  },

  applyAudioSettings() {
    // 始终将设置写入 audio 引擎属性 (无论 AudioContext 是否已解锁)
    // 这样 audio.init() 首次解锁时会使用正确的音量值
    if (this.isMuted) {
      audio.setVolume(0);
    } else {
      audio.setVolume(this.masterVolume);
    }
    if (audio.setSFXVolume) audio.setSFXVolume(this.sfxVolume);
    if (audio.setBGMVolume) audio.setBGMVolume(this.bgmVolume);
  },

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    this.isMuted = false;
    this.applyAudioSettings();
    this.save();
  },

  setSFXVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    this.applyAudioSettings();
    this.save();
  },

  setBGMVolume(val) {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    this.applyAudioSettings();
    this.save();
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.applyAudioSettings();
    this.save();
  },

  toggleScreenShake() {
    this.screenShakeEnabled = !this.screenShakeEnabled;
    this.save();
    gameStore.setToast(this.screenShakeEnabled ? '🖥️ 屏幕震动已开启' : '🖥️ 屏幕震动已关闭 (防眩晕模式)');
  },

  toggleQTEHelper() {
    this.qteHelperEnabled = !this.qteHelperEnabled;
    this.save();
    gameStore.setToast(this.qteHelperEnabled ? '✨ QTE 节奏辅助提示已开启 (金色暴击区高亮)' : '🎯 QTE 节奏辅助已关闭 (硬核肌肉记忆模式)');
  },

  cycleParticleQuality() {
    const modes = ['high', 'medium', 'low', 'off'];
    const nextIdx = (modes.indexOf(this.particleQuality) + 1) % modes.length;
    this.particleQuality = modes[nextIdx];
    this.save();
    gameStore.setToast(`✨ 粒子特效档位已切换至：${this.particleQuality.toUpperCase()}`);
  },

  toggleShowFPS() {
    this.showFPS = !this.showFPS;
    this.save();
  },

  toggleShowPlayerName() {
    this.showPlayerName = !this.showPlayerName;
    this.save();
    gameStore.setToast(this.showPlayerName ? '🏷️ 玩家名字显示已开启' : '🏷️ 玩家名字显示已关闭');
  },

  toggleShowRealmTitle() {
    this.showRealmTitle = !this.showRealmTitle;
    this.save();
    gameStore.setToast(this.showRealmTitle ? '✨ 境界称号显示已开启' : '✨ 境界称号显示已关闭');
  },

  exportChainLogs() {
    const blocks = localHashChain.blocks || [];
    const jsonStr = JSON.stringify({
      account_id: auth.getAccountId ? auth.getAccountId() : 'player',
      export_time: new Date().toISOString(),
      current_height: localHashChain.currentHeight,
      current_hash: localHashChain.currentHash,
      blocks: blocks
    }, null, 2);

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyber_forge_hashchain_h${localHashChain.currentHeight}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    gameStore.setToast('📥 区块链日志 JSON 已成功导出');
  },

  sealMempoolNow() {
    if (!localHashChain.pendingActions || localHashChain.pendingActions.length === 0) {
      gameStore.setToast('ℹ️ 交易缓冲池 (Mempool) 当前为空，无需封包');
      return;
    }
    const count = localHashChain.pendingActions.length;
    const block = localHashChain.sealPendingBlock();
    if (block) {
      gameStore.setToast(`⛓️ 已将 ${count} 笔动作打包封铸为大容量区块 #${block.height}！`);
    }
  },

  forceSyncHashChain() {
    if (localHashChain.pendingActions && localHashChain.pendingActions.length > 0) {
      localHashChain.sealPendingBlock();
    }
    gameStore.setToast('⛓️ 正在与云端对账并推进区块高度...');
    auditReporter.syncPendingHashChain();
    auditReporter.uploadCloudSnapshot('manual_force_sync');
  }
};

// 初始化设置
settingsState.init();

/**
 * 绘制全息系统设置模态窗口
 */
export function drawSettingsModal(ctx, bounds, w, h, time) {
  if (!bounds) return;
  const { mx, my, mw, mh } = bounds;

  ctx.save();
  // 1. 全息底框
  drawHoloModalFrame(ctx, mx, my, mw, mh, '#38bdf8', '⚙️ 系统设置与天道中枢 (System Settings)', time, 'settings');

  // 2. 顶部选项卡 (Tabs)
  const tabs = [
    { id: 'audio', label: '🔊 声音音频' },
    { id: 'graphics', label: '🖥️ 画面显示' },
    { id: 'gameplay', label: '🎮 游戏操作' },
    { id: 'blockchain', label: '⛓️ 区块链' },
    { id: 'account', label: '📜 账号密证' },
  ];

  const tabY = my + 54;
  const tabH = 32;
  const tabW = (mw - 32) / tabs.length;

  tabs.forEach((tab, i) => {
    const tx = mx + 16 + i * tabW;
    const isActive = settingsState.activeTab === tab.id;

    ctx.fillStyle = isActive ? 'rgba(56, 189, 248, 0.22)' : 'rgba(15, 23, 42, 0.6)';
    ctx.strokeStyle = isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(tx, tabY, tabW - 6, tabH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.font = isActive ? 'bold 12px sans-serif' : '11px sans-serif';
    ctx.fillStyle = isActive ? '#38bdf8' : '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tab.label, tx + (tabW - 6) / 2, tabY + tabH / 2);
  });

  // 3. 内容区
  const contentY = tabY + tabH + 16;
  const contentX = mx + 24;
  const contentW = mw - 48;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (settingsState.activeTab === 'audio') {
    drawAudioTab(ctx, contentX, contentY, contentW, time, 'settings');
  } else if (settingsState.activeTab === 'graphics') {
    drawGraphicsTab(ctx, contentX, contentY, contentW, time, 'settings');
  } else if (settingsState.activeTab === 'gameplay') {
    drawGameplayTab(ctx, contentX, contentY, contentW, time, 'settings');
  } else if (settingsState.activeTab === 'blockchain') {
    drawBlockchainTab(ctx, contentX, contentY, contentW, time, 'settings');
  } else if (settingsState.activeTab === 'account') {
    drawAccountTab(ctx, contentX, contentY, contentW, time, 'settings');
  }

  ctx.restore();
}

/** 绘制音频选项页 */
function drawAudioTab(ctx, cx, cy, cw, time) {
  // 一键静音
  const muteY = cy + 10;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('一键静音 (Mute All)', cx, muteY + 16);

  const btnX = cx + cw - 120;
  const btnY = muteY;
  ctx.fillStyle = settingsState.isMuted ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.2)';
  ctx.strokeStyle = settingsState.isMuted ? '#ef4444' : '#22c55e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, 120, 26, 4);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = settingsState.isMuted ? '#ef4444' : '#22c55e';
  ctx.textAlign = 'center';
  ctx.fillText(settingsState.isMuted ? '🔇 已静音' : '🔊 声音正常', btnX + 60, btnY + 17);
  ctx.textAlign = 'left';

  // 主音量滑块
  drawVolumeSliderRow(ctx, cx, cy + 50, cw, '主音量 (Master Volume)', settingsState.masterVolume, 'master');

  // 音效音量滑块
  drawVolumeSliderRow(ctx, cx, cy + 115, cw, 'SFX 音效音量 (Hit / Forge / Crit)', settingsState.sfxVolume, 'sfx');

  // 背景音乐滑块
  drawVolumeSliderRow(ctx, cx, cy + 180, cw, 'BGM 音乐音量 (Atmosphere / Melodies)', settingsState.bgmVolume, 'bgm');
}

function drawVolumeSliderRow(ctx, cx, cy, cw, title, val, type) {
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(title, cx, cy + 14);

  const sliderX = cx;
  const sliderY = cy + 24;
  const sliderW = cw;
  const sliderH = 10;

  // 底轨
  ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(sliderX, sliderY, sliderW, sliderH, 5);
  ctx.fill();
  ctx.stroke();

  // 进度高亮
  const fillW = sliderW * Math.max(0, Math.min(1, val));
  if (fillW > 0) {
    const grad = ctx.createLinearGradient(sliderX, sliderY, sliderX + fillW, sliderY);
    grad.addColorStop(0, '#00ffc8');
    grad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(sliderX, sliderY, fillW, sliderH, 5);
    ctx.fill();
  }

  // 拖拽手柄 (Thumb)
  const thumbX = sliderX + fillW;
  const thumbY = sliderY + sliderH / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(thumbX, thumbY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 数值标注
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(val * 100)}%`, cx + cw, cy + 14);
  ctx.textAlign = 'left';
}

/** 绘制画面与 Juice 选项页 */
function drawGraphicsTab(ctx, cx, cy, cw, time) {
  // 1. 屏幕震动开关 (重点：防头晕)
  drawToggleRow(
    ctx, cx, cy + 10, cw,
    '屏幕震动 (Screen Shake)',
    '关闭后渡劫、暴击与重击不再晃动镜头，适合防晕动症玩家',
    settingsState.screenShakeEnabled ? '开启中' : '已关闭 (防眩晕)',
    settingsState.screenShakeEnabled,
    'shake'
  );

  // 2. 粒子特效档位
  drawToggleRow(
    ctx, cx, cy + 85, cw,
    '粒子特效质量 (Particle Effects)',
    '调节工坊火星、灵气微尘与野外自然天气的渲染密度',
    `档位: ${settingsState.particleQuality.toUpperCase()}`,
    settingsState.particleQuality !== 'off',
    'particle'
  );

  // 3. 显示 FPS
  drawToggleRow(
    ctx, cx, cy + 160, cw,
    '显示 FPS 帧率计数器 (Show FPS)',
    '在画面右下方状态栏实时显示当前游戏渲染帧率',
    settingsState.showFPS ? '显示' : '隐藏',
    settingsState.showFPS,
    'fps'
  );

  // 4. 玩家名字显示
  drawToggleRow(
    ctx, cx, cy + 235, cw,
    '玩家名字显示 (Player Name)',
    '控制自己头顶是否显示玩家名称标牌',
    settingsState.showPlayerName ? '显示' : '隐藏',
    settingsState.showPlayerName,
    'player_name'
  );

  // 5. 境界称号显示
  drawToggleRow(
    ctx, cx, cy + 310, cw,
    '境界称号显示 (Realm Title)',
    '控制自己头顶是否显示“练气期一层”等境界称号',
    settingsState.showRealmTitle ? '显示' : '隐藏',
    settingsState.showRealmTitle,
    'realm_title'
  );
}

/** 绘制游戏操作选项页 */
function drawGameplayTab(ctx, cx, cy, cw, time) {
  // 1. QTE Helper 开关
  drawToggleRow(
    ctx, cx, cy + 10, cw,
    'QTE 节奏辅助提示 (QTE Helper)',
    '在采矿读条和锻造锤击上高亮渲染 76%~88% 黄金暴击判定区',
    settingsState.qteHelperEnabled ? '开启 (高亮暴击区)' : '关闭 (纯肌肉记忆)',
    settingsState.qteHelperEnabled,
    'qte_helper'
  );

  // 2. 操作快捷键指引卡片
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx, cy + 90, cw, 140, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#00ffc8';
  ctx.fillText('⌨️ 常用仙门快捷键指南：', cx + 16, cy + 114);

  const keys = [
    ['[WASD] / 方向键', '大世界探索移动 (平滑无顿挫)'],
    ['[空格键 (Space)]', '靠近矿物开启/QTE暴击采矿 | 铁砧挥锤'],
    ['[B] 储物背包', '[P] 万宝商坊 / 拍卖行'],
    ['[L] 九州大地图', '[M] 区域雷达小地图'],
    ['[ESC] 系统设置', '[C] 道躯属性 | [J] 宗门悬赏']
  ];

  ctx.font = '11px monospace';
  keys.forEach((k, idx) => {
    const rx = cx + 16 + (idx % 2) * (cw / 2);
    const ry = cy + 138 + Math.floor(idx / 2) * 22;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(k[0], rx, ry);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`: ${k[1]}`, rx + ctx.measureText(k[0]).width, ry);
  });
}

/** 绘制区块链选项页 */
function drawBlockchainTab(ctx, cx, cy, cw, time) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#00ffc8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx, cy + 10, cw, 104, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#00ffc8';
  ctx.fillText('⛓️ 本地区块链哈希单向日志 (Append-Only Hash Chain)', cx + 16, cy + 34);

  const pendingActionsCount = localHashChain.pendingActions ? localHashChain.pendingActions.length : 0;
  const maxCap = localHashChain.maxBlockCapacity || 20;
  const pendingBlocksCount = localHashChain.getPendingBlocks().length;

  ctx.font = '11px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`• 当前最新区块高度: #${localHashChain.currentHeight}`, cx + 16, cy + 54);
  ctx.fillText(`• 最新区块 Hash: ${localHashChain.currentHash}`, cx + 16, cy + 70);
  ctx.fillText(`• 待封包缓冲池: ${pendingActionsCount}/${maxCap} 笔 (满 20 笔或 8s 静默自动封铸为 1 个大容量区块)`, cx + 16, cy + 86);
  ctx.fillText(`• 待对账区块数: ${pendingBlocksCount} blocks`, cx + 16, cy + 102);

  // 3 个操作按钮 (平分宽度)
  const gap = 10;
  const btnW = (cw - gap * 2) / 3;
  const btnY = cy + 128;

  // 按钮一：手动封包当前 Mempool
  const btn1X = cx;
  ctx.fillStyle = pendingActionsCount > 0 ? 'rgba(250, 204, 21, 0.18)' : 'rgba(255, 255, 255, 0.05)';
  ctx.strokeStyle = pendingActionsCount > 0 ? '#facc15' : '#475569';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(btn1X, btnY, btnW, 36, 5);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = pendingActionsCount > 0 ? '#facc15' : '#64748b';
  ctx.textAlign = 'center';
  ctx.fillText(`📦 封包缓冲 (${pendingActionsCount})`, btn1X + btnW / 2, btnY + 22);

  // 按钮二：强制云端对账
  const btn2X = cx + btnW + gap;
  ctx.fillStyle = 'rgba(0, 255, 200, 0.15)';
  ctx.strokeStyle = '#00ffc8';
  ctx.beginPath();
  ctx.roundRect(btn2X, btnY, btnW, 36, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#00ffc8';
  ctx.fillText('🔄 强制对账 (Sync)', btn2X + btnW / 2, btnY + 22);

  // 按钮三：导出区块日志 JSON
  const btn3X = cx + (btnW + gap) * 2;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  ctx.roundRect(btn3X, btnY, btnW, 36, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.fillText('📥 导出日志 (JSON)', btn3X + btnW / 2, btnY + 22);
  ctx.textAlign = 'left';

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('💡 所有矿物开采、打铁暴击、丢弃与传送操作自动累积打包，20笔交易合并铸造1个区块，杜绝高频碎片化。', cx, cy + 188);
}

/** 绘制账号选项页 */
function drawAccountTab(ctx, cx, cy, cw, time) {
  const accountId = auth.getAccountId ? auth.getAccountId() : 'account_cultivator_default';
  const mnemonic = auth.getMnemonic ? auth.getMnemonic() : '---';

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('📜 修士账号身份与天道密证', cx, cy + 20);

  // === 账号 ID 卡片 ===
  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx, cy + 32, cw, 56, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('🆔 游戏账号 (Account ID)', cx + 12, cy + 50);

  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#38bdf8';
  // 截断过长 ID 显示
  const displayId = accountId.length > 36 ? accountId.substring(0, 36) + '...' : accountId;
  ctx.fillText(displayId, cx + 12, cy + 70);

  // 🌟 复制账号按钮
  const copyAccBtnX = cx + cw - 72;
  const copyAccBtnY = cy + 46;
  const isCopyAccFeedback = settingsState._copyFeedbackTarget === 'account' && settingsState._copyFeedbackTimer;
  ctx.fillStyle = isCopyAccFeedback ? 'rgba(34, 197, 94, 0.3)' : 'rgba(56, 189, 248, 0.15)';
  ctx.strokeStyle = isCopyAccFeedback ? '#22c55e' : '#38bdf8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(copyAccBtnX, copyAccBtnY, 60, 24, 4);
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = isCopyAccFeedback ? '#22c55e' : '#38bdf8';
  ctx.textAlign = 'center';
  ctx.fillText(isCopyAccFeedback ? '✅ 已复制' : '📋 复制', copyAccBtnX + 30, copyAccBtnY + 16);
  ctx.textAlign = 'left';

  // === 助记词卡片 (防窥屏) ===
  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx, cy + 100, cw, 80, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#b8860b';
  ctx.fillText('🔐 天道密证助记词 (Mnemonic) — 防窥屏模式', cx + 12, cy + 118);

  // 助记词显示区 (默认隐藏)
  const mnemonicDisplay = settingsState.mnemonicVisible ? mnemonic : '•••••••• •••••••• •••••••• ••••••••';
  ctx.font = settingsState.mnemonicVisible ? '12px monospace' : 'bold 14px monospace';
  ctx.fillStyle = settingsState.mnemonicVisible ? '#f8fafc' : '#475569';
  ctx.fillText(mnemonicDisplay, cx + 12, cy + 142);

  // 🌟 眼睛图标 (切换可见性)
  const eyeX = cx + cw - 72;
  const eyeY = cy + 124;
  ctx.fillStyle = settingsState.mnemonicVisible ? 'rgba(255, 215, 0, 0.2)' : 'rgba(100, 116, 139, 0.15)';
  ctx.strokeStyle = settingsState.mnemonicVisible ? '#ffd700' : '#64748b';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(eyeX, eyeY, 60, 24, 4);
  ctx.fill();
  ctx.stroke();
  ctx.font = '12px sans-serif';
  ctx.fillStyle = settingsState.mnemonicVisible ? '#ffd700' : '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText(settingsState.mnemonicVisible ? '👁️ 可见' : '👁️‍🗨️ 隐藏', eyeX + 30, eyeY + 16);
  ctx.textAlign = 'left';

  // 🌟 复制助记词按钮
  const copyMnBtnX = cx + cw - 72;
  const copyMnBtnY = cy + 154;
  const isCopyMnFeedback = settingsState._copyFeedbackTarget === 'mnemonic' && settingsState._copyFeedbackTimer;
  ctx.fillStyle = isCopyMnFeedback ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 215, 0, 0.15)';
  ctx.strokeStyle = isCopyMnFeedback ? '#22c55e' : '#ffd700';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(copyMnBtnX, copyMnBtnY, 60, 24, 4);
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = isCopyMnFeedback ? '#22c55e' : '#ffd700';
  ctx.textAlign = 'center';
  ctx.fillText(isCopyMnFeedback ? '✅ 已复制' : '📋 复制', copyMnBtnX + 30, copyMnBtnY + 16);
  ctx.textAlign = 'left';

  // === 安全提示 ===
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('⚠️ 助记词是账号唯一凭证，请妥善保管，切勿泄露给他人。', cx + 12, cy + 198);
  ctx.fillText('💡 点击「📋 复制」可快速复制到剪贴板。', cx + 12, cy + 214);
}

function drawToggleRow(ctx, cx, cy, cw, title, desc, statusText, isActive, type) {
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(title, cx, cy + 16);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(desc, cx, cy + 34);

  const btnX = cx + cw - 140;
  const btnY = cy + 4;
  ctx.fillStyle = isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(100, 116, 139, 0.15)';
  ctx.strokeStyle = isActive ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, 140, 28, 5);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = isActive ? '#38bdf8' : '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText(statusText, btnX + 70, btnY + 18);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 52);
  ctx.lineTo(cx + cw, cy + 52);
  ctx.stroke();
}

/**
 * 处理系统设置模态窗口的点击事件
 */
export function handleSettingsClick(clickX, clickY, bounds, w, h) {
  if (!bounds) return false;
  const { mx, my, mw, mh } = bounds;

  // 1. 顶部 Tabs 点击
  const tabs = ['audio', 'graphics', 'gameplay', 'blockchain', 'account'];
  const tabY = my + 54;
  const tabH = 32;
  const tabW = (mw - 32) / tabs.length;

  for (let i = 0; i < tabs.length; i++) {
    const tx = mx + 16 + i * tabW;
    if (clickX >= tx && clickX <= tx + tabW - 6 && clickY >= tabY && clickY <= tabY + tabH) {
      settingsState.activeTab = tabs[i];
      audio.playUI();
      return true;
    }
  }

  const contentY = tabY + tabH + 16;
  const contentX = mx + 24;
  const contentW = mw - 48;

  if (settingsState.activeTab === 'audio') {
    // 静音按钮
    const btnX = contentX + contentW - 120;
    const btnY = contentY + 10;
    if (clickX >= btnX && clickX <= btnX + 120 && clickY >= btnY && clickY <= btnY + 26) {
      settingsState.toggleMute();
      audio.playUI();
      return true;
    }

    // 主音量滑块点击
    if (handleSliderClick(clickX, clickY, contentX, contentY + 50 + 24, contentW, 10, v => settingsState.setMasterVolume(v))) return true;
    // SFX 滑块点击
    if (handleSliderClick(clickX, clickY, contentX, contentY + 115 + 24, contentW, 10, v => settingsState.setSFXVolume(v))) return true;
    // BGM 滑块点击
    if (handleSliderClick(clickX, clickY, contentX, contentY + 180 + 24, contentW, 10, v => settingsState.setBGMVolume(v))) return true;

  } else if (settingsState.activeTab === 'graphics') {
    // 屏幕震动
    const btnX = contentX + contentW - 140;
    if (clickX >= btnX && clickX <= btnX + 140 && clickY >= contentY + 14 && clickY <= contentY + 42) {
      settingsState.toggleScreenShake();
      audio.playUI();
      return true;
    }
    // 粒子质量
    if (clickX >= btnX && clickX <= btnX + 140 && clickY >= contentY + 89 && clickY <= contentY + 117) {
      settingsState.cycleParticleQuality();
      audio.playUI();
      return true;
    }
    // 显示 FPS
    if (clickX >= btnX && clickX <= btnX + 140 && clickY >= contentY + 164 && clickY <= contentY + 192) {
      settingsState.toggleShowFPS();
      audio.playUI();
      return true;
    }
    // 玩家名字显示
    if (clickX >= btnX && clickX <= btnX + 140 && clickY >= contentY + 239 && clickY <= contentY + 267) {
      settingsState.toggleShowPlayerName();
      audio.playUI();
      return true;
    }
    // 境界称号显示
    if (clickX >= btnX && clickX <= btnX + 140 && clickY >= contentY + 314 && clickY <= contentY + 342) {
      settingsState.toggleShowRealmTitle();
      audio.playUI();
      return true;
    }

  } else if (settingsState.activeTab === 'gameplay') {
    // QTE Helper 开关
    const btnX = contentX + contentW - 140;
    if (clickX >= btnX && clickX <= btnX + 140 && clickY >= contentY + 14 && clickY <= contentY + 42) {
      settingsState.toggleQTEHelper();
      audio.playUI();
      return true;
    }

  } else if (settingsState.activeTab === 'blockchain') {
    const gap = 10;
    const btnW = (contentW - gap * 2) / 3;
    const btnY = contentY + 128;

    // 按钮一：封包 Mempool
    const btn1X = contentX;
    if (clickX >= btn1X && clickX <= btn1X + btnW && clickY >= btnY && clickY <= btnY + 36) {
      settingsState.sealMempoolNow();
      audio.playUI();
      return true;
    }

    // 按钮二：强制对账
    const btn2X = contentX + btnW + gap;
    if (clickX >= btn2X && clickX <= btn2X + btnW && clickY >= btnY && clickY <= btnY + 36) {
      settingsState.forceSyncHashChain();
      audio.playUI();
      return true;
    }

    // 按钮三：导出日志
    const btn3X = contentX + (btnW + gap) * 2;
    if (clickX >= btn3X && clickX <= btn3X + btnW && clickY >= btnY && clickY <= btnY + 36) {
      settingsState.exportChainLogs();
      audio.playUI();
      return true;
    }

  } else if (settingsState.activeTab === 'account') {
    // 🌟 眼睛图标 - 切换助记词可见性
    const eyeX = contentX + contentW - 72;
    const eyeY = contentY + 124;
    if (clickX >= eyeX && clickX <= eyeX + 60 && clickY >= eyeY && clickY <= eyeY + 24) {
      settingsState.mnemonicVisible = !settingsState.mnemonicVisible;
      audio.playUI();
      return true;
    }

    // 🌟 复制账号 ID
    const copyAccX = contentX + contentW - 72;
    const copyAccY = contentY + 46;
    if (clickX >= copyAccX && clickX <= copyAccX + 60 && clickY >= copyAccY && clickY <= copyAccY + 24) {
      const accId = auth.getAccountId ? auth.getAccountId() : '';
      _copyToClipboard(accId);
      _showCopyFeedback('account');
      audio.playUI();
      return true;
    }

    // 🌟 复制助记词
    const copyMnX = contentX + contentW - 72;
    const copyMnY = contentY + 154;
    if (clickX >= copyMnX && clickX <= copyMnX + 60 && clickY >= copyMnY && clickY <= copyMnY + 24) {
      const mn = auth.getMnemonic ? auth.getMnemonic() : '';
      _copyToClipboard(mn);
      _showCopyFeedback('mnemonic');
      audio.playUI();
      return true;
    }
  }

  return false;
}

function handleSliderClick(clickX, clickY, sx, sy, sw, sh, onChange) {
  // 扩大判定范围上下各 8px
  if (clickX >= sx - 5 && clickX <= sx + sw + 5 && clickY >= sy - 8 && clickY <= sy + sh + 8) {
    const ratio = Math.max(0, Math.min(1, (clickX - sx) / sw));
    onChange(ratio);
    return true;
  }
  return false;
}

export let settingsScrollY = 0;
export const settingsMaxScroll = 0;

export function scrollSettings(deltaY) {
  settingsScrollY = Math.max(0, Math.min(settingsMaxScroll, settingsScrollY + (deltaY > 0 ? 30 : -30)));
}

// 🌟 复制到剪贴板辅助函数
function _copyToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      _fallbackCopy(text);
    });
  } else {
    _fallbackCopy(text);
  }
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

// 🌟 复制反馈动画 (按钮变绿 1.5 秒)
function _showCopyFeedback(target) {
  settingsState._copyFeedbackTarget = target;
  settingsState._copyFeedbackTimer = true;
  
  if (settingsState._copyTimerId) {
    clearTimeout(settingsState._copyTimerId);
  }
  
  settingsState._copyTimerId = setTimeout(() => {
    settingsState._copyFeedbackTimer = null;
    settingsState._copyFeedbackTarget = null;
    settingsState._copyTimerId = null;
  }, 1500);
}
