import { cfg, TILE, COLS, ROWS } from '../config.js';

// 電力：每一幀從電源（開著的發電機、通電場）出發，沿著相連的導體擴散。
// 導體：水（≥ 0.3 格）、金屬牆／導線（'+'）、發電機、電磁鐵、通電門的開關所在的格子、鐵塊與金屬敵人佔的格子。
// 冰、木箱、石頭、一般的牆、空氣不導電；反射場的邊界也擋住電（兩格中間隔著邊界就不相連）。
// 效果：泡在通電的水裡的東西被電（玩家也會受傷）；通電的金屬敵人被電（無視護甲）；金屬牆／導線本身不會電人。
// 通電門的開關有電時啟動；電磁鐵有電時吸引金屬
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
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

  updateElectric(dt) {
    const N = COLS * ROWS;
    const cond = new Uint8Array(N);
    const water = new Uint8Array(N);
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const i = ty * COLS + tx;
      if (this.map.get(tx, ty) === '+') cond[i] = 1;
      if (this.water.amount[i] >= 0.3 && this.map.get(tx, ty) !== 'I') { cond[i] = 1; water[i] = 1; }
    }
    for (const s of this.switches) if (s.kind === 'power') cond[s.ty * COLS + s.tx] = 1;
    const metals = this.entities.filter((e) => e.alive && e.isMetal && e.isBody);
    for (const m of metals) for (const i of this.tilesOf(m)) cond[i] = 1;

    // 電源
    const energ = new Uint8Array(N);
    const queue = [];
    const seed = (i) => { if (cond[i] && !energ[i]) { energ[i] = 1; queue.push(i); } };
    for (const g of this.entities) if (g.isGenerator && g.on && g.alive) seed(g.ty * COLS + g.tx);
    const shocks = this.fields.list.filter((fl) => fl.skill.type === 'shock' && !this.fields.jammedAt(fl.x, fl.y, 'electric'));
    for (const fl of shocks) {
      for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
        if (Math.hypot(tx * TILE + TILE / 2 - fl.x, ty * TILE + TILE / 2 - fl.y) <= fl.r + TILE / 2) seed(ty * COLS + tx);
      }
    }
    // 沿著相連的導體擴散（反射場的邊界不導電）
    const reflects = this.fields.list.some((fl) => fl.skill.type === 'reflectField');
    while (queue.length) {
      const i = queue.pop();
      const tx = i % COLS;
      const ty = (i / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny * COLS + nx;
        if (!cond[j] || energ[j]) continue;
        if (reflects && this.reflectCross(tx * TILE + 8, ty * TILE + 8, nx * TILE + 8, ny * TILE + 8)) continue;
        energ[j] = 1;
        queue.push(j);
      }
    }
    this.energized = energ;
    this.energizedWater = water;

    // 電磁鐵：有電時吸引金屬
    const magnets = [];
    for (const e of this.entities) {
      if (!e.isElectromagnet) continue;
      e.powered = energ[e.ty * COLS + e.tx] === 1;
      if (e.powered) magnets.push({ x: e.cx, y: e.cy, r: cfg.magnetRadius, value: 2 });
    }
    this.fields.magnets = magnets;

    // 被電到：泡在通電的水裡、或本身是通電的金屬（附著通電場的對象自己不會被電）
    const immune = new Set(shocks.map((fl) => fl.target).filter(Boolean));
    const shocked = (e) => {
      if (immune.has(e)) return false;
      const tiles = this.tilesOf(e);
      if (e.isMetal && tiles.some((i) => energ[i])) return true;
      return (e.submerged ?? 0) > 0.2 && tiles.some((i) => energ[i] && water[i]);
    };
    for (const e of this.entities) {
      if (!e.isEnemy || !e.alive || e.isBoss) continue;
      e.shockCd = (e.shockCd ?? 0) - dt;
      e.shocked = shocked(e);
      if (!e.shocked || e.shockCd > 0) continue;
      e.shockCd = cfg.shockInterval;
      e.stunT = Math.max(e.stunT, cfg.shockStun);
      e.hurt(this, cfg.shockDamage); // 無視護甲
      this.burst(e.cx, e.cy, '#ffe14d', 8);
    }
    const p = this.player;
    p.shocked = shocked(p);
    if (p.shocked) this.hurtPlayer(cfg.shockDamage, { fromX: p.cx });
  },
};
