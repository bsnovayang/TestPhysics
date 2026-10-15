import { cfg, TILE, COLS, ROWS } from './config.js';

// 格子水：每一格存一個水量（0～1），每一步依「該格當下的重力方向」往下流、往兩側攤平。
// 所以水會受反重力、定向重力影響；無重力時停在原地；時停時不流動，並且變成可以站的實心。
// 也負責溫度：光線讓冰升溫融化，冷凍裝置讓附近的水結冰
export class WaterSystem {
  constructor(map) {
    this.map = map;
    this.amount = new Float32Array(COLS * ROWS);
    this.cold = new Float32Array(COLS * ROWS);  // 結冰進度
    this.heat = new Float32Array(COLS * ROWS);  // 冰牆格的融化進度
    this.frozen = new Set();                    // 被時停的水格（實心）
    this.flip = false;
  }

  idx(tx, ty) {
    return ty * COLS + tx;
  }

  inBounds(tx, ty) {
    return tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS;
  }

  get(tx, ty) {
    return this.inBounds(tx, ty) ? this.amount[this.idx(tx, ty)] : 0;
  }

  add(tx, ty, a) {
    if (this.inBounds(tx, ty) && !this.map.isSolid(tx, ty)) this.amount[this.idx(tx, ty)] += a;
  }

  // 某一點是否在水面以下（水從格子的底部往上填）
  pointInWater(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const a = this.get(tx, ty);
    if (a <= 0.01) return false;
    if (a >= 0.99 || this.get(tx, ty - 1) > 0.01) return true;
    return y >= ty * TILE + (1 - a) * TILE;
  }

  // 物體泡在水裡的比例（取 3×3 個取樣點）
  submersion(b) {
    let n = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (this.pointInWater(b.x + (b.w * (i + 0.5)) / 3, b.y + (b.h * (j + 0.5)) / 3)) n++;
      }
    }
    return n / 9;
  }

  // 矩形是否碰到被時停的水（實心）。self 目前已經泡在裡面的格子不算，避免被封在水裡出不來
  frozenOverlap(x, y, w, h, self) {
    if (!this.frozen.size) return false;
    return this.map.anyTileInRect(x, y, w, h, (tx, ty) => {
      if (!this.frozen.has(this.idx(tx, ty))) return false;
      if (!self) return true;
      const cx = tx * TILE;
      const cy = ty * TILE;
      const inside = self.x < cx + TILE && self.x + self.w > cx && self.y < cy + TILE && self.y + self.h > cy;
      return !inside;
    });
  }

  update(world, dt) {
    this.frozen.clear();
    this.flip = !this.flip;
    const A = this.amount;

    // 由下往上處理（正常重力時，水一步只會往下流一格）
    for (let ty = ROWS - 1; ty >= 0; ty--) {
      for (let k = 0; k < COLS; k++) {
        const tx = this.flip ? k : COLS - 1 - k;
        const i = this.idx(tx, ty);
        let a = A[i];
        if (a < 0.002) { A[i] = 0; continue; }
        if (this.map.isSolid(tx, ty)) { A[i] = 0; continue; }

        const m = world.fields.sample(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
        if (m.time < 0.05) {
          if (a >= 0.5) this.frozen.add(i);
          continue;
        }
        const ax = Math.abs(m.gx);
        const ay = Math.abs(m.gy);
        if (Math.max(ax, ay) < 1) continue; // 無重力：水停在原地
        const down = ay >= ax ? { x: 0, y: Math.sign(m.gy) } : { x: Math.sign(m.gx), y: 0 };
        const rate = Math.min(1, m.time);

        // 往下流
        a -= this.flowInto(world, tx + down.x, ty + down.y, down, a * rate);
        // 往兩側攤平
        if (a > 0.002) {
          const sides = down.x === 0 ? [{ x: -1, y: 0 }, { x: 1, y: 0 }] : [{ x: 0, y: -1 }, { x: 0, y: 1 }];
          const start = a;
          for (const s of sides) {
            const sx = tx + s.x;
            const sy = ty + s.y;
            if (!this.inBounds(sx, sy)) continue;
            if (this.map.isSolid(sx, sy)) {
              // 側面的牆上有傳送門時，水也會從側面流進去（例如門開在水槽的側壁）
              a -= this.flowInto(world, sx, sy, s, (start / 3) * rate);
              continue;
            }
            const other = A[this.idx(sx, sy)];
            if (other >= start) continue;
            const f = ((start - other) / 3) * rate;
            A[this.idx(sx, sy)] += f;
            a -= f;
          }
        }
        A[i] = a;
      }
    }

    this.updateTemperature(world, dt);
  }

  // 把最多 amount 的水移到 (tx, ty)；如果那裡是傳送門，就從另一個門流出。回傳實際移動的量
  flowInto(world, tx, ty, dir, amount) {
    if (!this.inBounds(tx, ty)) return 0; // 畫面邊緣對水來說是牆（否則坑底的水會從尖刺下方流光）
    const A = this.amount;
    if (!this.map.isSolid(tx, ty)) {
      const j = this.idx(tx, ty);
      const f = Math.min(amount, Math.max(0, 1 - A[j]));
      A[j] += f;
      return f;
    }
    // 傳送門：門面朝向水流的反方向時，水從出口前方的兩格流出
    const portals = world.portals;
    if (!portals.active) return 0;
    const p = portals.list.find((q) => q.keys.has(`${tx},${ty}`) && q.nx === -dir.x && q.ny === -dir.y);
    if (!p) return 0;
    const out = portals.partner(p);
    let moved = 0;
    for (const t of out.tiles) {
      const ox = t.tx + out.nx;
      const oy = t.ty + out.ny;
      if (!this.inBounds(ox, oy) || this.map.isSolid(ox, oy)) continue;
      const j = this.idx(ox, oy);
      const f = Math.min((amount - moved) / 2 + 0.0001, Math.max(0, 1 - A[j]), amount - moved);
      A[j] += f;
      moved += f;
    }
    return moved;
  }

  updateTemperature(world, dt) {
    // 冷凍裝置：範圍內的水慢慢結成冰牆格（有東西在那一格時不結冰）
    const coolers = world.entities.filter((e) => e.isCooler && e.alive);
    const A = this.amount;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const i = this.idx(tx, ty);
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        const chilled = A[i] >= 0.5 && coolers.some((c) => Math.hypot(cx - c.cx, cy - c.cy) <= cfg.coldRadius);
        if (!chilled) { this.cold[i] = 0; continue; }
        this.cold[i] += dt;
        if (this.cold[i] < cfg.freezeTime) continue;
        const cell = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
        const occupied = world.bodies().some((b) => b.x < cell.x + cell.w && b.x + b.w > cell.x && b.y < cell.y + cell.h && b.y + b.h > cell.y);
        if (occupied) continue;
        this.map.set(tx, ty, 'I');
        A[i] = 0;
        this.cold[i] = 0;
        world.burst(cx, cy, '#e0f6ff', 6);
      }
    }
    // 沒有被光照到的冰會慢慢降溫
    for (let i = 0; i < this.heat.length; i++) if (this.heat[i] > 0) this.heat[i] = Math.max(0, this.heat[i] - dt * 0.5);
  }

  // 光線照到冰牆格時呼叫
  heatTile(world, tx, ty, dt) {
    const i = this.idx(tx, ty);
    this.heat[i] += dt * 1.5; // 加上自然降溫後，淨速率約為每秒 1
    if (this.heat[i] < cfg.meltTime) return;
    this.heat[i] = 0;
    this.map.set(tx, ty, ' ');
    this.amount[i] = 1;
    world.burst(tx * TILE + 8, ty * TILE + 8, '#9fd8ff', 10);
  }

  meltProgress(tx, ty) {
    return this.heat[this.idx(tx, ty)] / cfg.meltTime;
  }
}
