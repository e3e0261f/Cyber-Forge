/**
 * ui/js/camera.js - 2D Smooth Viewport Camera Follow Engine
 * 实现相机平滑跟随角色移动、视口坐标转换及地图边界软锁定
 */

import { gameStore } from './store/game-store.js';

export const camera = {
  x: gameStore.state.player_x || 13500,
  y: gameStore.state.player_y || 13500,
  targetX: gameStore.state.player_x || 13500,
  targetY: gameStore.state.player_y || 13500,
  smooth: 0.14, // 60fps 平滑插值系数
  zoom: 1.0,

  /**
   * 平滑插值更新相机世界坐标，跟随玩家
   */
  update(px, py, mapW = 27000, mapH = 27000, screenW = window.innerWidth, screenH = window.innerHeight) {
    const validPx = Number.isFinite(px) ? px : 13500;
    const validPy = Number.isFinite(py) ? py : 13500;
    const validMapW = Number.isFinite(mapW) && mapW > 0 ? mapW : 27000;
    const validMapH = Number.isFinite(mapH) && mapH > 0 ? mapH : 27000;
    const validScreenW = Number.isFinite(screenW) && screenW > 0 ? screenW : 1280;
    const validScreenH = Number.isFinite(screenH) && screenH > 0 ? screenH : 720;

    if (!Number.isFinite(this.zoom) || this.zoom <= 0) this.zoom = 1.0;
    if (!Number.isFinite(this.x)) this.x = validPx;
    if (!Number.isFinite(this.y)) this.y = validPy;

    this.targetX = validPx;
    this.targetY = validPy;

    this.x += (this.targetX - this.x) * this.smooth;
    this.y += (this.targetY - this.y) * this.smooth;

    // 边界视口限制，防止画面大面积穿帮留黑
    const halfW = (validScreenW * 0.5) / this.zoom;
    const halfH = (validScreenH * 0.5) / this.zoom;

    if (validMapW > (validScreenW / this.zoom)) {
      this.x = Math.max(halfW, Math.min(validMapW - halfW, this.x));
    } else {
      this.x = validMapW * 0.5;
    }

    if (validMapH > (validScreenH / this.zoom)) {
      this.y = Math.max(halfH, Math.min(validMapH - halfH, this.y));
    } else {
      this.y = validMapH * 0.5;
    }
  },

  /**
   * 屏幕坐标转世界空间绝对坐标
   */
  screenToWorld(sx, sy, screenW = window.innerWidth, screenH = window.innerHeight) {
    const validScreenW = Number.isFinite(screenW) && screenW > 0 ? screenW : 1280;
    const validScreenH = Number.isFinite(screenH) && screenH > 0 ? screenH : 720;
    const z = Number.isFinite(this.zoom) && this.zoom > 0 ? this.zoom : 1.0;
    const cx = Number.isFinite(this.x) ? this.x : 13500;
    const cy = Number.isFinite(this.y) ? this.y : 13500;

    return {
      x: (sx - validScreenW * 0.5) / z + cx,
      y: (sy - validScreenH * 0.5) / z + cy,
    };
  },

  /**
   * 世界空间绝对坐标转屏幕坐标
   */
  worldToScreen(wx, wy, screenW = window.innerWidth, screenH = window.innerHeight) {
    const validScreenW = Number.isFinite(screenW) && screenW > 0 ? screenW : 1280;
    const validScreenH = Number.isFinite(screenH) && screenH > 0 ? screenH : 720;
    const z = Number.isFinite(this.zoom) && this.zoom > 0 ? this.zoom : 1.0;
    const cx = Number.isFinite(this.x) ? this.x : 13500;
    const cy = Number.isFinite(this.y) ? this.y : 13500;

    return {
      x: (wx - cx) * z + validScreenW * 0.5,
      y: (wy - cy) * z + validScreenH * 0.5,
    };
  },

  /**
   * 瞬间锁定坐标（无平滑动画）
   */
  snapTo(px, py) {
    const validPx = Number.isFinite(px) ? px : 13500;
    const validPy = Number.isFinite(py) ? py : 13500;
    this.x = validPx;
    this.y = validPy;
    this.targetX = validPx;
    this.targetY = validPy;
  },
};
