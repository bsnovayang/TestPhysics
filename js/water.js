import { cfg, TILE, COLS, ROWS } from './config.js';

// 水沸騰時會膨脹：1 單位的水變成 4 單位的蒸氣；凝結時反過來，所以總量守恆
export const STEAM_EXPANSION = 4;

// 格子水與蒸氣：每一格存水量與蒸氣量（各 0～1）。
// 水依「該格當下的重力方向」往下流、往兩側攤平；蒸氣方向相反，往上飄並且會慢慢凝結回水。
// 所以兩者都會受反重力、定向重力影響；無重力時停在原地；時停時凍結（時停的水可以站）。
// 也負責溫度：光線、火爐、熔岩讓冰融化、讓水沸騰；冷凍裝置讓水結冰、讓蒸氣凝結
export class WaterSystem {
  constructor(map) {
    this.map = map;
    this.amount = new Float32Array(COLS * ROWS);
    this.steam = new Float32Array(COLS * ROWS);
    this.cold = new Float32Array(COLS * ROWS);  // 結冰進度
    this.heat = new Float32Array(COLS * ROWS);  // 冰牆格的融化進度
    this.boil = new Float32Array(COLS * ROWS);  // 水格的沸騰進度
    this.dew = new Float32Array(COLS * ROWS);   // 凝結出來、還沒釋放的水（太少的水不能流動，先累積起來）
    this.frozen = new Set();                    // 被時停的水格（實心）
    this.flip = false;
    this.lava = [];
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) if (map.get(tx, ty) === 'Z') this.lava.push({ tx, ty });
    }
  }

  idx(tx, ty) {
    return ty * COLS + tx;
  }

  inBounds(tx, ty) {
    return tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS;
  }

  // 水和蒸氣都進不去的格子：實心地形與熔岩
  blocked(tx, ty) {
    return this.map.isSolid(tx, ty) || this.map.get(tx, ty) === 'Z';
  }

  get(tx, ty) {
    return this.inBounds(tx, ty) ? this.amount[this.idx(tx, ty)] : 0;
  }

  steamAt(tx, ty) {
    return this.inBounds(tx, ty) ? this.steam[this.idx(tx, ty)] : 0;
  }

  pointSteam(x, y) {
    return this.steamAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // 矩形範圍內的蒸氣總量
  steamInRect(x, y, w, h) {
    let sum = 0;
    const tx0 = Math.floor(x / TILE);
    const ty0 = Math.floor(y / TILE);
    const tx1 = Math.floor((x + w - 0.001) / TILE);
    const ty1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) sum += this.steamAt(tx, ty);
    return sum;
  }

  // 除錯用：在某一格加入蒸氣
  addSteam(tx, ty, s) {
    if (this.inBounds(tx, ty) && !this.blocked(tx, ty)) this.steam[this.idx(tx, ty)] = Math.min(1, this.steam[this.idx(tx, ty)] + s);
  }

  add(tx, ty, a) {
    if (this.inBounds(tx, ty) && !this.blocked(tx, ty)) this.amount[this.idx(tx, ty)] += a;
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
  // 被時停的水格中，真正有水的那一部分（水從格子底部往上填；上方也有水時整格）
  frozenRect(tx, ty) {
    const a = this.get(tx, ty);
    const full = a >= 0.99 || this.get(tx, ty - 1) > 0.01;
    const h = full ? TILE : Math.max(2, a * TILE);
    return { x: tx * TILE, y: ty * TILE + TILE - h, w: TILE, h };
  }

  // 矩形是否碰到被時停的水（實心，只有有水的那一部分）。self 目前已經泡在裡面的部分不算，避免被封在水裡出不來
  frozenOverlap(x, y, w, h, self) {
    if (!this.frozen.size) return false;
    const hit = (r, a) => a.x < r.x + r.w && a.x + a.w > r.x && a.y < r.y + r.h && a.y + a.h > r.y;
    return this.map.anyTileInRect(x, y, w, h, (tx, ty) => {
      if (!this.frozen.has(this.idx(tx, ty))) return false;
      const r = this.frozenRect(tx, ty);
      if (!hit(r, { x, y, w, h })) return false;
      return !(self && hit(r, self));
    });
  }

  // 依場域取得這一格的「下方」方向；無重力時回傳 null
  downAt(m) {
    const ax = Math.abs(m.gx);
    const ay = Math.abs(m.gy);
    if (Math.max(ax, ay) < 1) return null;
    return ay >= ax ? { x: 0, y: Math.sign(m.gy) } : { x: Math.sign(m.gx), y: 0 };
  }

  update(world, dt) {
    this.frozen.clear();
    this.flip = !this.flip;
    this.coolers = world.entities.filter((e) => e.isCooler && e.alive);
    this.updateWater(world);
    this.updateSteam(world, dt);
    this.updateTemperature(world, dt);
  }

  updateWater(world) {
    const A = this.amount;
    // 由下往上處理（正常重力時，水一步只會往下流一格）
    for (let ty = ROWS - 1; ty >= 0; ty--) {
      for (let k = 0; k < COLS; k++) {
        const tx = this.flip ? k : COLS - 1 - k;
        const i = this.idx(tx, ty);
        let a = A[i];
        if (a < 0.002) { this.dew[i] += a; A[i] = 0; continue; } // 太少的水先存起來，不直接清掉
        if (this.blocked(tx, ty)) { A[i] = 0; continue; }

        const m = world.fields.sample(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
        if (m.time < 0.05) {
          this.frozen.add(i); // 不管多少水都凍結（原本只凍半格以上，水面最上層會像破了洞）
          continue;
        }
        const down = this.downAt(m);
        if (!down) continue; // 無重力：水停在原地
        const rate = Math.min(1, m.time);

        a -= this.flowInto(world, A, tx + down.x, ty + down.y, down, a * rate);
        if (a > 0.002) a -= this.spread(world, A, tx, ty, down, a, 3, rate);
        A[i] = a;
      }
    }
  }

  updateSteam(world, dt) {
    const S = this.steam;
    const A = this.amount;
    // 由上往下處理（正常重力時，蒸氣一步只會往上飄一格）
    for (let ty = 0; ty < ROWS; ty++) {
      for (let k = 0; k < COLS; k++) {
        const tx = this.flip ? k : COLS - 1 - k;
        const i = this.idx(tx, ty);
        let s = S[i];
        if (s <= 0) continue;
        if (s < 0.0003) { this.dew[i] += s / STEAM_EXPANSION; S[i] = 0; this.releaseDew(i); continue; } // 太稀的蒸氣直接凝結
        if (this.blocked(tx, ty)) { S[i] = 0; continue; }

        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        const m = world.fields.sample(cx, cy);
        if (m.time < 0.05) continue; // 時停：蒸氣凍結在原地
        const rate = Math.min(1, m.time);

        // 凝結回水：冷凍裝置附近凝結得很快；碰到天花板（往上那一格被擋住）也凝結得比較快，
        // 否則蒸氣會一直聚積在天花板下方（例如蒸氣浮台到頂後，火爐熄了也下不來）
        const chilled = this.coolers.some((c) => Math.hypot(cx - c.cx, cy - c.cy) <= cfg.coldRadius);
        const dn = this.downAt(m);
        const capped = dn && (!this.inBounds(tx - dn.x, ty - dn.y) || this.blocked(tx - dn.x, ty - dn.y));
        const rateC = chilled ? 4 : capped ? cfg.steamCondense * 6 : cfg.steamCondense;
        const c = s * Math.min(1, rateC * dt * rate);
        s -= c;
        this.dew[i] += c / STEAM_EXPANSION;
        this.releaseDew(i);

        const down = this.downAt(m);
        if (down) {
          const up = { x: -down.x, y: -down.y };
          s -= this.flowInto(world, S, tx + up.x, ty + up.y, up, s * cfg.steamRise * rate);
          if (s > 0.002) s -= this.spread(world, S, tx, ty, up, s, cfg.steamSpread, rate);
          if (s > 0.01) s -= this.wander(tx, ty, up, s * cfg.steamWander * Math.random() * rate);
        }
        S[i] = s;
      }
    }
  }

  // 蒸氣隨機往左或右飄一點（重力朝側面時改成上下），讓蒸氣看起來在翻騰，往上的淨速度也會變慢
  wander(tx, ty, up, amount) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const nx = tx + (up.x === 0 ? side : 0);
    const ny = ty + (up.x === 0 ? 0 : side);
    if (!this.inBounds(nx, ny) || this.blocked(nx, ny)) return 0;
    const j = this.idx(nx, ny);
    const f = Math.min(amount, Math.max(0, 1 - this.steam[j]));
    this.steam[j] += f;
    return f;
  }

  // 凝結的水累積到一定量才變成水格裡的水（否則一點點的水會被當成空格清掉，水就不見了）
  releaseDew(i) {
    if (this.dew[i] < 0.05) return;
    this.amount[i] += this.dew[i];
    this.dew[i] = 0;
  }

  // 往兩側攤平（對水是左右；重力朝側面時是上下）。側面牆上有朝向自己的傳送門時，也會流進去
  spread(world, arr, tx, ty, dir, a, divisor, rate) {
    const sides = dir.x === 0 ? [{ x: -1, y: 0 }, { x: 1, y: 0 }] : [{ x: 0, y: -1 }, { x: 0, y: 1 }];
    let moved = 0;
    for (const s of sides) {
      const sx = tx + s.x;
      const sy = ty + s.y;
      if (!this.inBounds(sx, sy)) continue;
      if (this.blocked(sx, sy)) {
        moved += this.flowInto(world, arr, sx, sy, s, (a / divisor) * rate);
        continue;
      }
      const other = arr[this.idx(sx, sy)];
      if (other >= a) continue;
      const f = ((a - other) / divisor) * rate;
      arr[this.idx(sx, sy)] += f;
      moved += f;
    }
    return moved;
  }

  // 把最多 amount 的水（或蒸氣）移到 (tx, ty)；如果那裡是傳送門，就從另一個門流出。回傳實際移動的量
  flowInto(world, arr, tx, ty, dir, amount) {
    if (!this.inBounds(tx, ty)) return 0; // 畫面邊緣是牆（否則坑底的水會從尖刺下方流光）
    if (!this.blocked(tx, ty)) {
      const j = this.idx(tx, ty);
      const f = Math.min(amount, Math.max(0, 1 - arr[j]));
      arr[j] += f;
      return f;
    }
    // 傳送門：門面朝向流動的反方向時，從出口前方的兩格流出
    const portals = world.portals;
    if (!portals.active) return 0;
    const p = portals.list.find((q) => q.keys.has(`${tx},${ty}`) && q.nx === -dir.x && q.ny === -dir.y);
    if (!p) return 0;
    const out = portals.partner(p);
    let moved = 0;
    for (const t of out.tiles) {
      const ox = t.tx + out.nx;
      const oy = t.ty + out.ny;
      if (!this.inBounds(ox, oy) || this.blocked(ox, oy)) continue;
      const j = this.idx(ox, oy);
      const f = Math.min((amount - moved) / 2 + 0.0001, Math.max(0, 1 - arr[j]), amount - moved);
      arr[j] += f;
      moved += f;
    }
    return moved;
  }

  updateTemperature(world, dt) {
    const A = this.amount;
    const heaters = world.entities.filter((e) => e.isHeater && e.on && e.alive);
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const i = this.idx(tx, ty);
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        const near = (list, r) => list.some((c) => Math.hypot(cx - c.cx, cy - c.cy) <= r);

        // 火爐：範圍內的水沸騰、冰融化
        if (heaters.length && near(heaters, cfg.heatRadius)) {
          if (A[i] > 0.01) this.heatWater(tx, ty, dt);
          if (this.map.get(tx, ty) === 'I') this.heatTile(world, tx, ty, dt);
        }

        // 冷凍裝置：範圍內的水慢慢結成冰牆格（有東西在那一格時不結冰）
        const chilled = A[i] >= 0.5 && near(this.coolers, cfg.coldRadius);
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

    // 熔岩：相鄰的水快速沸騰、相鄰的冰融化
    for (const { tx, ty } of this.lava) {
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (this.get(nx, ny) > 0.01) this.heatWater(nx, ny, dt, 3);
        if (this.map.get(nx, ny) === 'I') this.heatTile(world, nx, ny, dt);
      }
    }

    // 沒有被加熱的冰和水會慢慢降溫
    for (let i = 0; i < this.heat.length; i++) {
      if (this.heat[i] > 0) this.heat[i] = Math.max(0, this.heat[i] - dt * 0.5);
      if (this.boil[i] > 0) this.boil[i] = Math.max(0, this.boil[i] - dt * 0.5);
    }
  }

  // 加熱水格：累積到沸點後，持續把水變成蒸氣。power：加熱強度（熔岩較強）
  heatWater(tx, ty, dt, power = 1) {
    const i = this.idx(tx, ty);
    this.boil[i] = Math.min(cfg.boilTime, this.boil[i] + dt * 1.5 * power);
    if (this.boil[i] < cfg.boilTime) return;
    const f = Math.min(this.amount[i], cfg.boilRate * dt * power);
    this.amount[i] -= f;
    this.steam[i] += f * STEAM_EXPANSION;
  }

  // 光線、火爐、熔岩照到冰牆格時呼叫
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
