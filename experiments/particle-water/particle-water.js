// 粒子水（實驗版本）
// 用粒子模擬水的流動（Clavet 等人 2005 的「雙密度鬆弛」SPH 簡化版），
// 每一幀再把粒子換算回「每一格有多少水」，所以浮力、游泳、光線折射、結冰、蒸氣、傳送門等
// 原本依賴格子水的系統都可以直接沿用。蒸氣仍然是格子（沿用原版）。
import { cfg, TILE, COLS, ROWS, VIEW_W, VIEW_H } from '../../js/config.js';
import { WaterSystem } from '../../js/water.js';

const PPC = 8;            // 一整格水 = 8 顆粒子
const H = 9;              // 粒子互相作用的半徑（px）
const MAX = 4000;
const STIFF = 0.5;        // 壓力（讓粒子保持間距）
const STIFF_NEAR = 1;     // 近距離壓力（避免粒子疊在一起）
const DAMP = 0.995;

// SUBSTEPS：每一幀切成幾個小步驟；ITERS：每個小步驟做幾次密度鬆弛。小步驟、多次輕推比一次用力推穩定
const SLOTS = [[2.7, 2.7], [8, 2.7], [13.3, 2.7], [2.7, 8], [13.3, 8], [2.7, 13.3], [8, 13.3], [13.3, 13.3], [8, 8]];

export const params = { STIFF, STIFF_NEAR, SUBSTEPS: 3, ITERS: 3, VLIM: 400, REST: 0.8 };

export class ParticleWaterSystem extends WaterSystem {
  constructor(map) {
    super(map);
    this.px = new Float32Array(MAX);
    this.py = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.frozenP = new Uint8Array(MAX);
    this.n = 0;
    this.pending = new Float32Array(COLS * ROWS); // 還沒變成粒子（或還沒刪掉）的水量，以粒子數計
    this.inUpdate = false;
    this.restDensity = null;
    this.gridW = Math.ceil(VIEW_W / H) + 1;
    this.gridH = Math.ceil(VIEW_H / H) + 1;
    this.head = new Int32Array(this.gridW * this.gridH);
    this.next = new Int32Array(MAX);
  }

  // ---- 粒子的增減 ----

  spawn(x, y, vx = 0, vy = 0) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.frozenP[i] = 0;
  }

  removeAt(i) {
    const last = --this.n;
    this.px[i] = this.px[last];
    this.py[i] = this.py[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.frozenP[i] = this.frozenP[last];
  }

  // 依 pending 在某一格生成或刪除粒子
  resolvePending(cell) {
    const tx = cell % COLS;
    const ty = Math.floor(cell / COLS);
    // 一次生成多顆時，平均排在 3×3 的格點上（跳過中心），避免粒子疊在一起、一出現就被壓力彈飛
    let k = 0;
    while (this.pending[cell] >= 1) {
      const slot = SLOTS[k++ % SLOTS.length];
      this.spawn(tx * TILE + slot[0] + (Math.random() - 0.5), ty * TILE + slot[1] + (Math.random() - 0.5));
      this.pending[cell] -= 1;
    }
    while (this.pending[cell] <= -1) {
      let found = -1;
      for (let i = 0; i < this.n; i++) {
        if (Math.floor(this.px[i] / TILE) === tx && Math.floor(this.py[i] / TILE) === ty) { found = i; break; }
      }
      if (found < 0) { this.pending[cell] = 0; break; }
      this.removeAt(found);
      this.pending[cell] += 1;
    }
  }

  // 某一格的水量改變了（由沸騰、結冰、融化、凝結等造成），換算成粒子的增減
  syncCell(cell, before) {
    const delta = this.amount[cell] - before;
    if (Math.abs(delta) < 1e-6) return;
    this.pending[cell] += delta * PPC;
    this.resolvePending(cell);
  }

  add(tx, ty, a) {
    if (!this.inBounds(tx, ty) || this.blocked(tx, ty)) return;
    const cell = this.idx(tx, ty);
    this.pending[cell] += a * PPC;
    this.resolvePending(cell);
    this.amount[cell] += a;
  }

  heatWater(tx, ty, dt, power = 1) {
    const cell = this.idx(tx, ty);
    const before = this.amount[cell];
    super.heatWater(tx, ty, dt, power);
    if (!this.inUpdate) this.syncCell(cell, before);
  }

  heatTile(world, tx, ty, dt) {
    const cell = this.idx(tx, ty);
    const before = this.amount[cell];
    super.heatTile(world, tx, ty, dt);
    if (!this.inUpdate) this.syncCell(cell, before);
  }

  // ---- 每一幀 ----

  update(world, dt) {
    // 房間載入後第一幀：先在背景讓水穩定下來（玩家看不到），再開始正常運作
    if (!this.presettled) {
      this.presettled = true;
      for (let k = 0; k < 120; k++) this.stepParticles(world, dt);
      this.vx.fill(0);
      this.vy.fill(0);
    }
    this.frozen.clear();
    this.flip = !this.flip;
    this.coolers = world.entities.filter((e) => e.isCooler && e.alive);
    this.stepParticles(world, dt);
    this.deriveGrid();

    // 蒸氣與溫度沿用原版（它們會改動格子的水量），再把改動換算回粒子
    this.inUpdate = true;
    const before = this.amount.slice();
    this.updateSteam(world, dt);
    this.updateTemperature(world, dt);
    this.inUpdate = false;
    for (let i = 0; i < this.amount.length; i++) {
      if (Math.abs(this.amount[i] - before[i]) > 1e-6) this.syncCell(i, before[i]);
    }
    this.deriveGrid();
  }

  // 把粒子換算成每一格的水量，並標記被時停的水格
  deriveGrid() {
    this.amount.fill(0);
    for (let i = 0; i < this.n; i++) {
      const tx = Math.floor(this.px[i] / TILE);
      const ty = Math.floor(this.py[i] / TILE);
      if (!this.inBounds(tx, ty)) continue;
      const cell = this.idx(tx, ty);
      this.amount[cell] += 1 / PPC;
      if (this.frozenP[i]) this.frozen.add(cell);
    }
    for (let cell = 0; cell < this.amount.length; cell++) {
      if (this.pending[cell] > 0) this.amount[cell] += this.pending[cell] / PPC;
    }
  }

  buildGrid() {
    this.head.fill(-1);
    for (let i = 0; i < this.n; i++) {
      const gx = Math.min(this.gridW - 1, Math.max(0, Math.floor(this.px[i] / H)));
      const gy = Math.min(this.gridH - 1, Math.max(0, Math.floor(this.py[i] / H)));
      const g = gy * this.gridW + gx;
      this.next[i] = this.head[g];
      this.head[g] = i;
    }
  }

  solidAt(world, x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return true; // 畫面邊緣對水來說是牆
    if (this.blocked(tx, ty)) return true;
    // 實心的物件（箱子、平台、干擾器）也會擋住水
    for (const e of world.entities) {
      if (e.solid && e.alive && !e.isBullet && x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h) return true;
    }
    return false;
  }

  stepParticles(world, dt) {
    for (let k = 0; k < params.SUBSTEPS; k++) this.substep(world, dt / params.SUBSTEPS);
  }

  substep(world, dt) {
    const n = this.n;
    if (!n) return;
    const ox = new Float32Array(n);
    const oy = new Float32Array(n);
    const ts = new Float32Array(n);

    // 1. 依各自所在位置的場域加上重力，記下舊位置後移動
    for (let i = 0; i < n; i++) {
      const m = world.fields.sample(this.px[i], this.py[i]);
      const t = Math.min(1, m.time);
      ts[i] = t;
      this.frozenP[i] = m.time < 0.05 ? 1 : 0;
      ox[i] = this.px[i];
      oy[i] = this.py[i];
      if (this.frozenP[i]) continue;
      const ldt = dt * t;
      this.vx[i] = (this.vx[i] + m.gx * ldt) * DAMP;
      this.vy[i] = (this.vy[i] + m.gy * ldt) * DAMP;
      this.px[i] += this.vx[i] * ldt;
      this.py[i] += this.vy[i] * ldt;
    }

    // 2. 雙密度鬆弛：太擠就推開、讓水保持大致固定的密度
    const rho0 = (this.restDensity ?? (this.restDensity = this.measureRestDensity())) * params.REST;
    for (let it = 0; it < params.ITERS; it++) this.relax(rho0, ts);

    // 3. 傳送門、牆壁碰撞，最後由位移推算速度
    this.collide(world, dt, ox, oy, ts);
  }

  relax(rho0, ts) {
    const n = this.n;
    this.buildGrid();
    for (let i = 0; i < n; i++) {
      if (this.frozenP[i]) continue;
      const gx = Math.floor(this.px[i] / H);
      const gy = Math.floor(this.py[i] / H);
      let rho = 0;
      let rhoN = 0;
      const nb = [];
      for (let yy = gy - 1; yy <= gy + 1; yy++) {
        if (yy < 0 || yy >= this.gridH) continue;
        for (let xx = gx - 1; xx <= gx + 1; xx++) {
          if (xx < 0 || xx >= this.gridW) continue;
          for (let j = this.head[yy * this.gridW + xx]; j !== -1; j = this.next[j]) {
            if (j === i) continue;
            const dx = this.px[j] - this.px[i];
            const dy = this.py[j] - this.py[i];
            const r2 = dx * dx + dy * dy;
            if (r2 >= H * H) continue;
            const r = Math.sqrt(r2) || 0.01;
            const q = 1 - r / H;
            rho += q * q;
            rhoN += q * q * q;
            nb.push(j, dx / r, dy / r, q);
          }
        }
      }
      const P = params.STIFF * (rho - rho0);
      const PN = params.STIFF_NEAR * rhoN;
      let dxi = 0;
      let dyi = 0;
      for (let k = 0; k < nb.length; k += 4) {
        const j = nb[k];
        const q = nb[k + 3];
        const D = (P * q + PN * q * q) * H * 0.5 * ts[i];
        if (!this.frozenP[j]) {
          this.px[j] += nb[k + 1] * D * 0.5;
          this.py[j] += nb[k + 2] * D * 0.5;
        }
        dxi -= nb[k + 1] * D * 0.5;
        dyi -= nb[k + 2] * D * 0.5;
      }
      this.px[i] += dxi;
      this.py[i] += dyi;
    }
  }

  collide(world, dt, ox, oy, ts) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      if (this.frozenP[i]) continue;
      const cross = world.portals.crossSegment(ox[i], oy[i], this.px[i], this.py[i]);
      if (cross) {
        const v = cross.rotate(this.vx[i], this.vy[i]);
        this.px[i] = cross.x;
        this.py[i] = cross.y;
        this.vx[i] = v.x;
        this.vy[i] = v.y;
        continue;
      }
      if (this.solidAt(world, this.px[i], this.py[i])) {
        if (!this.solidAt(world, ox[i], this.py[i])) { this.px[i] = ox[i]; }
        else if (!this.solidAt(world, this.px[i], oy[i])) { this.py[i] = oy[i]; }
        else { this.px[i] = ox[i]; this.py[i] = oy[i]; }
      }
      const ldt = dt * ts[i];
      if (ldt > 0) {
        this.vx[i] = (this.px[i] - ox[i]) / ldt;
        this.vy[i] = (this.py[i] - oy[i]) / ldt;
      }
      const lim = params.VLIM;
      this.vx[i] = Math.max(-lim, Math.min(lim, this.vx[i]));
      this.vy[i] = Math.max(-lim, Math.min(lim, this.vy[i]));
    }
  }

  // 靜止時（每格 PPC 顆、平均分布）的參考密度
  measureRestDensity() {
    const s = TILE / Math.sqrt(PPC);
    let rho = 0;
    for (let a = -3; a <= 3; a++) {
      for (let b = -3; b <= 3; b++) {
        if (!a && !b) continue;
        const r = Math.hypot(a * s, b * s);
        if (r >= H) continue;
        const q = 1 - r / H;
        rho += q * q;
      }
    }
    return rho;
  }

  // ---- 畫面：每顆粒子畫成半透明的圓，重疊起來就像一整片水 ----
  draw(ctx) {
    for (let i = 0; i < this.n; i++) {
      ctx.fillStyle = this.frozenP[i] ? 'rgba(170,225,255,0.55)' : 'rgba(60,140,255,0.35)';
      ctx.beginPath();
      ctx.arc(this.px[i], this.py[i], 5, 0, Math.PI * 2);
      ctx.fill();
    }
    return true; // 取代原本的格子水畫法
  }
}

export function createWater(map) {
  return new ParticleWaterSystem(map);
}
