/**
 * 赛博锻造台 v2.5.1 - 全息高性能显卡级渲染引擎 (完整功能版)
 * 特点：本地 0 延迟 QTE 识别、即时击锤响应、动态风箱速度自适应、35路并发矩阵
 */
import { $, snap } from './core.js';

const anvil = $('anvil');
const titleQte = $('titleQte');

let canvas = null;
let ctx = null;

// 粒子池
let particles = [];
let animFrameId = null;

// 🌟 本地自主高精度物理时钟
let localCycleStartTime = performance.now();
let intervalSecs = 1.0; // 基础锤速（秒）

// 矩阵轨道平滑插值数组
let matrixVisualProgresses = new Float64Array(64);
let matrixTargetProgresses = new Float64Array(64);

let currentStations = 1;
let currentHammers = 1;

// 确保画布就绪
function ensureCanvas() {
  if (!anvil) return false;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '3';
    canvas.style.transform = 'translateZ(0)';

    anvil.innerHTML = '';
    anvil.appendChild(canvas);
    ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = anvil.clientWidth || 400;
  const h = anvil.clientHeight || 42;

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return true;
}

// 🌟 1. 本地实时 QTE 暴击状态识别（0 毫秒延迟，极度精准）
export function isCurrentlyInCrit() {
  const now = performance.now();
  const totalDuration = Math.max(0.05, intervalSecs);
  const elapsed = ((now - localCycleStartTime) / 1000) % totalDuration;
  const p = elapsed / totalDuration;
  return p >= 0.76 && p < 0.88;
}

// 🌟 2. 重置本地读条周期（挥锤击中瞬间调用，立即归零重蓄）
export function resetLocalCycle() {
  localCycleStartTime = performance.now();
}

// 🌟 3. 火花物理爆发
export function sparkAtHead(crit) {
  if (!anvil) return;
  const w = anvil.clientWidth || 400;
  const now = performance.now();
  const totalDuration = Math.max(0.05, intervalSecs);
  const elapsed = ((now - localCycleStartTime) / 1000) % totalDuration;
  const p = Math.min(1.0, elapsed / totalDuration);

  const barW = w * 0.96;
  const startX = w * 0.02;
  const x = startX + barW * Math.min(0.98, Math.max(0.02, p));
  const y = 14;

  const count = crit ? 20 : 8; // 暴击时爆发更多火花
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
    const spd = (crit ? 4.5 : 2.2) + Math.random() * 3.5;
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
                   vy: Math.sin(ang) * spd,
                   life: 1.0,
                   crit,
                   size: crit ? 2.8 + Math.random() * 1.5 : 1.5 + Math.random(),
    });
  }
}

// 🌟 144Hz 纯本地自主平滑物理渲染循环
function renderLoop() {
  if (!ctx || !anvil) {
    animFrameId = null;
    return;
  }

  const now = performance.now();
  const w = anvil.clientWidth || 400;

  // 本地高精度进度计算
  const totalDuration = Math.max(0.05, intervalSecs);
  const elapsedSecs = (now - localCycleStartTime) / 1000;
  const p = Math.min(1.0, Math.max(0.0, (elapsedSecs % totalDuration) / totalDuration));
  const inCrit = (p >= 0.76 && p < 0.88);

  // 矩阵小轨道本地平滑插值
  const totalTracks = currentStations * currentHammers;
  for (let i = 0; i < totalTracks; i++) {
    const target = matrixTargetProgresses[i];
    matrixVisualProgresses[i] += (target - matrixVisualProgresses[i]) * 0.15;
  }

  // 极速重绘
  ctx.clearRect(0, 0, anvil.clientWidth, anvil.clientHeight);

  // --- A. 绘制主能量条 ---
  const barX = w * 0.02;
  const barY = 8;
  const barW = w * 0.96;
  const barH = 10;

  // 轨道底槽
  ctx.fillStyle = 'rgba(10, 14, 20, 0.95)';
  ctx.strokeStyle = 'rgba(61, 70, 84, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 5);
  ctx.fill();
  ctx.stroke();

  // QTE 暴击感应区 (0.76 ~ 0.88)
  const critX = barX + barW * 0.76;
  const critW = barW * 0.12;
  ctx.fillStyle = inCrit ? 'rgba(255, 77, 122, 0.85)' : 'rgba(255, 77, 122, 0.25)';
  ctx.fillRect(critX, barY, critW, barH);
  if (inCrit) {
    ctx.strokeStyle = '#ff4d7a';
    ctx.strokeRect(critX, barY, critW, barH);
  }

  // 熔岩填充条 (金橙渐变)
  if (p > 0) {
    const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    grad.addColorStop(0, '#ff3300');
    grad.addColorStop(0.5, '#ff8c00');
    grad.addColorStop(1, '#ffd700');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(4, barW * p), barH, 4);
    ctx.fill();
  }

  // 头部聚光核
  if (p > 0 && p < 0.99) {
    const headX = barX + barW * p;
    ctx.fillStyle = 'rgba(255, 215, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(headX, barY + barH / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX, barY + barH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- B. 绘制多台并发矩阵 ---
  if (currentStations > 1 || currentHammers > 1) {
    const startMatrixY = 24;
    const cols = currentStations <= 3 ? currentStations : (currentStations === 5 ? 5 : Math.min(4, currentStations));
    const colGap = 6;
    const cardW = (barW - (cols - 1) * colGap) / cols;
    const laneH = 4;
    const laneGap = 2;
    const cardPadding = 4;
    const cardH = cardPadding * 2 + 10 + currentHammers * (laneH + laneGap);

    for (let si = 0; si < currentStations; si++) {
      const colIdx = si % cols;
      const rowIdx = Math.floor(si / cols);
      const cardX = barX + colIdx * (cardW + colGap);
      const cardY = startMatrixY + rowIdx * (cardH + 4);

      ctx.fillStyle = 'rgba(12, 16, 24, 0.85)';
      ctx.strokeStyle = 'rgba(160, 120, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#9ab0c8';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText(`台 ${si + 1}`, cardX + cardPadding, cardY + 9);

      for (let hi = 0; hi < currentHammers; hi++) {
        const trackIdx = si * currentHammers + hi;
        const trackProg = matrixVisualProgresses[trackIdx] || 0;

        const laneX = cardX + cardPadding;
        const laneY = cardY + 12 + hi * (laneH + laneGap);
        const laneW = cardW - cardPadding * 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.beginPath();
        ctx.roundRect(laneX, laneY, laneW, laneH, 2);
        ctx.fill();

        if (trackProg > 0) {
          ctx.fillStyle = '#b48cff';
          ctx.beginPath();
          ctx.roundRect(laneX, laneY, Math.max(2, laneW * trackProg), laneH, 2);
          ctx.fill();
        }
      }
    }
  }

  // 粒子物理运算
  if (particles.length > 0) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += 0.18;
      pt.life -= pt.crit ? 0.035 : 0.05;

      if (pt.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.crit
      ? `rgba(255, 77, 122, ${alpha})`
      : `rgba(255, 170, 50, ${alpha})`;

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  animFrameId = requestAnimationFrame(renderLoop);
}

// 🌟 响应后端数据快照（动态接收升级后的锤速、并发台数、QTE统计）
export function updateProgress(s) {
  if (!ensureCanvas()) return;

  // 实时捕获风箱升级（W）带来的最新锤速
  if (s.interval_secs && s.interval_secs > 0) {
    intervalSecs = s.interval_secs;
  }

  currentStations = Math.max(1, s.matrix_slots | 0);
  currentHammers = Math.max(1, s.concurrent_hammers | 0);
  const totalTracks = currentStations * currentHammers;

  if (s.matrix_progresses) {
    for (let i = 0; i < totalTracks; i++) {
      matrixTargetProgresses[i] = s.matrix_progresses[i] || 0;
    }
  }

  if (titleQte) {
    const hits = Number(s.forge_qte_hits || 0).toFixed(1);
    titleQte.textContent = `完美 ${hits}`;
  }

  // 动态撑开高度
  const startMatrixY = 24;
  const cols = currentStations <= 3 ? currentStations : (currentStations === 5 ? 5 : Math.min(4, currentStations));
  const laneH = 4;
  const laneGap = 2;
  const cardPadding = 4;
  const cardH = cardPadding * 2 + 10 + currentHammers * (laneH + laneGap);
  const neededHeight = (currentStations <= 1 && currentHammers <= 1)
  ? 32
  : startMatrixY + Math.ceil(currentStations / cols) * (cardH + 4) + 4;

  if (anvil.style.height !== `${neededHeight}px`) {
    anvil.style.height = `${neededHeight}px`;
    ensureCanvas();
  }
}

export function startParticles() {
  ensureCanvas();
  if (!animFrameId) {
    animFrameId = requestAnimationFrame(renderLoop);
  }
  window.addEventListener('resize', () => {
    ensureCanvas();
  });
}
