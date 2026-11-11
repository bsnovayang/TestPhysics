import { TILE, COLS, ROWS, VIEW_H } from '../config.js';
import { noise } from '../pixel/art.js';
import { roomSeed } from '../save.js';

// 場景（房間設定 theme: 'ruins'）：遺跡＋天然物。不會碰撞，只是畫面。
//   背景：洞窟岩壁、崩塌的磚牆、斷掉的柱子、遠處垂下的樹根
//   裝飾（畫在地形上）：深處的岩石變暗（讓能走的空間輪廓清楚）、岩壁上露出的砌石、
//         地面的草與苔、天花板垂下的藤蔓與鐘乳石、碎石、牆縫的樹根
// 依照房間地形自動產生（種子是房間 id，每次都一樣），房間載入後第一次畫時烘焙成圖，之後每幀只貼圖
// 這些方法會掛到 Renderer 上（Object.assign），裡面的 this 就是 renderer
const bakedScenery = new WeakMap(); // 地圖 → { bg, decor }

export const SceneryRenderer = {
  sceneryTheme(world) {
    return world.room.theme ?? null;
  },

  // 背景：有場景時取代格線，回傳 true
  drawScenery(world) {
    if (!this.sceneryTheme(world)) return false;
    this.ctx.drawImage(this.sceneryFor(world).bg, 0, 0);
    return true;
  },

  drawDecor(world) {
    if (!this.sceneryTheme(world)) return;
    this.ctx.drawImage(this.sceneryFor(world).decor, 0, 0);
  },

  sceneryFor(world) {
    let s = bakedScenery.get(world.map);
    if (!s) {
      s = bakeRuins(world.map, roomSeed(world.room));
      bakedScenery.set(world.map, s);
    }
    return s;
  },
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const PAL = {
  caveA: '#11141c', caveB: '#141822', caveC: '#0d1017',
  brick: ['#1b202c', '#1e2431', '#181d28'], mortar: '#0f1219',
  pillar: '#1f2535', pillarLit: '#283047', pillarDark: '#161a25',
  bgRoot: '#1a2420',
  stone: '#3f485e', stoneLit: '#4a5570', stoneMortar: '#2e3546',
  grass: '#3f6b35', grassLit: '#5c8f45', moss: '#4a7a3c',
  vine: '#355c2e', leaf: '#5c8f45',
  drip: '#3a4357', dripDark: '#2b3242',
  pebble: '#4a5570', root: '#5a4630',
  shade: '10,12,18',
};

function bakeRuins(map, seed) {
  const W = COLS * TILE;
  const H = ROWS * TILE;
  const rock = (tx, ty) => map.get(tx, ty) === '#';
  const open = (tx, ty) => tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS && map.get(tx, ty) === ' ';
  const rnd = (a, b, k) => noise(a, b, seed + k);

  // ---------------- 背景 ----------------
  const bg = canvas(W, H);
  const g = bg.getContext('2d');
  // 洞窟岩壁：2 px 一點的雜訊
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const n = rnd(x >> 1, y >> 1, 1);
      g.fillStyle = n < 0.12 ? PAL.caveC : n > 0.9 ? PAL.caveB : PAL.caveA;
      g.fillRect(x, y, 2, 2);
    }
  }
  // 崩塌的磚牆：佔房間的下半部，上緣參差不齊（越靠近上緣缺的磚越多）
  let top = 9 + Math.floor(rnd(0, 0, 2) * 3);
  const wallTop = [];
  for (let tx = 0; tx < COLS; tx++) {
    top += rnd(tx, 1, 3) < 0.33 ? -1 : rnd(tx, 1, 3) > 0.67 ? 1 : 0;
    top = Math.max(6, Math.min(13, top));
    wallTop.push(top * TILE + Math.floor(rnd(tx, 2, 4) * 8));
  }
  for (let y = 0; y < H; y += 4) {
    const row = y / 4;
    const off = row % 2 ? 4 : 0;
    for (let x = -off; x < W; x += 8) {
      const tx = Math.max(0, Math.min(COLS - 1, Math.floor((x + 4) / TILE)));
      const edge = wallTop[tx];
      if (y < edge) continue;
      const nearTop = Math.max(0, 1 - (y - edge) / 40);
      if (rnd(x, row, 5) < 0.06 + nearTop * 0.45) continue; // 缺了一塊
      g.fillStyle = PAL.mortar;
      g.fillRect(x, y, 8, 4);
      g.fillStyle = PAL.brick[Math.floor(rnd(x, row, 6) * 3)];
      g.fillRect(x + 1, y + 1, 6, 2);
    }
  }
  // 斷掉的柱子：站在地面上，有的完整撐到天花板，有的斷在半截
  const pillars = 2 + Math.floor(rnd(0, 3, 7) * 2);
  for (let i = 0; i < pillars; i++) {
    const tx = 2 + Math.floor(((i + 0.2 + rnd(i, 4, 8) * 0.6) / pillars) * (COLS - 5));
    // 從房間中段往下找地面，往上找天花板
    let floor = -1;
    for (let ty = ROWS - 1; ty > 2; ty--) if (open(tx, ty) && open(tx + 1, ty) && rock(tx, ty + 1) && rock(tx + 1, ty + 1)) { floor = ty; break; }
    if (floor < 0) continue;
    let ceil = floor;
    while (ceil > 0 && open(tx, ceil - 1) && open(tx + 1, ceil - 1)) ceil--;
    if (floor - ceil < 4) continue;
    const x = tx * TILE + 6;
    const yBottom = (floor + 1) * TILE;
    const broken = rnd(i, 5, 9) < 0.55;
    const yTop = broken ? ceil * TILE + Math.floor((floor - ceil) * TILE * (0.3 + rnd(i, 6, 10) * 0.4)) : ceil * TILE;
    g.fillStyle = PAL.pillar;
    g.fillRect(x, yTop, 20, yBottom - yTop);
    g.fillStyle = PAL.pillarLit;
    g.fillRect(x, yTop, 3, yBottom - yTop);
    g.fillStyle = PAL.pillarDark;
    g.fillRect(x + 17, yTop, 3, yBottom - yTop);
    for (let k = 7; k < 16; k += 5) g.fillRect(x + k, yTop, 1, yBottom - yTop); // 柱身的溝紋
    g.fillStyle = PAL.pillarLit;
    g.fillRect(x - 3, yBottom - 6, 26, 6); // 柱座
    if (broken) {
      // 斷口：參差不齊
      g.fillStyle = PAL.caveA;
      for (let k = 0; k < 20; k += 2) g.fillRect(x + k, yTop, 2, Math.floor(rnd(i, k, 11) * 6));
    } else {
      g.fillRect(x - 3, yTop, 26, 5); // 柱頭
    }
  }
  // 遠處垂下的樹根：從天花板垂下的暗色細線
  for (let tx = 0; tx < COLS; tx++) {
    for (let ty = 1; ty < ROWS; ty++) {
      if (!(rock(tx, ty - 1) && open(tx, ty)) || rnd(tx, ty, 12) < 0.8) continue;
      let x = tx * TILE + Math.floor(rnd(tx, ty, 13) * 14);
      const len = 12 + Math.floor(rnd(tx, ty, 14) * 30);
      g.fillStyle = PAL.bgRoot;
      for (let k = 0; k < len; k++) {
        if (k % 7 === 6) x += rnd(tx, k, 15) < 0.5 ? -1 : 1;
        g.fillRect(x, ty * TILE + k, 1, 1);
      }
    }
  }

  // ---------------- 裝飾（畫在地形上面）----------------
  const decor = canvas(W, VIEW_H); // 比地圖多畫到畫面底（最後一列下面不足一格的部分）
  const d = decor.getContext('2d');
  // 深處的岩石變暗：離空地越遠越暗
  const depth = (tx, ty) => {
    for (let r = 1; r <= 4; r++) {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const X = tx + ox;
        const Y = ty + oy;
        if (X < 0 || X >= COLS || Y < 0 || Y >= ROWS) continue;
        if (!rock(X, Y)) return r;
      }
    }
    return 5;
  };
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (!rock(tx, ty)) continue;
      const r = depth(tx, ty);
      if (r >= 2) {
        d.fillStyle = `rgba(${PAL.shade},${[0, 0, 0.22, 0.38, 0.5, 0.6][r]})`;
        d.fillRect(tx * TILE, ty * TILE, TILE, ty === ROWS - 1 ? VIEW_H - ty * TILE : TILE);
      }
      // 岩壁表面偶爾露出砌石（遺跡的牆）
      if (r === 1 && rnd(tx, ty, 20) > 0.91) {
        const x = tx * TILE;
        const y = ty * TILE;
        d.fillStyle = PAL.stoneMortar;
        d.fillRect(x + 1, y + 2, 14, 12);
        d.fillStyle = PAL.stone;
        d.fillRect(x + 2, y + 3, 6, 5); d.fillRect(x + 9, y + 3, 5, 5);
        d.fillRect(x + 2, y + 9, 3, 4); d.fillRect(x + 6, y + 9, 8, 4);
        d.fillStyle = PAL.stoneLit;
        d.fillRect(x + 2, y + 3, 6, 1); d.fillRect(x + 9, y + 3, 5, 1); d.fillRect(x + 6, y + 9, 8, 1);
      }
    }
  }
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (!rock(tx, ty)) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      // 地面：草、苔、碎石
      if (open(tx, ty - 1)) {
        for (let px = 0; px < TILE; px++) {
          const n = rnd(x + px, ty, 21);
          if (n > 0.55) { d.fillStyle = PAL.moss; d.fillRect(x + px, y, 1, 1); }
          if (n > 0.8) {
            const h = 1 + Math.floor(rnd(x + px, ty, 22) * 3);
            d.fillStyle = n > 0.92 ? PAL.grassLit : PAL.grass;
            d.fillRect(x + px, y - h, 1, h);
          }
        }
        if (rnd(tx, ty, 23) > 0.82) {
          d.fillStyle = PAL.pebble;
          const px = Math.floor(rnd(tx, ty, 24) * 11);
          d.fillRect(x + px, y - 2, 3, 2);
          d.fillRect(x + px + 4, y - 1, 2, 1);
        }
      }
      // 天花板：藤蔓、鐘乳石
      if (open(tx, ty + 1)) {
        const n = rnd(tx, ty, 25);
        if (n > 0.72) {
          // 藤蔓：往下垂 1～4 格（碰到地形就停），葉子交錯長在兩邊
          let len = 8 + Math.floor(rnd(tx, ty, 26) * 50);
          let free = 0;
          while (open(tx, ty + 1 + free) && free < 6) free++;
          len = Math.min(len, free * TILE - 6);
          let vx = x + 3 + Math.floor(rnd(tx, ty, 27) * 10);
          for (let k = 0; k < len; k++) {
            if (k % 6 === 5) vx += rnd(tx, k, 28) < 0.5 ? -1 : 1;
            d.fillStyle = PAL.vine;
            d.fillRect(vx, y + TILE + k, 1, 1);
            if (k % 4 === 2) {
              d.fillStyle = PAL.leaf;
              d.fillRect(vx + ((k >> 2) % 2 ? 1 : -2), y + TILE + k, 2, 1);
            }
          }
        } else if (n < 0.2) {
          // 鐘乳石
          const w = 3 + Math.floor(rnd(tx, ty, 29) * 3);
          const len = 4 + Math.floor(rnd(tx, ty, 30) * 7);
          const cx = x + 3 + Math.floor(rnd(tx, ty, 31) * (12 - w));
          for (let k = 0; k < len; k++) {
            const half = Math.max(0, Math.round((w / 2) * (1 - k / len)));
            d.fillStyle = PAL.drip;
            d.fillRect(cx - half, y + TILE + k, half * 2 + 1, 1);
            d.fillStyle = PAL.dripDark;
            d.fillRect(cx + half, y + TILE + k, 1, 1);
          }
        }
      }
      // 牆縫的樹根：側面露出的細根
      for (const side of [-1, 1]) {
        if (!open(tx + side, ty) || rnd(tx, ty, 32 + side) < 0.88) continue;
        const sx = side > 0 ? x + TILE : x - 1;
        let ry = y + 3 + Math.floor(rnd(tx, ty, 34) * 8);
        d.fillStyle = PAL.root;
        for (let k = 0; k < 5; k++) {
          d.fillRect(sx + side * k, ry, 1, 1);
          if (k % 2) ry += 1;
        }
      }
    }
  }
  return { bg, decor };
}
