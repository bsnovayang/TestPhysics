import { cfg, VIEW_W, VIEW_H } from './config.js';
import { C } from './render/common.js';
import { TerrainRenderer } from './render/terrain.js';
import { EntityRenderer } from './render/entities.js';
import { ActorRenderer } from './render/actors.js';
import { FieldRenderer } from './render/fields.js';
import { EffectRenderer } from './render/effects.js';
import { HudRenderer } from './render/hud.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.out = canvas.getContext('2d');
    // 整個遊戲畫在 640×360 的低解析度畫布上（1 世界像素 = 1 像素），最後整數倍放大
    this.low = document.createElement('canvas');
    this.low.width = VIEW_W;
    this.low.height = VIEW_H;
    this.ctx = this.low.getContext('2d');
    this.scale = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // 以裝置像素算放大倍率：放得下 1 倍以上就取整數倍，每個像素大小一致；太小才用小數倍
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min((window.innerWidth * dpr) / VIEW_W, (window.innerHeight * dpr) / VIEW_H);
    const k = fit >= 1 ? Math.floor(fit) : Math.max(0.25, fit);
    this.canvas.width = Math.round(VIEW_W * k);
    this.canvas.height = Math.round(VIEW_H * k);
    this.canvas.style.width = this.canvas.width / dpr + 'px';
    this.canvas.style.height = this.canvas.height / dpr + 'px';
    this.scale = k / dpr;
  }

  screenToGame(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * VIEW_W,
      y: ((clientY - r.top) / r.height) * VIEW_H,
    };
  }

  draw(world) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.drawGrid();
    this.drawFieldFills(world);
    this.drawTiles(world);
    // 實驗版本可以自訂水的畫法（粒子水），或在原本的水上加特效
    if (!world.water.draw?.(this.ctx, world)) this.drawWater(world);
    if (!world.water.drawsLava) this.drawLava(world);
    this.fx?.draw(this.ctx, world);
    this.drawPortals(world);
    this.drawSwitchesAndDoors(world);
    this.drawJammerRanges(world);
    for (const e of world.entities) this.drawEntity(world, e);
    this.drawPlayer(world);
    if (world.water.drawSteamLayer) world.water.drawSteamLayer(this.ctx); else this.drawSteam(world);
    this.drawBeams(world);
    this.drawProjectiles(world);
    this.drawBolts(world);
    this.drawParticles(world);
    this.drawFieldOutlines(world);
    this.drawStasisArrows(world);
    this.drawDirAim(world);
    this.drawGrab(world);
    this.drawRewinds(world);
    this.drawAllyOrder(world);
    this.drawPossessBody(world);
    this.drawPreview(world);
    if (cfg.showHitboxes) this.drawHitboxes(world);
    this.drawHud(world);
    if (world.hasBoss) this.drawBossHud(world);
    this.drawCursor(world);
    const out = this.out;
    out.imageSmoothingEnabled = false;
    out.drawImage(this.low, 0, 0, this.canvas.width, this.canvas.height);
  }
}

// 各類別的畫法放在 js/render/，掛到 Renderer 上
Object.assign(Renderer.prototype, TerrainRenderer, EntityRenderer, ActorRenderer, FieldRenderer, EffectRenderer, HudRenderer);
