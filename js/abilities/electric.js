import { cfg, TILE, COLS, ROWS } from '../config.js';

// 電力：每一幀從電源（開著的發電機、通電場）出發，沿著相連的導體擴散。
// 地形與物體的種類：
//   包覆導線（'-'）：只和導線、裸露金屬、接頭、電器相連；不會把電傳給碰到它的東西，也不會電人（安全）
//   裸露金屬（'+'）、接頭（'*'）：和任何相鄰的導體相連（水、鐵塊、金屬敵人……）；通電時碰到它的人和敵人會被電
//   水（≥ 0.3 格）：導電；泡在通電的水裡會被電
//   電器（發電機、電磁鐵、通電門的開關）：和任何相鄰的導體相連
//   鐵塊與金屬敵人：碰到裸露金屬、接頭、水、電器或其他金屬物體就相連；通電的金屬敵人被電，通電的鐵塊碰到也會被電
// 不導電：冰、木箱、石頭、一般的牆、空氣；反射場的邊界也擋住電（兩格中間隔著邊界就不相連）
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
const CABLE = 1;
const BARE = 2;
const WATER = 3;
const DEVICE = 4;

export const ElectricAbility = {
  isPowered(tx, ty) {
    if (!this.energized || tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    return this.energized[ty * COLS + tx] === 1;
  },

  // 物體佔的格子（往外多 1 px，碰到就算）
  tilesOf(e) {
    const out = [];
    const tx0 = Math.max(0, Math.floor((e.x - 1) / TILE));
    const tx1 = Math.min(COLS - 1, Math.floor((e.x + e.w + 1) / TILE));
    const ty0 = Math.max(0, Math.floor((e.y - 1) / TILE));
    const ty1 = Math.min(ROWS - 1, Math.floor((e.y + e.h + 1) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) out.push(ty * COLS + tx);
    return out;
  },

  // 每一格的導電種類（0 = 不導電）
  conductorKinds() {
    const N = COLS * ROWS;
    const kind = new Uint8Array(N);
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const i = ty * COLS + tx;
      const c = this.map.get(tx, ty);
      if (c === '-' || c === '>' || c === '<') kind[i] = CABLE;
      else if (c === '+' || c === '*') kind[i] = BARE;
      else if (this.water.amount[i] >= 0.3 && c !== 'I') kind[i] = WATER;
    }
    for (const s of this.switches) if (s.kind === 'power') kind[s.ty * COLS + s.tx] = DEVICE;
    for (const e of this.entities) if ((e.isGenerator || e.isElectromagnet || e.isTurbine) && e.alive) kind[e.ty * COLS + e.tx] = DEVICE;
    return kind;
  },

  updateElectric(dt) {
    const N = COLS * ROWS;
    const kind = this.conductorKinds();
    const metals = this.entities.filter((e) => e.alive && e.isMetal && e.isBody);
    const bodyTiles = metals.map((m) => this.tilesOf(m));
    const energ = new Uint8Array(N);
    const bodyOn = new Uint8Array(metals.length);
    const queue = []; // 格子：i；金屬物體：N + 編號
    const seedTile = (i) => { if (kind[i] && !energ[i]) { energ[i] = 1; queue.push(i); } };
    const seedBody = (b) => { if (!bodyOn[b]) { bodyOn[b] = 1; queue.push(N + b); } };

    // 電源
    for (const g of this.entities) if (g.isGenerator && g.on && g.alive) seedTile(g.ty * COLS + g.tx);
    for (const t of this.entities) if (t.isTurbine && t.generating && t.alive) seedTile(t.ty * COLS + t.tx);
    const shocks = this.fields.list.filter((fl) => fl.skill.type === 'shock' && !this.fields.jammedAt(fl.x, fl.y, 'electric'));
    for (const fl of shocks) {
      for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
        if (Math.hypot(tx * TILE + TILE / 2 - fl.x, ty * TILE + TILE / 2 - fl.y) <= fl.r + TILE / 2) seedTile(ty * COLS + tx);
      }
      metals.forEach((m, b) => { if (Math.hypot(m.cx - fl.x, m.cy - fl.y) <= fl.r + Math.max(m.w, m.h) / 2) seedBody(b); });
    }

    // 擴散
    const reflects = this.fields.list.some((fl) => fl.skill.type === 'reflectField');
    const linked = (a, b) => (a === CABLE ? b !== WATER : b === CABLE ? a !== WATER : true); // 導線不接水
    while (queue.length) {
      const n = queue.pop();
      if (n >= N) {
        // 金屬物體：接上碰到的裸露金屬、接頭、水、電器（不接導線），以及碰到的其他金屬物體
        const b = n - N;
        for (const i of bodyTiles[b]) if (kind[i] && kind[i] !== CABLE) seedTile(i);
        metals.forEach((m, k) => { if (k !== b && !bodyOn[k] && this.overlap(this.grow(metals[b]), m)) seedBody(k); });
        continue;
      }
      const tx = n % COLS;
      const ty = (n / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny * COLS + nx;
        if (!kind[j] || energ[j] || !linked(kind[n], kind[j])) continue;
        if (reflects && this.reflectCross(tx * TILE + 8, ty * TILE + 8, nx * TILE + 8, ny * TILE + 8)) continue;
        energ[j] = 1;
        queue.push(j);
      }
      // 這一格碰到的金屬物體（導線不接）
      if (kind[n] !== CABLE) bodyTiles.forEach((tiles, b) => { if (!bodyOn[b] && tiles.includes(n)) seedBody(b); });
    }
    this.energized = energ;
    this.conductor = kind;
    this.energizedBodies = new Set(metals.filter((_, b) => bodyOn[b]));

    // 電磁鐵：有電時吸引金屬
    const magnets = [];
    for (const e of this.entities) {
      if (!e.isElectromagnet) continue;
      e.powered = energ[e.ty * COLS + e.tx] === 1;
      if (e.powered) magnets.push({ x: e.cx, y: e.cy, r: cfg.magnetRadius, value: 2 });
    }
    this.fields.magnets = magnets;

    // 被電到（附著通電場的對象自己不會被電）
    const immune = new Set(shocks.map((fl) => fl.target).filter(Boolean));
    for (const e of this.entities) {
      if (!e.isEnemy || !e.alive || e.isBoss) continue;
      e.shockCd = (e.shockCd ?? 0) - dt;
      e.shocked = !immune.has(e) && this.isShocked(e);
      if (!e.shocked || e.shockCd > 0) continue;
      e.shockCd = cfg.shockInterval;
      e.stunT = Math.max(e.stunT, cfg.shockStun);
      e.hurt(this, cfg.shockDamage); // 無視護甲
      this.burst(e.cx, e.cy, '#ffe14d', 8);
    }
    const p = this.player;
    p.shocked = !immune.has(p) && this.isShocked(p);
    if (p.shocked) this.hurtPlayer(cfg.shockDamage, { fromX: p.cx });
    // 靠近帶電的危險物（但還沒碰到）：頭上冒火花警告
    p.nearShock = !p.shocked && this.isShocked(p, 10);
  },

  grow(e, pad = 1) {
    return { x: e.x - pad, y: e.y - pad, w: e.w + pad * 2, h: e.h + pad * 2 };
  },

  // 這個物體有沒有被電：本身是通電的金屬、碰到通電的裸露金屬／接頭／鐵塊、或泡在通電的水裡。pad：多看幾 px（警告用）
  isShocked(e, pad = 0) {
    if (!this.energized) return false;
    if (pad === 0 && this.energizedBodies?.has(e) && e.isEnemy) return true;
    const area = this.grow(e, 1 + pad);
    const tiles = this.tilesOf(area);
    if (tiles.some((i) => this.energized[i] && this.conductor[i] === BARE)) return true;
    for (const m of this.energizedBodies ?? []) if (m !== e && this.overlap(area, m)) return true;
    const wetNear = tiles.some((i) => this.energized[i] && this.conductor[i] === WATER);
    if (pad > 0) return wetNear; // 警告：附近有帶電的水
    return wetNear && (e.submerged ?? 0) > 0.2; // 被電：泡在帶電的水裡
  },
};
