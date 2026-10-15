// Noita 風像素水（實驗版本）
// 落沙模擬（falling sand）：畫面切成 2×2 px 的小格，每格裝一種材質（空、水、蒸氣），
// 每一幀依簡單的規則移動：水往下 → 斜下 → 往兩側散開；蒸氣往上飄、會左右飄動並慢慢凝結回水。
// 每一幀再換算回「每個 16 px 大格有多少水、多少蒸氣」，所以浮力、游泳、折射、結冰、
// 傳送門、蒸氣浮台、渦輪等原本的系統都可以直接沿用。
import { cfg, TILE, COLS, ROWS } from '../../js/config.js';
import { WaterSystem, STEAM_EXPANSION } from '../../js/water.js';

const FS = 2;                 // 小格的大小（px）
const PER = TILE / FS;        // 一個大格的邊長 = 8 個小格
const FW = COLS * PER;
const FH = ROWS * PER;
const CELLS_PER_TILE = PER * PER; // 一整格水 = 64 個水像素
const EMPTY = 0;
const WATER = 1;
const STEAM = 2;
const LAVA = 3;

export const params = {
  DISPERSE: 4,      // 水被擋住時，一幀最多往旁邊散開幾格（越大水面攤平得越快）
  STEAM_RISE: 0.4,  // 蒸氣每一幀往上飄的機率（約每秒 3 格大格）
  LAVA_RATE: 0.4,   // 熔岩每一幀移動的機率（很黏，流得慢）
};

export class PixelWaterSystem extends WaterSystem {
  constructor(map) {
    super(map);
    this.mat = new Uint8Array(FW * FH);
    this.stamp = new Uint16Array(FW * FH); // 這一幀已經移動過的小格，避免同一幀被處理兩次
    this.mask = new Uint8Array(FW * FH);   // 實心（牆、熔岩、實心物件）
    this.noise = new Uint8Array(FW * FH);  // 每個像素固定的深淺變化
    for (let i = 0; i < this.noise.length; i++) this.noise[i] = ((i * 2654435761) >>> 24) & 0xff;
    this.frame = 0;
    this.tDown = new Int8Array(COLS * ROWS * 2);
    this.tTime = new Float32Array(COLS * ROWS);
    this.tCold = new Uint8Array(COLS * ROWS);
    this.convertFrac = new Float32Array(COLS * ROWS);
    this.drawsSteam = true;
    this.drawsLava = true;
    // 地圖上的熔岩（父類別已經轉成熔岩量）變成熔岩像素
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      if (this.lava[this.idx(tx, ty)] > 0) this.fillTile(tx, ty, LAVA, Math.round(this.lava[this.idx(tx, ty)] * CELLS_PER_TILE));
    }
  }

  pointInLava(x, y) {
    const fx = Math.floor(x / FS);
    const fy = Math.floor(y / FS);
    if (fx < 0 || fx >= FW || fy < 0 || fy >= FH) return false;
    return this.mat[this.fi(fx, fy)] === LAVA;
  }

  fi(fx, fy) { return fy * FW + fx; }

  // ---- 給其他系統用的介面 ----

  // 水像素的精確判定（比格子水準確：浮力、游泳、折射都用這個）
  pointInWater(x, y) {
    const fx = Math.floor(x / FS);
    const fy = Math.floor(y / FS);
    if (fx < 0 || fx >= FW || fy < 0 || fy >= FH) return false;
    return this.mat[this.fi(fx, fy)] === WATER;
  }

  // 在某個大格裡放入水（由下往上填空格）。被物件佔住的位置也會放（例如冰塊在原地融化），下一幀再被擠到旁邊
  fillTile(tx, ty, material, count) {
    let placed = 0;
    for (let y = PER - 1; y >= 0 && placed < count; y--) {
      for (let x = 0; x < PER && placed < count; x++) {
        const i = this.fi(tx * PER + x, ty * PER + y);
        if (this.mat[i] === EMPTY) { this.mat[i] = material; placed++; }
      }
    }
    return placed;
  }

  // 泡水比例：實心物件會把水擠開，所以物件內部沒有水像素；改看物件兩側外面同一高度有沒有水
  submersion(b) {
    let n = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = b.x + (b.w * (i + 0.5)) / 3;
        const y = b.y + (b.h * (j + 0.5)) / 3;
        if (this.pointInWater(x, y) || (b.solid && (this.pointInWater(b.x - 2, y) || this.pointInWater(b.x + b.w + 2, y)))) n++;
      }
    }
    return n / 9;
  }

  add(tx, ty, a) {
    if (!this.inBounds(tx, ty) || this.blocked(tx, ty)) return;
    const t = this.idx(tx, ty);
    this.convertFrac[t] += a * CELLS_PER_TILE;
    const n = Math.floor(this.convertFrac[t]);
    this.convertFrac[t] -= n;
    this.fillTile(tx, ty, WATER, n);
    this.amount[t] += n / CELLS_PER_TILE;
  }

  addSteam(tx, ty, s) {
    if (!this.inBounds(tx, ty) || this.blocked(tx, ty)) return;
    const placed = this.fillTile(tx, ty, STEAM, Math.round((s * CELLS_PER_TILE) / STEAM_EXPANSION));
    this.steam[this.idx(tx, ty)] += (placed * STEAM_EXPANSION) / CELLS_PER_TILE; // 立刻反映到這一格的蒸氣量
  }

  // 加熱水：累積到沸點後，把這一格裡最上面的水像素變成蒸氣
  heatWater(tx, ty, dt, power = 1) {
    const t = this.idx(tx, ty);
    this.boil[t] = Math.min(cfg.boilTime, this.boil[t] + dt * 1.5 * power);
    if (this.boil[t] < cfg.boilTime) return;
    this.convertFrac[t] += cfg.boilRate * dt * power * CELLS_PER_TILE;
    let n = Math.floor(this.convertFrac[t]);
    this.convertFrac[t] -= n;
    for (let y = 0; y < PER && n > 0; y++) {
      for (let x = 0; x < PER && n > 0; x++) {
        const i = this.fi(tx * PER + x, ty * PER + y);
        if (this.mat[i] === WATER) { this.mat[i] = STEAM; n--; }
      }
    }
  }

  // 冰融化：整格變成水
  heatTile(world, tx, ty, dt) {
    const t = this.idx(tx, ty);
    this.heat[t] += dt * 1.5;
    if (this.heat[t] < cfg.meltTime) return;
    this.heat[t] = 0;
    this.map.set(tx, ty, ' ');
    for (let y = 0; y < PER; y++) for (let x = 0; x < PER; x++) this.mask[this.fi(tx * PER + x, ty * PER + y)] = 0;
    this.fillTile(tx, ty, WATER, CELLS_PER_TILE);
    this.amount[t] = 1;
    world.burst(tx * TILE + 8, ty * TILE + 8, '#9fd8ff', 10);
  }

  // ---- 每一幀 ----

  update(world, dt) {
    this.frame = (this.frame + 1) & 0xffff || 1;
    this.flip = !this.flip;
    this.coolers = world.entities.filter((e) => e.isCooler && e.alive);
    this.prepareTiles(world);
    this.buildMask(world);
    this.displace();
    this.simulate(world, dt);
    this.derive();
    this.reactPixels(world);
    // 溫度沿用原版（火爐、熔岩、冷凍裝置）；結冰或凝固成石頭的格子要清掉裡面的像素
    super.updateTemperature(world, dt);
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const c = this.map.get(tx, ty);
        if (c !== 'I' && c !== 'Q') continue;
        for (let y = 0; y < PER; y++) for (let x = 0; x < PER; x++) this.mat[this.fi(tx * PER + x, ty * PER + y)] = EMPTY;
      }
    }
    this.derive();
  }

  // 每個大格取樣一次場域：重力方向、時間倍率、是否在冷凍裝置附近
  prepareTiles(world) {
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const t = this.idx(tx, ty);
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        const m = world.fields.sample(cx, cy);
        const d = this.downAt(m);
        this.tDown[t * 2] = d ? d.x : 0;
        this.tDown[t * 2 + 1] = d ? d.y : 0;
        this.tTime[t] = m.time;
        this.tCold[t] = this.coolers.some((c) => Math.hypot(cx - c.cx, cy - c.cy) <= cfg.coldRadius) ? 1 : 0;
      }
    }
  }

  buildMask(world) {
    this.mask.fill(0);
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        if (!this.blocked(tx, ty)) continue;
        for (let y = 0; y < PER; y++) this.mask.fill(1, this.fi(tx * PER, ty * PER + y), this.fi(tx * PER + PER, ty * PER + y));
      }
    }
    for (const e of world.entities) {
      if (!e.solid || !e.alive || e.isBullet) continue;
      const x0 = Math.max(0, Math.floor(e.x / FS));
      const x1 = Math.min(FW, Math.ceil((e.x + e.w) / FS));
      const y0 = Math.max(0, Math.floor(e.y / FS));
      const y1 = Math.min(FH, Math.ceil((e.y + e.h) / FS));
      for (let y = y0; y < y1; y++) if (x1 > x0) this.mask.fill(1, this.fi(x0, y), this.fi(x1, y));
    }
  }

  // 物件移動進水裡時，把被蓋住的水像素擠到上方（或旁邊）的空位
  displace() {
    for (let fy = 0; fy < FH; fy++) {
      for (let fx = 0; fx < FW; fx++) {
        const i = this.fi(fx, fy);
        if (!this.mat[i] || !this.mask[i]) continue;
        const t = this.idx(fx >> 3, fy >> 3);
        const ux = -this.tDown[t * 2] || 0;
        const uy = -this.tDown[t * 2 + 1] || -1;
        let moved = false;
        for (let k = 1; k <= 12 && !moved; k++) {
          for (const [ox, oy] of [[ux * k, uy * k], [k, 0], [-k, 0]]) {
            const nx = fx + ox;
            const ny = fy + oy;
            if (nx < 0 || nx >= FW || ny < 0 || ny >= FH) continue;
            const j = this.fi(nx, ny);
            if (this.mat[j] === EMPTY && !this.mask[j]) { this.mat[j] = this.mat[i]; this.mat[i] = EMPTY; moved = true; break; }
          }
        }
      }
    }
  }

  // 嘗試移動到 (nx, ny)。牆上有朝向這個方向的傳送門時，從另一個門出來
  tryMove(world, fx, fy, nx, ny, m) {
    if (nx < 0 || nx >= FW || ny < 0 || ny >= FH) return false;
    let j = this.fi(nx, ny);
    if (this.mask[j]) {
      if (!world.portals.active) return false;
      const cross = world.portals.crossSegment(fx * FS + 1, fy * FS + 1, nx * FS + 1, ny * FS + 1);
      if (!cross) return false;
      const ex = Math.floor(cross.x / FS);
      const ey = Math.floor(cross.y / FS);
      if (ex < 0 || ex >= FW || ey < 0 || ey >= FH) return false;
      j = this.fi(ex, ey);
      if (this.mask[j] || this.mat[j] !== EMPTY) return false;
    }
    const i = this.fi(fx, fy);
    const other = this.mat[j];
    // 重的往下沉：水會和蒸氣交換位置，熔岩會和水、蒸氣交換位置
    if (other === EMPTY || (m === WATER && other === STEAM) || (m === LAVA && (other === WATER || other === STEAM))) {
      this.mat[j] = m;
      this.mat[i] = other; // 水比蒸氣重：和蒸氣交換位置
      this.stamp[j] = this.frame;
      return true;
    }
    return false;
  }

  simulate(world, dt) {
    const P = params;
    for (let fy = FH - 1; fy >= 0; fy--) {
      for (let k = 0; k < FW; k++) {
        const fx = this.flip ? k : FW - 1 - k;
        const i = this.fi(fx, fy);
        const m = this.mat[i];
        if (m === EMPTY || this.stamp[i] === this.frame) continue;
        const t = this.idx(fx >> 3, fy >> 3);
        const time = this.tTime[t];
        if (time < 0.05) continue;                      // 時停：凍結
        if (time < 1 && Math.random() > time) continue;  // 慢動作：有機率不動
        const dx = this.tDown[t * 2];
        const dy = this.tDown[t * 2 + 1];
        if (m === STEAM && this.condense(t, fx, fy, -dx, -dy, dt)) { this.mat[i] = WATER; continue; }
        if (dx === 0 && dy === 0) continue;             // 無重力：停在原地
        const sx = dy !== 0 ? 1 : 0;                    // 兩側的方向
        const sy = dy !== 0 ? 0 : 1;
        const r = Math.random() < 0.5 ? 1 : -1;

        if (m === LAVA) {
          if (Math.random() > P.LAVA_RATE) continue;
          if (this.tryMove(world, fx, fy, fx + dx, fy + dy, m)) continue;
          if (this.tryMove(world, fx, fy, fx + dx + sx * r, fy + dy + sy * r, m)) continue;
          if (Math.random() < 0.5) this.tryMove(world, fx, fy, fx + sx * r, fy + sy * r, m);
          continue;
        }
        if (m === WATER) {
          if (this.tryMove(world, fx, fy, fx + dx, fy + dy, m)) continue;
          if (this.tryMove(world, fx, fy, fx + dx + sx * r, fy + dy + sy * r, m)) continue;
          if (this.tryMove(world, fx, fy, fx + dx - sx * r, fy + dy - sy * r, m)) continue;
          // 散開：往一側找最遠的空格（一幀最多 DISPERSE 格）
          for (const dir of [r, -r]) {
            let best = 0;
            for (let s = 1; s <= P.DISPERSE; s++) {
              const nx = fx + sx * dir * s;
              const ny = fy + sy * dir * s;
              if (nx < 0 || nx >= FW || ny < 0 || ny >= FH) break;
              const j = this.fi(nx, ny);
              if (this.mask[j] || this.mat[j] === WATER) break;
              if (this.mat[j] === EMPTY) best = s;
            }
            if (best && this.tryMove(world, fx, fy, fx + sx * dir * best, fy + sy * dir * best, m)) break;
          }
        } else {
          const ux = -dx;
          const uy = -dy;
          if (Math.random() < P.STEAM_RISE) {
            if (this.tryMove(world, fx, fy, fx + ux, fy + uy, m)) continue;
            if (this.tryMove(world, fx, fy, fx + ux + sx * r, fy + uy + sy * r, m)) continue;
          }
          // 隨機往兩側飄
          if (Math.random() < 0.3 + cfg.steamWander) this.tryMove(world, fx, fy, fx + sx * r, fy + sy * r, m);
        }
      }
    }
  }

  // 蒸氣凝結回水的機率：冷凍裝置附近很快；碰到天花板時較快
  condense(t, fx, fy, ux, uy, dt) {
    let rate = cfg.steamCondense;
    if (this.tCold[t]) rate = 4;
    else {
      const nx = fx + ux;
      const ny = fy + uy;
      const capped = nx < 0 || nx >= FW || ny < 0 || ny >= FH || this.mask[this.fi(nx, ny)];
      if (capped) rate *= 6;
    }
    return Math.random() < rate * dt;
  }

  // 熔岩碰到水：熔岩夠多的格子凝固成石頭，裡面的水變成蒸氣冒到上方；熔岩太少時只把碰到的水煮成蒸氣
  reactPixels(world) {
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const t = this.idx(tx, ty);
        if (this.lava[t] <= 0.02 || this.frozenLava.has(t)) continue;
        // 水比熔岩輕，會浮在熔岩上（在上方那一格），所以上方那一格有水也算碰到
        const ux = -this.tDown[t * 2] || 0;
        const uy = -this.tDown[t * 2 + 1] || -1;
        const above = this.inBounds(tx + ux, ty + uy) ? this.amount[this.idx(tx + ux, ty + uy)] : 0;
        if (this.amount[t] <= 0.02 && above <= 0.05) continue;
        const waterPx = Math.round(this.amount[t] * CELLS_PER_TILE);
        if (this.lava[t] >= 0.3 && !this.occupied(world, tx, ty)) {
          for (let y = 0; y < PER; y++) for (let x = 0; x < PER; x++) this.mat[this.fi(tx * PER + x, ty * PER + y)] = EMPTY;
          this.map.set(tx, ty, 'Q');
          if (ty > 0 && !this.blocked(tx, ty - 1)) this.fillTile(tx, ty - 1, STEAM, waterPx);
          // 浮在熔岩上方的水被煮成蒸氣
          const ax = tx + ux;
          const ay = ty + uy;
          if (this.inBounds(ax, ay)) {
            for (let y = 0; y < PER; y++) for (let x = 0; x < PER; x++) {
              const i = this.fi(ax * PER + x, ay * PER + y);
              if (this.mat[i] === WATER) this.mat[i] = STEAM;
            }
          }
          world.burst(tx * TILE + 8, ty * TILE + 8, '#bbbbbb', 12);
        } else {
          for (let y = 0; y < PER; y++) for (let x = 0; x < PER; x++) {
            const i = this.fi(tx * PER + x, ty * PER + y);
            if (this.mat[i] === WATER) this.mat[i] = STEAM;
            else if (this.mat[i] === LAVA) this.mat[i] = EMPTY;
          }
        }
      }
    }
    this.derive();
  }

  // 換算回每個大格的水量與蒸氣量；被時停的水格標記為實心
  derive() {
    this.amount.fill(0);
    this.steam.fill(0);
    this.lava.fill(0);
    this.frozen.clear();
    this.frozenLava.clear();
    for (let fy = 0; fy < FH; fy++) {
      const ty = fy >> 3;
      for (let fx = 0; fx < FW; fx++) {
        const m = this.mat[this.fi(fx, fy)];
        if (!m) continue;
        const t = ty * COLS + (fx >> 3);
        if (m === WATER) this.amount[t] += 1 / CELLS_PER_TILE;
        else if (m === LAVA) this.lava[t] += 1 / CELLS_PER_TILE;
        else this.steam[t] += STEAM_EXPANSION / CELLS_PER_TILE;
      }
    }
    for (let t = 0; t < this.amount.length; t++) {
      if (this.tTime[t] >= 0.05) continue;
      if (this.amount[t] > 0) this.frozen.add(t);
      if (this.lava[t] > 0) this.frozenLava.add(t);
    }
  }

  // ---- 畫面：直接輸出像素 ----

  ensureCanvas() {
    if (this.canvas) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = FW;
    this.canvas.height = FH;
    this.cctx = this.canvas.getContext('2d');
    this.waterImg = this.cctx.createImageData(FW, FH);
    this.steamCanvas = document.createElement('canvas');
    this.steamCanvas.width = FW;
    this.steamCanvas.height = FH;
    this.sctx = this.steamCanvas.getContext('2d');
    this.steamImg = this.sctx.createImageData(FW, FH);
  }

  draw(ctx, world) {
    this.ensureCanvas();
    const W = this.waterImg.data;
    const S = this.steamImg.data;
    W.fill(0);
    S.fill(0);
    const shimmer = Math.floor(world.time * 6);
    for (let fy = 0; fy < FH; fy++) {
      for (let fx = 0; fx < FW; fx++) {
        const i = this.fi(fx, fy);
        const m = this.mat[i];
        if (!m) continue;
        const o = i * 4;
        const n = this.noise[i];
        const t = this.idx(fx >> 3, fy >> 3);
        if (m === WATER) {
          const ux = -this.tDown[t * 2] || 0;
          const uy = -this.tDown[t * 2 + 1] || -1;
          const ax = fx + ux;
          const ay = fy + uy;
          const surface = ax >= 0 && ax < FW && ay >= 0 && ay < FH && this.mat[this.fi(ax, ay)] !== WATER && !this.mask[this.fi(ax, ay)];
          const v = (n >> 4) - 8;
          if (this.tTime[t] < 0.05) { W[o] = 150 + v; W[o + 1] = 215 + v; W[o + 2] = 250; W[o + 3] = 220; }
          else if (surface) { W[o] = 110 + v; W[o + 1] = 175 + v; W[o + 2] = 245; W[o + 3] = 235; }
          else { W[o] = 38 + v; W[o + 1] = 105 + v + ((n + shimmer) % 16 === 0 ? 20 : 0); W[o + 2] = 215 + v; W[o + 3] = 210; }
        } else if (m === LAVA) {
          const v = (n >> 4) - 8;
          const ux = -this.tDown[t * 2] || 0;
          const uy = -this.tDown[t * 2 + 1] || -1;
          const ax = fx + ux;
          const ay = fy + uy;
          const surface = ax >= 0 && ax < FW && ay >= 0 && ay < FH && this.mat[this.fi(ax, ay)] !== LAVA && !this.mask[this.fi(ax, ay)];
          if (this.tTime[t] < 0.05) { W[o] = 110 + v; W[o + 1] = 45; W[o + 2] = 30; W[o + 3] = 255; }
          else if (surface) { W[o] = 255; W[o + 1] = 150 + v; W[o + 2] = 60; W[o + 3] = 255; }
          else { W[o] = 200 + v; W[o + 1] = 55 + v + ((n + shimmer * 3) % 23 === 0 ? 60 : 0); W[o + 2] = 25; W[o + 3] = 255; }
        } else {
          const v = (n >> 5);
          S[o] = 225 + v; S[o + 1] = 230 + v; S[o + 2] = 240; S[o + 3] = 90 + ((n + shimmer * 7) & 63);
        }
      }
    }
    this.cctx.putImageData(this.waterImg, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, FW * FS, FH * FS);
    return true; // 取代原本的格子水畫法
  }

  // 蒸氣畫在角色前面（和原版一樣）
  drawSteamLayer(ctx) {
    this.sctx.putImageData(this.steamImg, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.steamCanvas, 0, 0, FW * FS, FH * FS);
  }
}

export function createWater(map) {
  return new PixelWaterSystem(map);
}
