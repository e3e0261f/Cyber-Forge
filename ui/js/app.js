/**
 * 《天道锻造大师 WEB版》 v2.5.1 (WEEB) - 2D 全息赛博修真大世界 (殿堂级美化版)
 */

const rootEl = document.getElementById('game-root');
let canvas = null;
let ctx = null;

// 全局状态快照
let gameState = {
  copper: '19,000', coins: '5.21M', jade: '1,587',
  level: 13, exp: 46872, max_exp: 90949,
  hammer_name: '熵增造物锤', hammer_level: 81, hammer_power: '13.97',
  interval_secs: 1.0, forge_qte_hits: 0,
  sub_level: 10, realm_name: '炼体',
  matrix_slots: 1, concurrent_hammers: 1,
  currency_protocol: '[协议关闭]',
  matrix_progresses: []
};

// 本地物理时钟与状态
let localCycleStartTime = performance.now();
let hammerAngle = -0.48;
let hammerTargetAngle = -0.48;
let screenShake = 0;
let autoStrikeOn = false;

// 粒子与特效池
let sparks = [];
let shockwaves = [];
let steamPuffs = [];
let furnaceEmbers = [];
let gridRipples = [];
let ambientMotes = []; // 空气中漂浮的灵气微粒

// 全息弹窗状态
let isInspectModalOpen = false;
let isHoloHovered = false;

// 帧率统计
let fps = 60;
let frameCount = 0;
let lastFpsTime = performance.now();

// ----------------------------------------------------------------
// 🌟 1. Web API 通信封装
// ----------------------------------------------------------------
async function invoke(endpoint, body = {}) {
  try {
    const isGet = endpoint === 'state';
    const res = await fetch(`/api/${endpoint}`, {
      method: isGet ? 'GET' : 'POST',
      headers: isGet ? {} : { 'Content-Type': 'application/json' },
      body: isGet ? undefined : JSON.stringify(body)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

// ----------------------------------------------------------------
// 🌟 2. 画布初始化与自适应
// ----------------------------------------------------------------
function initCanvas() {
  canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  rootEl.appendChild(canvas);
  ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  resize();
  window.addEventListener('resize', resize);

  // 初始化环境灵气粒子
  initAmbientMotes();
}

function resize() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initAmbientMotes() {
  ambientMotes = [];
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < 28; i++) {
    ambientMotes.push({
      x: Math.random() * w,
                      y: Math.random() * h,
                      vx: (Math.random() - 0.5) * 0.4,
                      vy: -(0.2 + Math.random() * 0.5),
                      size: 1.0 + Math.random() * 2.0,
                      alpha: 0.2 + Math.random() * 0.5,
                      color: Math.random() > 0.5 ? '#00e5ff' : '#ffd700'
    });
  }
}

// ----------------------------------------------------------------
// 🌟 3. 击锤与物理反馈
// ----------------------------------------------------------------
function isCrit() {
  const duration = Math.max(0.05, gameState.interval_secs);
  const elapsed = ((performance.now() - localCycleStartTime) / 1000) % duration;
  const p = elapsed / duration;
  return p >= 0.76 && p < 0.88;
}

async function doStrike() {
  const crit = isCrit();
  localCycleStartTime = performance.now();
  hammerTargetAngle = 0.62; // 重击下砸
  screenShake = crit ? 8.5 : 4.0;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const impactX = w * 0.5;
  const impactY = h * 0.62;

  // 1. 冲击波光环
  shockwaves.push({
    x: impactX, y: impactY - 14,
    radius: 12, maxRadius: crit ? 130 : 70,
    alpha: 1.0,
    color: crit ? '#ff4d7a' : '#ffd700',
    width: crit ? 4.0 : 2.5
  });

  // 2. 🌟 3D 透视地脉涟漪 (柔和波纹)
  gridRipples.push({
    progress: 0.0,
    speed: crit ? 0.022 : 0.014,
    color: crit ? 'rgba(255, 77, 122,' : 'rgba(224, 160, 80,',
                   alpha: 0.9
  });

  // 3. 活塞蒸汽喷射
  const fistX = w * 0.31;
  const fistY = h * 0.55;
  for (let i = 0; i < 8; i++) {
    steamPuffs.push({
      x: fistX - 35, y: fistY - 15,
      vx: -(2.0 + Math.random() * 3.0),
                    vy: (Math.random() - 0.5) * 1.8,
                    size: 10 + Math.random() * 12,
                    alpha: 0.8
    });
  }

  // 4. 太阳精火火星喷射
  const count = crit ? 36 : 18;
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
    const spd = (crit ? 7.0 : 4.0) + Math.random() * 5.5;
    sparks.push({
      x: impactX, y: impactY - 14,
      vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 1.0,
                crit,
                size: crit ? 3.5 + Math.random() * 2.0 : 2.0 + Math.random() * 1.5
    });
  }

  const snap = await invoke('strike');
  if (snap) syncState(snap);
}

function syncState(snap) {
  if (!snap) return;
  gameState = { ...gameState, ...snap };
}

// ----------------------------------------------------------------
// 🌟 4. 全景程序化显卡渲染主循环
// ----------------------------------------------------------------
function render(now) {
  if (!ctx) return;

  frameCount++;
  if (now - lastFpsTime >= 500) {
    fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    frameCount = 0;
    lastFpsTime = now;
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  const time = now * 0.003;

  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    screenShake -= 0.35;
  }

  // 1. 3D 透视网格与工坊环境背景 (带暗角与体积光)
  drawWorkshopBackground(w, h, time);

  // 2. 蒸汽管道与地面青蓝发光光缆
  drawPipesAndCables(w, h, time);

  // 3. 熔炉烈火与双重咬合齿轮组
  drawLavaFurnace(w, h, time);

  // 4. 重型液压机械动力拳套
  drawMechanicalPiston(w, h, time);

  // 5. 地面八卦法阵与 3D 地脉柔和能量波
  drawRunicFloorAndRipples(w, h, time);

  // 6. 🌟 重型黑铁巨砧造型与砧上圣剑
  drawGreatAnvilAndBlade(w, h, now, time);

  // 7. 发条机偶助手 (小天机)
  drawClockworkApprentice(w, h, time);

  // 8. 悬空雷火重锤
  drawWarhammer(w, h, now);

  // 9. 左右天道多面灵晶簇
  drawCrystalCluster(w * 0.16, h * 0.74, 1.25, time);
  drawCrystalCluster(w * 0.84, h * 0.74, 1.35, time + 2.0);

  // 10. 全息神兵设计蓝图
  drawHologramBlueprint(w, h, time);

  // 11. 粒子系统 (冲击波、蒸汽、火星、灵气微尘)
  drawParticleEffects(w, h);

  ctx.restore();

  // 12. 顶部 HUD 资财仪盘
  drawTopHUD(w);

  // 13. 底部快捷栏与 FPS
  drawBottomDock(w, h);

  // 14. 全息四维出生证明全屏弹窗
  if (isInspectModalOpen) {
    drawInspectModal(w, h, time);
  }

  requestAnimationFrame(render);
}

// --- 深度绘制子系统 ---

function drawWorkshopBackground(w, h, time) {
  // 基础背景
  const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 80, w * 0.5, h * 0.5, w * 0.85);
  bgGrad.addColorStop(0, '#101624');
  bgGrad.addColorStop(0.5, '#0a0d15');
  bgGrad.addColorStop(1, '#020306');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 顶部斜向柔和体积光
  const lightBeam = ctx.createLinearGradient(0, 0, w * 0.6, h * 0.8);
  lightBeam.addColorStop(0, 'rgba(0, 229, 255, 0.05)');
  lightBeam.addColorStop(0.5, 'rgba(224, 160, 80, 0.03)');
  lightBeam.addColorStop(1, 'transparent');
  ctx.fillStyle = lightBeam;
  ctx.fillRect(0, 0, w, h);

  // 远景石砌拱门与顶梁
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.40, w * 0.40, Math.PI, 0);
  ctx.stroke();

  // 🌟 3D 纵深透视网格线条
  const horizonY = h * 0.50;
  ctx.strokeStyle = 'rgba(56, 82, 115, 0.25)';
  ctx.lineWidth = 1.2;

  // 纵向透视线
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.5 + i * (w * 0.032), horizonY);
    ctx.lineTo(w * 0.5 + i * (w * 0.15), h);
    ctx.stroke();
  }

  // 横向透视线
  for (let y = horizonY; y <= h; y += (y - horizonY) * 0.32 + 15) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawPipesAndCables(w, h, time) {
  const fx = w * 0.13;
  const px = w * 0.31;
  const ax = w * 0.5;
  const groundY = h * 0.66;

  // 1. 黄铜高压蒸汽主管道 (熔炉 -> 动力拳套)
  ctx.strokeStyle = '#7c4a2a';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(fx + 35, h * 0.42);
  ctx.bezierCurveTo(fx + 90, h * 0.32, px - 60, h * 0.38, px - 35, h * 0.53);
  ctx.stroke();

  // 金属法兰盘接头
  ctx.strokeStyle = '#d4a878';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(fx + 65, h * 0.38); ctx.lineTo(fx + 72, h * 0.38);
  ctx.moveTo(px - 55, h * 0.46); ctx.lineTo(px - 48, h * 0.46);
  ctx.stroke();

  // 2. 地面发光五行能量光缆 (活塞 -> 铁砧底座)
  const cableGlow = 0.55 + Math.sin(time * 3.5) * 0.25;
  ctx.strokeStyle = `rgba(0, 229, 255, ${cableGlow})`;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(px + 45, groundY + 12);
  ctx.quadraticCurveTo(ax - 85, groundY + 28, ax - 75, groundY);
  ctx.stroke();
}

function drawLavaFurnace(w, h, time) {
  const fx = w * 0.13;
  const fy = h * 0.50;

  // 炉体拱形石砌基座
  ctx.fillStyle = '#171e2c';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.roundRect(fx - 75, fy - 95, 150, 190, [45, 45, 10, 10]);
  ctx.fill();
  ctx.stroke();

  // 炉膛烈火深邃光晕
  const fireGlow = ctx.createRadialGradient(fx, fy, 15, fx, fy, 120);
  fireGlow.addColorStop(0, `rgba(255, 130, 20, ${0.8 + Math.sin(time * 3) * 0.15})`);
  fireGlow.addColorStop(0.55, 'rgba(255, 60, 0, 0.35)');
  fireGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = fireGlow;
  ctx.fillRect(fx - 130, fy - 130, 260, 260);

  // 炉口内部滚烫岩浆池
  ctx.fillStyle = '#ff4500';
  ctx.beginPath();
  ctx.roundRect(fx - 42, fy - 22, 84, 75, 10);
  ctx.fill();

  // 双重咬合黄铜齿轮组
  drawGear(fx - 60, fy - 80, 26, 8, time * 0.35, '#c87838');
  drawGear(fx - 28, fy - 96, 18, 6, -time * 0.5, '#d4a878');

  // 熔炉漂浮火星
  if (Math.random() < 0.3) {
    furnaceEmbers.push({
      x: fx + (Math.random() - 0.5) * 65,
                       y: fy + 25,
                       vx: (Math.random() - 0.5) * 1.5,
                       vy: -(1.6 + Math.random() * 2.2),
                       life: 1.0,
                       size: 1.6 + Math.random() * 1.8
    });
  }
}

function drawGear(x, y, radius, teeth, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // 轮辐与齿
  ctx.fillStyle = color;
  for (let i = 0; i < teeth; i++) {
    ctx.rotate((Math.PI * 2) / teeth);
    ctx.fillRect(-3, -radius - 6, 6, 8);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMechanicalPiston(w, h, time) {
  const px = w * 0.31;
  const py = h * 0.55;
  const shift = Math.sin(time * (2.0 / Math.max(0.1, gameState.interval_secs))) * 18;

  // 重型液压缸外壳
  ctx.fillStyle = '#1c2433';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(px - 100, py - 40, 90, 80, 8);
  ctx.fill();
  ctx.stroke();

  // 镀铬镜面活塞杆
  const pistonGrad = ctx.createLinearGradient(0, py - 20, 0, py + 20);
  pistonGrad.addColorStop(0, '#f8fafc');
  pistonGrad.addColorStop(0.5, '#94a3b8');
  pistonGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = pistonGrad;
  ctx.fillRect(px - 25, py - 20, 65 + shift, 40);

  // 赛博动力冲压拳头
  ctx.fillStyle = '#263145';
  ctx.strokeStyle = '#e0a050'; // 动力金边
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  ctx.roundRect(px + 36 + shift, py - 52, 75, 104, [12, 22, 22, 12]);
  ctx.fill();
  ctx.stroke();

  // 机械指节与铜铆钉
  ctx.fillStyle = '#64748b';
  ctx.fillRect(px + 95 + shift, py - 38, 12, 16);
  ctx.fillRect(px + 95 + shift, py - 12, 12, 16);
  ctx.fillRect(px + 95 + shift, py + 14, 12, 16);

  // 青蓝发光液压气压表
  ctx.fillStyle = '#00ffc8';
  ctx.beginPath();
  ctx.arc(px + 68 + shift, py - 22, 8, 0, Math.PI * 2);
  ctx.fill();
}

// 🌟 绘制八卦法阵与柔和 3D 地脉能量涟漪
function drawRunicFloorAndRipples(w, h, time) {
  const ax = w * 0.5;
  const ay = h * 0.65;
  const horizonY = h * 0.50;

  // 1. 柔和扩散的 3D 地脉波纹 (解决之前生硬线圈的痛点)
  for (let i = gridRipples.length - 1; i >= 0; i--) {
    const rip = gridRipples[i];
    rip.progress += rip.speed;
    rip.alpha -= 0.014;

    if (rip.alpha <= 0 || rip.progress >= 1.0) {
      gridRipples.splice(i, 1);
      continue;
    }

    // 根据透视 z 计算在地面网格上的 y 坐标与半径
    const z = rip.progress;
    const waveY = ay + (horizonY - ay) * (z * 0.85);
    const waveW = w * (0.35 + z * 0.45);
    const waveH = 16 + z * 18;

    ctx.strokeStyle = `${rip.color} ${Math.max(0, rip.alpha)})`;
    ctx.lineWidth = 2.5 * (1.0 - z * 0.6);
    ctx.beginPath();
    ctx.ellipse(ax, waveY, waveW * 0.5, waveH * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. 砧下金色八卦光环
  ctx.save();
  ctx.translate(ax, ay + 22);
  ctx.scale(1, 0.44);
  ctx.rotate(time * 0.12);

  ctx.strokeStyle = `rgba(224, 160, 80, ${0.4 + Math.sin(time * 2) * 0.12})`;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, 175, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 135, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.65)';
    ctx.fillRect(-4, -170, 8, 16);
  }
  ctx.restore();
}

// 🌟 绘制标准厚重黑金铁砧与圣剑
function drawGreatAnvilAndBlade(w, h, now, time) {
  const ax = w * 0.5;
  const ay = h * 0.62;
  const anvilW = Math.min(310, w * 0.44);
  const anvilH = 70;

  // 1. 沉重黑金阶梯底座
  ctx.fillStyle = '#080b11';
  ctx.beginPath();
  ctx.roundRect(ax - anvilW / 2 - 22, ay + anvilH - 8, anvilW + 44, 28, 6);
  ctx.fill();

  // 2. 真实铁砧造型：带牛角 (Horn) 与收腰 (Waist)
  const anvilGrad = ctx.createLinearGradient(ax, ay, ax, ay + anvilH);
  anvilGrad.addColorStop(0, '#2e3a4e');
  anvilGrad.addColorStop(0.35, '#1b222e');
  anvilGrad.addColorStop(1, '#0e131b');
  ctx.fillStyle = anvilGrad;
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  // 顶部砧台向左延伸出牛角 (Horn)
  ctx.moveTo(ax - anvilW / 2 - 35, ay + 6);
  ctx.lineTo(ax - anvilW / 2, ay);
  ctx.lineTo(ax + anvilW / 2, ay);
  ctx.lineTo(ax + anvilW / 2 + 10, ay + 20);
  ctx.lineTo(ax + anvilW / 2 - 25, ay + anvilH - 12);
  ctx.lineTo(ax - anvilW / 2 + 25, ay + anvilH - 12);
  ctx.lineTo(ax - anvilW / 2 - 15, ay + 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 铁砧腰身蓝色符文雕刻线
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(ax - anvilW / 2 + 15, ay + anvilH - 22);
  ctx.lineTo(ax + anvilW / 2 - 15, ay + anvilH - 22);
  ctx.stroke();

  // 3. 砧上圣剑剑胚
  const swordW = anvilW * 0.84;
  const swordH = 15;
  const sx = ax - swordW / 2 + 5;
  const sy = ay + 10;

  const duration = Math.max(0.05, gameState.interval_secs);
  const elapsed = ((now - localCycleStartTime) / 1000) % duration;
  const p = Math.min(1.0, elapsed / duration);
  const inCrit = isCrit();

  // 未淬火剑身底胎
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(sx, sy, swordW, swordH, 4);
  ctx.fill();
  ctx.stroke();

  // 熔岩能量充能剑刃
  if (p > 0) {
    const bladeColor = inCrit ? '#ff4d7a' : '#ff8c00';
    const bladeGrad = ctx.createLinearGradient(sx, sy, sx + swordW, sy);
    if (inCrit) {
      bladeGrad.addColorStop(0, '#ff4d7a');
      bladeGrad.addColorStop(0.65, '#ff7597');
      bladeGrad.addColorStop(1, '#ffffff');
    } else {
      bladeGrad.addColorStop(0, '#ff3300');
      bladeGrad.addColorStop(0.55, '#ff8c00');
      bladeGrad.addColorStop(1, '#ffd700');
    }

    ctx.fillStyle = bladeGrad;
    ctx.shadowColor = bladeColor;
    ctx.shadowBlur = inCrit ? 26 : 14;
    ctx.beginPath();
    ctx.roundRect(sx, sy, Math.max(6, swordW * p), swordH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 精致剑柄、剑格与配重球
  ctx.fillStyle = '#64748b';
  ctx.fillRect(sx - 18, sy + 3, 16, 9);
  ctx.fillStyle = '#e0a050';
  ctx.fillRect(sx - 4, sy - 3, 5, 21);
  ctx.beginPath();
  ctx.arc(sx - 22, sy + 7.5, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawClockworkApprentice(w, h, time) {
  const gx = w * 0.65;
  const gy = h * 0.63;

  ctx.save();
  ctx.translate(gx, gy);

  // 黄铜机械身躯
  ctx.fillStyle = '#8c5836';
  ctx.strokeStyle = '#d4a878';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 胸前灵晶动力源
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath();
  ctx.arc(0, 4, 4, 0, Math.PI * 2);
  ctx.fill();

  // 灵动大双眼 (发光青镜片)
  const eyeGlow = 0.65 + Math.sin(time * 4) * 0.3;
  ctx.fillStyle = `rgba(0, 255, 200, ${eyeGlow})`;
  ctx.beginPath();
  ctx.arc(-5, -3, 5.5, 0, Math.PI * 2);
  ctx.arc(7, -3, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // 头顶缓缓旋转的发条钥匙
  ctx.save();
  ctx.translate(0, -22);
  ctx.rotate(time * 1.8);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-7, -4, 14, 8);
  ctx.restore();

  ctx.restore();
}

function drawWarhammer(w, h, now) {
  const ax = w * 0.5;
  const ay = h * 0.62;

  hammerAngle += (hammerTargetAngle - hammerAngle) * 0.32;
  if (hammerTargetAngle > -0.48) hammerTargetAngle -= 0.14;

  ctx.save();
  ctx.translate(ax + 24, ay - 20);
  ctx.rotate(hammerAngle);

  // 锤柄 (皮绳缠绕)
  ctx.fillStyle = '#8c5836';
  ctx.fillRect(-7, -75, 14, 70);
  ctx.strokeStyle = '#d4a878';
  ctx.lineWidth = 1.2;
  for (let y = -70; y <= -15; y += 11) {
    ctx.beginPath();
    ctx.moveTo(-7, y); ctx.lineTo(7, y + 4);
    ctx.stroke();
  }

  // 重型八角玄铁锤头
  const isCritHit = isCrit();
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = isCritHit ? '#ff4d7a' : '#ffd700';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.roundRect(-30, -102, 60, 35, 6);
  ctx.fill();
  ctx.stroke();

  // 锤心发光雷灵珠
  ctx.fillStyle = isCritHit ? '#ff4d7a' : '#00e5ff';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, -84, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawCrystalCluster(x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);

  const breath = 0.75 + Math.sin(time * 2) * 0.2;
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 18 * breath;

  drawSingleShard(0, 0, 15 * scale, 60 * scale, `rgba(0, 229, 255, ${breath})`);
  drawSingleShard(-18 * scale, 14 * scale, 11 * scale, 40 * scale, `rgba(80, 240, 255, ${breath * 0.8})`);
  drawSingleShard(16 * scale, 18 * scale, 10 * scale, 34 * scale, `rgba(0, 200, 230, ${breath * 0.75})`);

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawSingleShard(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w / 2, y - h * 0.6);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x - w / 2, y);
  ctx.lineTo(x - w / 2, y - h * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawHologramBlueprint(w, h, time) {
  const hx = w * 0.78;
  const hy = h * 0.38;
  const bw = 180;
  const bh = 130;

  ctx.fillStyle = isHoloHovered ? 'rgba(0, 60, 95, 0.65)' : 'rgba(0, 40, 65, 0.45)';
  ctx.strokeStyle = isHoloHovered ? '#00ffff' : 'rgba(0, 229, 255, 0.65)';
  ctx.lineWidth = isHoloHovered ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.roundRect(hx - bw / 2, hy - bh / 2, bw, bh, 8);
  ctx.fill();
  ctx.stroke();

  // 动态扫描线
  const scanY = hy - bh / 2 + ((time * 42) % bh);
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx - bw / 2 + 4, scanY);
  ctx.lineTo(hx + bw / 2 - 4, scanY);
  ctx.stroke();

  // 全息文字
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('⚡ 全息神兵蓝图 (点击查看)', hx - bw / 2 + 10, hy - bh / 2 + 22);

  ctx.fillStyle = '#99f6e4';
  ctx.font = '10px monospace';
  ctx.fillText(`品阶: 绝品 · 九劫圣器`, hx - bw / 2 + 12, hy - bh / 2 + 44);
  ctx.fillText(`五行: 庚金生水 · 阳极`, hx - bw / 2 + 12, hy - bh / 2 + 60);
  ctx.fillText(`锋锐: 100% 满淬炼`, hx - bw / 2 + 12, hy - bh / 2 + 76);
  ctx.fillText(`指纹: #Z7kQ-9mA3F2`, hx - bw / 2 + 12, hy - bh / 2 + 92);
  ctx.fillText(`始祖: 纯阳真仙`, hx - bw / 2 + 12, hy - bh / 2 + 108);
}

function drawInspectModal(w, h, time) {
  ctx.fillStyle = 'rgba(2, 4, 8, 0.85)';
  ctx.fillRect(0, 0, w, h);

  const mw = Math.min(480, w * 0.85);
  const mh = 320;
  const mx = w * 0.5 - mw / 2;
  const my = h * 0.5 - mh / 2;

  ctx.fillStyle = '#0b111a';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('庚金·长剑 ·【秋水长天】', mx + 24, my + 38);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText('品质: [史诗]  |  锋锐: 100  |  五行: 庚金', mx + 24, my + 60);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.moveTo(mx + 20, my + 75); ctx.lineTo(mx + mw - 20, my + 75);
  ctx.stroke();

  ctx.fillStyle = '#00ffc8';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('📜【天道出生证明 (四维指纹)】', mx + 24, my + 105);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px monospace';
  ctx.fillText('• 诞生时辰：甲辰年 · 壬申月 · 庚戌日 · 子时三刻', mx + 28, my + 132);
  ctx.fillText('• 归属地轴：离火九五 · 阳极之位 (东经121.5° 北纬31.2°)', mx + 28, my + 155);
  ctx.fillText('• 始祖铸匠：道友「纯阳真仙」 (铸剑始祖)', mx + 28, my + 178);
  ctx.fillText('• 天道印记：[玄之又玄 · 众妙之门] (取自《道德经》第一章)', mx + 28, my + 201);
  ctx.fillText('• 铭文短码：#Z7kQ-9mA3F2 (不可篡改64位哈希)', mx + 28, my + 224);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.moveTo(mx + 20, my + 245); ctx.lineTo(mx + mw - 20, my + 245);
  ctx.stroke();

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('💰 当前估价：18.50M 金币  |  历史落槌：14 次成交', mx + 24, my + 275);

  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';
  ctx.fillText('(点击任意空白处关闭弹窗)', mx + mw - 160, my + 300);
}

function drawParticleEffects(w, h) {
  // 1. 冲击波
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.radius += 4.5;
    sw.alpha -= 0.04;
    if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
      shockwaves.splice(i, 1);
      continue;
    }
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = Math.max(0, sw.alpha);
    ctx.lineWidth = sw.width;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  // 2. 蒸汽
  for (let i = steamPuffs.length - 1; i >= 0; i--) {
    const sp = steamPuffs[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.size += 0.4;
    sp.alpha -= 0.02;
    if (sp.alpha <= 0) {
      steamPuffs.splice(i, 1);
      continue;
    }
    ctx.fillStyle = `rgba(220, 235, 255, ${sp.alpha})`;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. 熔炉火星
  for (let i = furnaceEmbers.length - 1; i >= 0; i--) {
    const em = furnaceEmbers[i];
    em.x += em.vx;
    em.y += em.vy;
    em.life -= 0.02;
    if (em.life <= 0) {
      furnaceEmbers.splice(i, 1);
      continue;
    }
    ctx.fillStyle = `rgba(255, ${150 + Math.random() * 80}, 30, ${em.life})`;
    ctx.beginPath();
    ctx.arc(em.x, em.y, em.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. 击锤火花
  for (let i = sparks.length - 1; i >= 0; i--) {
    const pt = sparks[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vy += 0.24;
    pt.life -= pt.crit ? 0.025 : 0.04;
    if (pt.life <= 0) {
      sparks.splice(i, 1);
      continue;
    }
    const a = Math.max(0, pt.life);
    ctx.fillStyle = pt.crit ? `rgba(255, 77, 122, ${a})` : `rgba(255, 185, 40, ${a})`;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * a, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. 空气中漂浮的灵气微粒
  for (let i = 0; i < ambientMotes.length; i++) {
    const m = ambientMotes[i];
    m.x += m.vx;
    m.y += m.vy;
    if (m.y < 0) {
      m.y = h;
      m.x = Math.random() * w;
    }
    ctx.fillStyle = m.color;
    ctx.globalAlpha = m.alpha;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

// 绘制顶部 HUD
function drawTopHUD(w) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.94)';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(16, 12, w - 32, 44, 8);
  ctx.fill();
  ctx.stroke();

  // 金属铆钉
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.arc(24, 20, 2.5, 0, Math.PI * 2);
  ctx.arc(w - 24, 20, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('【天道锻造大师】', 34, 39);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#c89664';
  ctx.fillText(`铜钱: ${gameState.copper}`, 180, 39);
  ctx.fillStyle = '#ffd700';
  ctx.fillText(`金币: ${gameState.coins}`, 305, 39);
  ctx.fillStyle = '#00ffc8';
  ctx.fillText(`仙玉: ${gameState.jade}`, 435, 39);

  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`LV.${gameState.level} ${gameState.hammer_name}`, 560, 39);
  ctx.fillStyle = '#ff4d7a';
  ctx.fillText(`完美QTE: ${Number(gameState.forge_qte_hits || 0).toFixed(1)}`, 710, 39);

  // 协议按钮
  ctx.fillStyle = 'rgba(0, 255, 200, 0.15)';
  ctx.strokeStyle = '#00ffc8';
  ctx.beginPath();
  ctx.roundRect(w - 145, 20, 115, 28, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#00ffc8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`${gameState.currency_protocol} ▾`, w - 132, 38);
}

// 绘制底部快捷栏
function drawBottomDock(w, h) {
  const y = h - 36;
  ctx.fillStyle = 'rgba(8, 12, 18, 0.95)';
  ctx.fillRect(0, y, w, 36);
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(0, y, w, 36);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('【操作】空格/点击铁砧: 挥锤 | 点击全息蓝图: 查看神兵出生证 | U/W/A/R/D/E: 狂飙升级 | K: 挂机锤', 20, y + 22);

  let fpsColor = '#00ffc8';
  if (fps < 30) fpsColor = '#ff4d7a';
  else if (fps < 50) fpsColor = '#ffd700';
  ctx.fillStyle = fpsColor;
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`FPS: ${fps}`, w - 85, y + 22);
}

// ----------------------------------------------------------------
// 🌟 5. 交互监听
// ----------------------------------------------------------------
function setupInteractions() {
  window.addEventListener('pointermove', (e) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const hx = w * 0.78;
    const hy = h * 0.38;
    const bw = 180;
    const bh = 130;

    isHoloHovered = (e.clientX >= hx - bw / 2 && e.clientX <= hx + bw / 2 &&
    e.clientY >= hy - bh / 2 && e.clientY <= hy + bh / 2);

    if (isHoloHovered) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'default';
    }
  });

  window.addEventListener('pointerdown', (e) => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (isInspectModalOpen) {
      isInspectModalOpen = false;
      return;
    }

    const hx = w * 0.78;
    const hy = h * 0.38;
    const bw = 180;
    const bh = 130;
    if (e.clientX >= hx - bw / 2 && e.clientX <= hx + bw / 2 &&
      e.clientY >= hy - bh / 2 && e.clientY <= hy + bh / 2) {
      isInspectModalOpen = true;
    return;
      }

      if (e.clientY > h * 0.25 && e.clientY < h * 0.85) {
        doStrike();
      }
  });

  window.addEventListener('keydown', async (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      doStrike();
      return;
    }
    if (e.code === 'KeyK') {
      autoStrikeOn = !autoStrikeOn;
      return;
    }
    if (e.code === 'KeyB') {
      const snap = await invoke('action', { key: 'b' });
      if (snap) syncState(snap);
      return;
    }
    const map = { KeyU: 'u', KeyW: 'w', KeyA: 'a', KeyR: 'r', KeyD: 'd', KeyE: 'e' };
    if (map[e.code]) {
      const snap = await invoke('action', { key: map[e.code] });
      if (snap) syncState(snap);
    }
  });
}

// ----------------------------------------------------------------
// 🌟 6. 游戏总引导启动
// ----------------------------------------------------------------
(async function boot() {
  initCanvas();
  setupInteractions();

  const s = await invoke('state');
  if (s) syncState(s);

  requestAnimationFrame(render);

  setInterval(async () => {
    const snap = await invoke('tick');
    if (snap) syncState(snap);

    if (autoStrikeOn) {
      doStrike();
    }
  }, 150);
})();
