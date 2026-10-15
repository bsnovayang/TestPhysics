import { cfg, TILE } from './config.js';

const COLORS = ['#3fa9ff', '#ff9f3f'];
const LENGTH = 2 * TILE;

// 把向量從入口的座標系轉到出口：讓「進入入口的方向」（-nA）對應到「離開出口的方向」（nB）
function makeRotation(a, b) {
  const ang = Math.atan2(b.ny, b.nx) - Math.atan2(-a.ny, -a.nx);
  const c = Math.round(Math.cos(ang));
  const s = Math.round(Math.sin(ang));
  return (x, y) => ({ x: x * c - y * s, y: x * s + y * c });
}

// 傳送門：固定在牆面上的空間裂縫。(nx, ny) 是牆面朝向空地的法線
export class Portal {
  constructor(tiles, nx, ny, colorIndex) {
    this.tiles = tiles;
    this.keys = new Set(tiles.map((t) => `${t.tx},${t.ty}`));
    this.nx = nx;
    this.ny = ny;
    this.colorIndex = colorIndex;
    this.color = COLORS[colorIndex];
    this.life = cfg.portalDuration;
    this.maxLife = cfg.portalDuration;
    const minTx = Math.min(...tiles.map((t) => t.tx));
    const minTy = Math.min(...tiles.map((t) => t.ty));
    if (nx !== 0) {
      this.plane = nx > 0 ? (minTx + 1) * TILE : minTx * TILE;
      this.s0 = minTy * TILE;
      this.cx = this.plane;
      this.cy = this.s0 + LENGTH / 2;
    } else {
      this.plane = ny > 0 ? (minTy + 1) * TILE : minTy * TILE;
      this.s0 = minTx * TILE;
      this.cx = this.s0 + LENGTH / 2;
      this.cy = this.plane;
    }
    this.s1 = this.s0 + LENGTH;
  }

  // 沿著門面方向的座標
  tangentOf(x, y) {
    return this.nx !== 0 ? y : x;
  }

  // 點在門面前方多遠（負數代表已經進到牆裡）
  depthOf(x, y) {
    return this.nx !== 0 ? (x - this.plane) * this.nx : (y - this.plane) * this.ny;
  }

  // 矩形在門面方向上是否完全落在門的範圍內（物體要整個塞得進門才能通過）
  fitsRect(x, y, w, h) {
    return this.nx !== 0 ? y >= this.s0 && y + h <= this.s1 : x >= this.s0 && x + w <= this.s1;
  }
}

export class PortalSystem {
  constructor() {
    this.list = [];
    this.jammers = []; // 由 World 每幀更新
  }

  clear() {
    this.list.length = 0;
  }

  jammed(p) {
    return this.jammers.some((j) => (j.kind === 'space' || j.kind === 'all') && Math.hypot(p.cx - j.x, p.cy - j.y) <= j.r);
  }

  // 兩個門都在，而且都沒有被空間干擾器影響時才有作用
  get active() {
    return this.list.length === 2 && !this.list.some((p) => this.jammed(p));
  }

  partner(p) {
    return this.list[0] === p ? this.list[1] : this.list[0];
  }

  update(dt, world) {
    for (const p of this.list) p.life -= dt;
    for (const p of this.list.filter((q) => q.life <= 0)) this.remove(p, world);
  }

  // 門消失時，把卡在門口（牆裡）的物體推回空地
  remove(portal, world) {
    this.list = this.list.filter((p) => p !== portal);
    for (const b of world.portalTravelers()) {
      const stuck = world.map.anyTileInRect(b.x, b.y, b.w, b.h, (tx, ty) => portal.keys.has(`${tx},${ty}`));
      if (!stuck) continue;
      const half = portal.nx !== 0 ? b.w / 2 : b.h / 2;
      if (portal.nx !== 0) b.x = portal.plane + portal.nx * (half + 0.5) - b.w / 2;
      else b.y = portal.plane + portal.ny * (half + 0.5) - b.h / 2;
    }
  }

  // 碰撞時，這一格牆是否被傳送門「打開」（只對塞得進門的物體有效）
  coversTile(tx, ty, x, y, w, h) {
    if (!this.active) return false;
    const key = `${tx},${ty}`;
    return this.list.some((p) => p.keys.has(key) && p.fitsRect(x, y, w, h));
  }

  // 網打到牆時開門。(x, y) 是撞牆前的最後一個空地點，(hx, hy) 是撞到牆的點
  place(world, x, y, hx, hy) {
    const map = world.map;
    const ptx = Math.floor(x / TILE);
    const pty = Math.floor(y / TILE);
    let tx = Math.floor(hx / TILE);
    let ty = Math.floor(hy / TILE);
    let nx = 0;
    let ny = 0;
    if (ptx !== tx && pty !== ty) {
      // 斜著撞到牆角：先判斷實際先碰到哪一格
      if (map.isSolid(tx, pty)) { ty = pty; nx = Math.sign(ptx - tx); }
      else if (map.isSolid(ptx, ty)) { tx = ptx; ny = Math.sign(pty - ty); }
      else nx = Math.sign(ptx - tx);
    } else if (ptx !== tx) {
      nx = Math.sign(ptx - tx);
    } else if (pty !== ty) {
      ny = Math.sign(pty - ty);
    } else {
      return { error: '這裡不能開門' };
    }

    // 沿著牆面找連續 2 格可用的牆：命中點靠哪一邊，就先往哪一邊延伸
    const along = nx !== 0 ? (hy / TILE) % 1 : (hx / TILE) % 1;
    const step = nx !== 0 ? { dx: 0, dy: 1 } : { dx: 1, dy: 0 };
    const tryOrder = along < 0.5 ? [-1, 0] : [0, -1];
    const usable = (cx, cy) =>
      map.get(cx, cy) === '#' && !map.isSolid(cx + nx, cy + ny) && map.get(cx + nx, cy + ny) !== '^';
    const keeping = this.list.length === 2 ? [this.list[1]] : this.list;

    for (const off of tryOrder) {
      const tiles = [0, 1].map((i) => ({ tx: tx + step.dx * (off + i), ty: ty + step.dy * (off + i) }));
      if (!tiles.every((t) => usable(t.tx, t.ty))) continue;
      if (keeping.some((p) => tiles.some((t) => p.keys.has(`${t.tx},${t.ty}`)))) continue;
      let colorIndex;
      if (this.list.length === 2) colorIndex = this.list.shift().colorIndex;
      else colorIndex = this.list.length === 0 ? 0 : 1 - this.list[0].colorIndex;
      const portal = new Portal(tiles, nx, ny, colorIndex);
      this.list.push(portal);
      return { portal };
    }
    return { error: '需要連續 2 格平整的牆面' };
  }

  // 線段（點狀物體這一步的移動）是否從正面穿過某個門。回傳穿過後的位置與方向轉換
  crossSegment(x0, y0, x1, y1) {
    if (!this.active) return null;
    for (const p of this.list) {
      const d0 = p.depthOf(x0, y0);
      const d1 = p.depthOf(x1, y1);
      if (d0 < 0 || d1 >= 0) continue;
      const t = d0 / (d0 - d1);
      const ix = x0 + (x1 - x0) * t;
      const iy = y0 + (y1 - y0) * t;
      const s = p.tangentOf(ix, iy);
      if (s < p.s0 || s > p.s1) continue;
      const q = this.partner(p);
      const rot = makeRotation(p, q);
      const rel = rot(ix - p.cx, iy - p.cy);
      return {
        x: q.cx + rel.x + q.nx * 2,
        y: q.cy + rel.y + q.ny * 2,
        rotate: rot,
      };
    }
    return null;
  }

  // 有尺寸的物體：中心穿過門面時傳送到另一個門，速度跟著轉向
  tryTeleport(world, b) {
    if (!this.active) return false;
    for (const p of this.list) {
      if (p.depthOf(b.cx, b.cy) >= 0) continue;
      const s = p.tangentOf(b.cx, b.cy);
      if (s < p.s0 || s > p.s1) continue;
      const q = this.partner(p);
      const rot = makeRotation(p, q);
      const rel = rot(b.cx - p.cx, b.cy - p.cy);
      let cx = q.cx + rel.x;
      let cy = q.cy + rel.y;

      // 出口：整個身體放到門的前方，並且留在門的範圍內
      const half = q.nx !== 0 ? b.w / 2 : b.h / 2;
      const depth = q.depthOf(cx, cy);
      if (depth < half + 0.5) {
        cx += q.nx * (half + 0.5 - depth);
        cy += q.ny * (half + 0.5 - depth);
      }
      if (q.nx !== 0) cy = Math.min(Math.max(cy, q.s0 + b.h / 2), q.s1 - b.h / 2);
      else cx = Math.min(Math.max(cx, q.s0 + b.w / 2), q.s1 - b.w / 2);

      const nx = cx - b.w / 2;
      const ny = cy - b.h / 2;
      if (world.rectBlocked(nx, ny, b.w, b.h, b)) return false; // 出口被擋住
      b.x = nx;
      b.y = ny;

      const v = rot(b.vx, b.vy);
      const out = v.x * q.nx + v.y * q.ny;
      if (out < cfg.portalMinExit) {
        v.x += q.nx * (cfg.portalMinExit - out);
        v.y += q.ny * (cfg.portalMinExit - out);
      }
      b.vx = v.x;
      b.vy = v.y;
      world.burst(cx, cy, q.color, 8);
      return true;
    }
    return false;
  }
}
