// 像素美術：做法參考 GriMon（C:\xampp\htdocs\GriMon）
//   - 用整數像素緩衝（PixBuf）逐點畫，資料是「字元點陣圖＋調色盤」或程式繪製
//   - 最後自動加 1px 深色外描邊
//   - 啟動時（或第一次用到時）烘焙成小畫布並快取，之後每幀只貼圖
//   - 1 世界像素 = 1 像素單位，整個畫面 640×360，最後整數倍放大、關掉平滑

export const OUTLINE = '#10131a';

export function hex(s) {
  return parseInt(s.slice(1), 16);
}

export class PixBuf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.c = new Int32Array(w * h).fill(-1);
  }

  set(x, y, col) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = col;
  }

  get(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.c[y * this.w + x];
  }
}

// 字元點陣圖：'.' 透明，其他字元查調色盤
export function blit(b, rows, pal, ox, oy) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      if (pal[ch] === undefined) throw new Error('調色盤缺少：' + ch);
      b.set(ox + x, oy + y, pal[ch]);
    }
  }
}

// 在圖形外圍加一圈 1px 描邊
export function addOutline(b, color = OUTLINE) {
  const col = hex(color);
  const src = b.c.slice();
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (src[y * b.w + x] >= 0) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const X = x + dx;
        const Y = y + dy;
        return X >= 0 && Y >= 0 && X < b.w && Y < b.h && src[Y * b.w + X] >= 0;
      });
      if (near) b.c[y * b.w + x] = col;
    }
  }
  return b;
}

export function toCanvas(b) {
  const cv = document.createElement('canvas');
  cv.width = b.w;
  cv.height = b.h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(b.w, b.h);
  for (let i = 0; i < b.c.length; i++) {
    const c = b.c[i];
    if (c < 0) continue;
    img.data[i * 4] = (c >> 16) & 255;
    img.data[i * 4 + 1] = (c >> 8) & 255;
    img.data[i * 4 + 2] = c & 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// 受擊閃白用的剪影
export function silhouette(cv, color = '#ffffff') {
  const out = document.createElement('canvas');
  out.width = cv.width;
  out.height = cv.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(cv, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

// 粗線（四肢用）：以 r 為半徑沿線段塗點
export function thickLine(b, ax, ay, bx, by, r, col) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let k = 0; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n;
    const y = ay + ((by - ay) * k) / n;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (ox * ox + oy * oy <= r * r + 0.5) b.set(x + ox, y + oy, col);
  }
}

// 橢圓團塊：左上亮、右下暗（GriMon 的 blob 畫法）
export function blob(b, cx, cy, rx, ry, light, mid, dark) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const shade = dx * 0.6 + dy * 0.8;
      b.set(x, y, shade < -0.35 ? light : shade > 0.45 ? dark : mid);
    }
  }
}

// 固定的雜訊（同一個位置每次都一樣）
export function noise(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const cache = new Map();
export function baked(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// ---------------------------------------------------------------------------
// 主角：16×32 格（含描邊 18×34），腳底在第 31 列，一律朝右畫；頭和身體是點陣圖，腿由程式畫（動畫用）
// ---------------------------------------------------------------------------
const HERO_PAL = {
  h: hex('#263a6b'), H: hex('#3f63a8'), s: hex('#f6d2b4'), e: hex('#1b2333'),
  c: hex('#1a8fb0'), C: hex('#4ad0ff'), w: hex('#e8edf5'), W: hex('#b9c3d6'), g: hex('#2a3142'),
};
const PANTS = hex('#3a4357');
const BOOTS = hex('#2b2426');

const HERO_TOP = [
  '......hhhh......',
  '....hhHHHHhh....',
  '...hHHHHHHHHh...',
  '...hHHhhhhHHh...',
  '...hhssssssHh...',
  '...hsssssesh....',
  '...hsssssesh....',
  '....ssssssh.....',
  '.....ssss.......',
  '..ccCCCCCc......',
  '...cCCCCCCc.....',
  '....wwwwwww.....',
  '...wwWwwwwWw....',
  '..gwwWwwwwWwg...',
  '..gwwWwwwwWwg...',
  '...wwwwwwwww....',
  '....wWWWWWw.....',
  '....wwwwwww.....',
]; // 第 4～21 列

// 腳的位置（以 16×32 格為座標）：[左腳, 右腳]，bob 為身體上下位移
const HERO_POSES = {
  idle0: { feet: [[5, 31], [10, 31]], bob: 0 },
  idle1: { feet: [[5, 31], [10, 31]], bob: 1 },
  run0: { feet: [[3, 30], [12, 31]], bob: 0 },
  run1: { feet: [[7, 31], [9, 29]], bob: -1 },
  run2: { feet: [[12, 30], [4, 31]], bob: 0 },
  run3: { feet: [[9, 29], [7, 31]], bob: -1 },
  jump: { feet: [[5, 27], [11, 28]], bob: -1 },
  fall: { feet: [[3, 31], [12, 30]], bob: 0 },
};
export const HERO_ANIMS = {
  idle: { fps: 2, frames: ['idle0', 'idle1'] },
  run: { fps: 10, frames: ['run0', 'run1', 'run2', 'run3'] },
  jump: { fps: 1, frames: ['jump'] },
  fall: { fps: 1, frames: ['fall'] },
};

function heroFrame(pose) {
  const P = HERO_POSES[pose];
  const b = new PixBuf(18, 34);
  const ox = 1;
  const oy = 1;
  // 腿：從臀部畫到腳，再畫靴子
  const hips = [[6, 22 + P.bob], [9, 22 + P.bob]];
  P.feet.forEach(([fx, fy], k) => {
    thickLine(b, ox + hips[k][0], oy + hips[k][1], ox + fx, oy + fy - 2, 1, PANTS);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 0; y++) b.set(ox + fx + x + (k === 1 ? 0 : 0), oy + fy + y, BOOTS);
  });
  blit(b, HERO_TOP, HERO_PAL, ox, oy + 4 + P.bob);
  return addOutline(b);
}

export function heroSprites() {
  return baked('hero', () => {
    const out = {};
    for (const pose of Object.keys(HERO_POSES)) {
      const cv = toCanvas(heroFrame(pose));
      out[pose] = { canvas: cv, flash: silhouette(cv) };
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// 敵人：程式繪製的團塊，加上眼睛、腳、翅膀等，各兩格動畫
// ---------------------------------------------------------------------------
function enemySprite(kind, frame) {
  const P = {
    walker: ['#ffc06a', '#ff9f43', '#c46a1e'],
    jumper: ['#ffe680', '#f1c40f', '#b8900b'],
    flyer: ['#ffb3e6', '#ff6bcb', '#c2479a'],
    heavy: ['#e0605a', '#c0392b', '#7d2219'],
    turret: ['#c8d0d4', '#95a5a6', '#5f6b6c'],
    laser: ['#ff8ac0', '#e84393', '#9c2163'],
  }[kind].map(hex);
  const eye = hex('#1b1b1b');
  const white = hex('#ffffff');
  const leg = hex('#3a2a20');
  let b;
  if (kind === 'heavy') {
    b = new PixBuf(24, 30);
    blob(b, 12, 15, 9, 11, P[0], P[1], P[2]);
    for (let x = 6; x <= 18; x++) b.set(x, 9, hex('#ffd34d')); // 頭盔的金色飾條
    for (let y = 11; y <= 13; y++) for (let x = 15; x <= 18; x++) b.set(x, y, hex('#2a1010')); // 面罩開口
    b.set(17, 12, hex('#ffd34d'));
    for (const lx of [8, 15]) for (let y = 25; y <= 28; y++) for (let x = lx; x < lx + 3; x++) b.set(x + (frame && lx === 8 ? 1 : 0), y, leg);
  } else if (kind === 'flyer') {
    b = new PixBuf(24, 16);
    blob(b, 12, 8, 6, 5, P[0], P[1], P[2]);
    const wy = frame ? 4 : 9; // 翅膀上下拍
    for (let k = 0; k < 5; k++) { b.set(5 - k, wy + (k >> 1), P[2]); b.set(18 + k, wy + (k >> 1), P[2]); b.set(5 - k, wy + 1 + (k >> 1), P[0]); b.set(18 + k, wy + 1 + (k >> 1), P[0]); }
    b.set(13, 7, eye); b.set(15, 7, eye);
  } else if (kind === 'turret') {
    b = new PixBuf(18, 18);
    blob(b, 9, 10, 7, 6, P[0], P[1], P[2]);
    for (let x = 2; x <= 15; x++) for (let y = 14; y <= 16; y++) b.set(x, y, P[2]);
  } else {
    b = new PixBuf(18, 18);
    blob(b, 9, 9, 7, 6, P[0], P[1], P[2]);
    // 眼睛（朝右）
    if (kind === 'laser') { for (let y = 7; y <= 9; y++) for (let x = 10; x <= 12; x++) b.set(x, y, white); b.set(11, 8, eye); }
    else { b.set(11, 7, white); b.set(11, 8, eye); b.set(13, 7, white); b.set(13, 8, eye); }
    // 腳（兩格動畫交替）
    const feet = frame ? [4, 8, 11] : [5, 9, 12];
    for (const fx of feet) { b.set(fx, 15, leg); b.set(fx, 16, leg); }
    if (kind === 'jumper') for (let x = 3; x <= 14; x++) b.set(x, 14, P[2]); // 跳躍兵的後腿
  }
  return addOutline(b);
}

export function enemySprites(kind) {
  return baked('enemy:' + kind, () => [0, 1].map((f) => {
    const cv = toCanvas(enemySprite(kind, f));
    return { canvas: cv, flash: silhouette(cv) };
  }));
}

// ---------------------------------------------------------------------------
// 地形與物件：每種 16×16，程式逐點上色
// ---------------------------------------------------------------------------
function makeTile(fn) {
  const b = new PixBuf(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = fn(x, y);
    if (c !== null && c !== undefined) b.set(x, y, typeof c === 'number' ? c : hex(c));
  }
  return toCanvas(b);
}

// 牆：4 種變化，依位置挑選；雜訊三階加上幾條石縫。格子之間沒有接縫，外露的邊才描邊（在 render 畫）
export function wallTile(variant) {
  return baked('wall' + variant, () => makeTile((x, y) => {
    const n = noise(x, y, variant + 1);
    const crack = variant === 1 ? (y === 9 && x > 3 && x < 11) : variant === 2 ? (x === 6 && y > 2 && y < 8) : false;
    if (crack) return '#2b3242';
    if (n < 0.14) return '#323a4c';
    if (n > 0.93) return '#4a5570';
    return '#3a4357';
  }));
}

// 牆的上緣（上方是空地時疊上去）：亮邊加一點草或苔
export function wallTop() {
  return baked('wallTop', () => makeTile((x, y) => {
    if (y === 0) return '#6b7896';
    if (y === 1) return '#56627d';
    if (y === 2 && noise(x, 0, 9) > 0.6) return '#56627d';
    return null;
  }));
}

export function spikeTile(down) {
  return baked('spike' + (down ? 'D' : 'U'), () => {
    const b = new PixBuf(16, 16);
    for (let i = 0; i < 2; i++) {
      const bx = i * 8;
      for (let k = 0; k < 8; k++) {
        const h = 12 - Math.abs(k - 3.5) * 3;
        for (let t = 0; t < h; t++) {
          const y = down ? t : 15 - t;
          b.set(bx + k, y, k < 4 ? hex('#ff8a8a') : hex('#d94a4a'));
        }
      }
    }
    return toCanvas(b);
  });
}

export function doorTile() {
  return baked('door', () => makeTile((x, y) => {
    if (x === 0 || x === 15) return '#4a3420';
    if (x === 5 || x === 10) return '#5a4026';
    if (y === 4 || y === 11) return '#8a6435';
    return noise(x, y, 3) > 0.85 ? '#6b4c2c' : '#7a5c3a';
  }));
}

export function crateSprite(kind = 'box') {
  return baked('crate:' + kind, () => {
    const b = new PixBuf(16, 16);
    const plank = hex('#b98a4f');
    const dark = hex('#8a6435');
    const light = hex('#d8a865');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = plank;
      if (x === 0 || y === 0) c = light;
      if (x === 15 || y === 15) c = dark;
      if (kind === 'box' && (x === y || x === 15 - y) && x > 1 && x < 14) c = dark;
      b.set(x, y, c);
    }
    if (kind === 'key') {
      const k = hex('#ffd34d');
      for (const [x, y] of [[4, 6], [5, 6], [4, 7], [5, 7], [3, 7], [6, 7], [4, 8], [5, 8], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [10, 8], [11, 9], [9, 8]]) b.set(x, y, k);
    }
    return toCanvas(b);
  });
}
