/** 锻造火花粒子 + canvas 动画 */
import { $, snap } from './core.js';

const canvas = $('sparks');
const ctx = canvas ? canvas.getContext('2d') : null;
const anvil = $('anvil');

let particles = [];

export function resize() {
  if (!anvil || !canvas || !ctx) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.25);
  canvas.width = Math.max(1, anvil.clientWidth * dpr);
  canvas.height = Math.max(1, anvil.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function sparkAtHead(crit) {
  if (!anvil || !ctx || particles.length > 32) return;
  const w = anvil.clientWidth;
  const h = anvil.clientHeight;
  const p = snap.current ? snap.current.progress : 0.5;
  const x = w * (0.06 + 0.88 * Math.min(0.98, Math.max(0.02, p)));
  const y = h * 0.42;
  const n = crit ? 10 : 5;
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.15;
    const spd = (crit ? 2.4 : 1.4) + Math.random() * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 1,
      crit,
      size: crit ? 2 + Math.random() : 1.2 + Math.random(),
    });
  }
}

function frame() {
  if (particles.length && ctx && anvil) {
    ctx.clearRect(0, 0, anvil.clientWidth, anvil.clientHeight);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= p.crit ? 0.03 : 0.04;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      const a = Math.max(0, p.life);
      ctx.beginPath();
      ctx.fillStyle = p.crit
        ? `rgba(255,${130 + ((a * 90) | 0)},180,${a})`
        : `rgba(255,${170 + ((a * 50) | 0)},70,${a})`;
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  requestAnimationFrame(frame);
}

export function startParticles() {
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
}
