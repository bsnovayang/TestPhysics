// 原版＋粒子特效（實驗版本）
// 水的運作完全沿用原版的格子水，只在畫面上加特效：
//   - 往下流的水會滴出水珠
//   - 水落到水面時濺起水花
//   - 物體掉進水裡時濺起一大片水花
//   - 水面有起伏的波紋，被濺到的地方波動比較大
import { TILE, COLS, ROWS } from '../../js/config.js';

export class WaterFx {
  constructor() {
    this.drops = [];
    this.prev = null;
    this.prevRoom = null;
    this.prevSub = new Map();
    this.wave = new Float32Array(COLS); // 每一欄水面的波動幅度
  }

  splash(x, y, n, power) {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const s = power * (0.4 + Math.random() * 0.6);
      this.drops.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.2 });
    }
    const col = Math.floor(x / TILE);
    for (let c = col - 2; c <= col + 2; c++) if (c >= 0 && c < COLS) this.wave[c] = Math.min(4, this.wave[c] + power / 60);
  }

  update(world, dt) {
    const w = world.water;
    if (this.prevRoom !== world.map || !this.prev) {
      this.prev = w.amount.slice();
      this.prevRoom = world.map;
      this.drops.length = 0;
    }

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const a = w.get(tx, ty);
        const i = w.idx(tx, ty);
        // 往下流的水：這一格有水，下面一格不是牆也還沒滿 → 偶爾滴出水珠
        if (a > 0.05 && ty + 1 < ROWS && !w.blocked(tx, ty + 1) && w.get(tx, ty + 1) < 0.95 && Math.random() < 0.25) {
          this.drops.push({ x: tx * TILE + Math.random() * TILE, y: ty * TILE + TILE, vx: (Math.random() - 0.5) * 10, vy: 30 + Math.random() * 40, life: 1 });
        }
        // 水面的水量突然增加（有水落下來）→ 濺起水花
        const above = ty > 0 ? w.get(tx, ty - 1) : 0;
        if (a - this.prev[i] > 0.04 && above < 0.05 && Math.random() < 0.5) {
          this.splash(tx * TILE + TILE / 2, ty * TILE + TILE * (1 - Math.min(1, a)), 2, 70);
        }
      }
    }

    // 物體掉進水裡：泡水比例從 0 變成大於 0，而且速度夠快
    for (const b of world.bodies()) {
      const sub = b.submerged ?? 0;
      const before = this.prevSub.get(b) ?? 0;
      if (before === 0 && sub > 0 && Math.abs(b.vy) > 60) this.splash(b.cx, b.y + b.h, 10, Math.min(200, 60 + Math.abs(b.vy) * 0.6));
      this.prevSub.set(b, sub);
    }

    // 水珠：受重力影響，落回水中、碰到牆或時間到就消失
    for (const d of this.drops) {
      const m = world.fields.sample(d.x, d.y);
      const t = Math.min(1, m.time);
      d.vx += m.gx * dt * t * 0.6;
      d.vy += m.gy * dt * t * 0.6;
      d.x += d.vx * dt * t;
      d.y += d.vy * dt * t;
      d.life -= dt;
      const tx = Math.floor(d.x / TILE);
      const ty = Math.floor(d.y / TILE);
      if (d.life <= 0 || !w.inBounds(tx, ty) || w.blocked(tx, ty) || (d.vy > 0 && w.pointInWater(d.x, d.y))) d.life = 0;
    }
    this.drops = this.drops.filter((d) => d.life > 0);
    if (this.drops.length > 600) this.drops.splice(0, this.drops.length - 600);

    for (let c = 0; c < COLS; c++) this.wave[c] = Math.max(0.6, this.wave[c] * (1 - dt * 1.5));
    this.prev = w.amount.slice();
  }

  draw(ctx, world) {
    const w = world.water;
    const time = world.time;
    // 水面波紋：在每個水面格子上畫一條起伏的亮線
    ctx.strokeStyle = 'rgba(200,230,255,0.7)';
    ctx.lineWidth = 1;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const a = w.get(tx, ty);
        if (a <= 0.05 || (ty > 0 && w.get(tx, ty - 1) > 0.01) || w.frozen.has(w.idx(tx, ty))) continue;
        const y0 = ty * TILE + TILE * (1 - Math.min(1, a));
        ctx.beginPath();
        for (let k = 0; k <= 4; k++) {
          const x = tx * TILE + (k * TILE) / 4;
          const y = y0 + Math.sin(time * 4 + x * 0.25) * this.wave[tx] * 0.6;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // 水珠
    ctx.fillStyle = 'rgba(170,215,255,0.9)';
    for (const d of this.drops) ctx.fillRect(d.x - 1, d.y - 1, 2, 2);
  }
}

export function createFx() {
  return new WaterFx();
}
