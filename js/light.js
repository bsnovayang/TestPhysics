import { cfg, TILE, STEP, COLS, ROWS } from './config.js';
import { Box } from './objects.js';

const RAY_STEP = 2;
const MAX_LENGTH = 1600;
const DIRS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
];

function inRect(e, x, y) {
  return x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h;
}

function normalize(v) {
  const d = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / d, y: v.y / d };
}

const WATER_INDEX = 1.33;

// 折射率：時間越慢，光越慢，折射率越高；在水中再乘上水的折射率。時停中的光會停住（回傳 Infinity）
function refractiveIndex(world, x, y) {
  const t = world.fields.sample(x, y).time;
  if (t < 0.05) return Infinity;
  return (1 / t) * (world.water.pointInWater(x, y) ? WATER_INDEX : 1);
}

// 追蹤一道光線，回傳折線（穿過傳送門時會斷開成多段）與最後擊中的東西。
// 光線會：被牆和實心物體擋住、被鏡子箱反射、穿過傳送門、在重力場域中彎曲、
// 在時間場域邊界折射（角度太大時全反射），進入時停區域時停住
// hitsPlayer：解謎用的無害光線會穿過玩家（否則玩家擋在光路上，門就會一直開開關關）
export function traceBeam(world, x, y, dx, dy, source = null, hitsPlayer = true) {
  let d = normalize({ x: dx, y: dy });
  const segments = [[{ x, y }]];
  let cur = segments[0];
  let n1 = refractiveIndex(world, x, y);
  let lastMirror = null;
  let hit = { type: 'none' };
  let bendSteps = 0;
  let inReflect = false; // 正在向量反射場裡（避免在圓裡重複反射）
  const heats = []; // 被這道光加熱的水格（只加熱光線經過的第一個水格）

  for (let len = 0; len < MAX_LENGTH; len += RAY_STEP) {
    const nx = x + d.x * RAY_STEP;
    const ny = y + d.y * RAY_STEP;

    const cross = world.portals.crossSegment(x, y, nx, ny);
    if (cross) {
      cur.push({ x: nx, y: ny });
      d = normalize(cross.rotate(d.x, d.y));
      x = cross.x;
      y = cross.y;
      cur = [{ x, y }];
      segments.push(cur);
      continue;
    }

    if (nx < 0 || ny < 0 || nx >= COLS * TILE || ny >= ROWS * TILE) {
      cur.push({ x: nx, y: ny });
      hit = { type: 'wall' };
      break;
    }
    if (world.map.pointSolid(nx, ny)) {
      cur.push({ x: nx, y: ny });
      const tx = Math.floor(nx / TILE);
      const ty = Math.floor(ny / TILE);
      hit = world.map.get(tx, ty) === 'I' ? { type: 'ice', tx, ty } : { type: 'wall' };
      break;
    }

    // 熔岩不透光
    if (world.water.pointInLava(nx, ny)) {
      cur.push({ x: nx, y: ny });
      hit = { type: 'wall' };
      break;
    }
    // 濃的蒸氣會擋住光線（可以當成擋雷射的煙幕）。水裡的蒸氣是氣泡，不擋光，
    // 否則雷射剛把水煮出蒸氣，就會被自己煮出來的蒸氣擋住
    if (world.water.pointSteam(nx, ny) > cfg.steamBlock && !world.water.pointInWater(nx, ny)) {
      cur.push({ x: nx, y: ny });
      hit = { type: 'steam' };
      break;
    }
    if (!heats.length && world.water.pointInWater(nx, ny)) {
      heats.push({ tx: Math.floor(nx / TILE), ty: Math.floor(ny / TILE) });
    }

    // 物件：鏡子反射、敵人受擊、其他實心物體擋住
    let stop = false;
    let reflected = false;
    for (const e of world.entities) {
      if (!e.alive || e === source || !inRect(e, nx, ny)) continue;
      if (e.isMirror) {
        if (e === lastMirror) continue;
        cur.push({ x: e.cx, y: e.cy });
        x = e.cx;
        y = e.cy;
        d = e.orient === '/' ? { x: -d.y, y: -d.x } : { x: d.y, y: d.x };
        lastMirror = e;
        reflected = true;
        break;
      }
      if (e.isEnemy) { hit = { type: 'enemy', entity: e }; stop = true; break; }
      if (e.isIce) { hit = { type: 'ice', entity: e }; stop = true; break; }
      if (e.solid && !e.isBullet) { hit = { type: 'block', entity: e }; stop = true; break; }
    }
    if (reflected) continue;
    if (stop) { cur.push({ x: nx, y: ny }); break; }
    if (lastMirror && !inRect(lastMirror, nx, ny)) lastMirror = null;

    const receiver = world.switches.find((s) => s.kind === 'light' && inRect(s, nx, ny));
    if (receiver) {
      cur.push({ x: nx, y: ny });
      hit = { type: 'receiver', entity: receiver };
      break;
    }
    // 向量反射場：光線碰到反射場的邊緣就原路射回去；反射後連發射者自己也打得到
    const rf = world.reflect;
    if (rf && source !== world.player) {
      const p = world.player;
      const ox = nx - p.cx;
      const oy = ny - p.cy;
      const r = Math.hypot(ox, oy);
      if (r <= cfg.reflectRadius && !inReflect) {
        const n = { x: ox / (r || 1), y: oy / (r || 1) };
        const dot = d.x * n.x + d.y * n.y;
        if (dot < 0) {
          d = { x: -d.x, y: -d.y };
          cur.push({ x: nx, y: ny });
          x = nx;
          y = ny;
          inReflect = true;
          source = null;
          if (hitsPlayer) world.reflectLaser = true;
          continue;
        }
      }
      if (r > cfg.reflectRadius) inReflect = false;
      // 反射後往外走的這一段在圓裡：不會打到玩家
      if (r <= cfg.reflectRadius) { x = nx; y = ny; continue; }
    }
    if (hitsPlayer && source !== world.player && inRect(world.player, nx, ny)) {
      cur.push({ x: nx, y: ny });
      hit = { type: 'player' };
      break;
    }

    // 時間場域：折射（司乃耳定律），時停則吸收光線
    const n2 = refractiveIndex(world, nx, ny);
    if (n2 === Infinity) {
      cur.push({ x: nx, y: ny });
      hit = { type: 'frozen' };
      break;
    }
    if (Math.abs(n2 - n1) > 1e-6) {
      // 邊界的法線：水面是水平的（跨格時依跨越的方向），時間場域是圓形
      let N = null;
      if (world.water.pointInWater(x, y) !== world.water.pointInWater(nx, ny)) {
        const sameRow = Math.floor(y / TILE) === Math.floor(ny / TILE);
        const sameCol = Math.floor(x / TILE) === Math.floor(nx / TILE);
        N = sameRow && !sameCol ? { x: 1, y: 0 } : { x: 0, y: 1 };
      } else {
        const f = world.fields.list.find((fl) => fl.skill.type === 'timeMult' && fl.contains(x, y) !== fl.contains(nx, ny));
        if (f) N = normalize({ x: nx - f.x, y: ny - f.y });
      }
      if (N) {
        if (N.x * d.x + N.y * d.y > 0) N = { x: -N.x, y: -N.y };
        const eta = n1 / n2;
        const cosi = -(N.x * d.x + N.y * d.y);
        const k = 1 - eta * eta * (1 - cosi * cosi);
        cur.push({ x, y });
        if (k < 0) {
          d = normalize({ x: d.x + 2 * cosi * N.x, y: d.y + 2 * cosi * N.y }); // 全反射
          continue;
        }
        d = normalize({ x: eta * d.x + (eta * cosi - Math.sqrt(k)) * N.x, y: eta * d.y + (eta * cosi - Math.sqrt(k)) * N.y });
      }
      n1 = n2;
    }

    // 重力場域：光線彎曲（重力透鏡）
    const b = world.fields.lightBend(nx, ny);
    if (b.x || b.y) {
      d = normalize({ x: d.x + b.x * cfg.lightBend * RAY_STEP, y: d.y + b.y * cfg.lightBend * RAY_STEP });
      if (++bendSteps % 3 === 0) cur.push({ x: nx, y: ny });
    }

    x = nx;
    y = ny;
  }
  if (hit.type === 'none') cur.push({ x, y });
  return { segments, hit, heats };
}

// 雷射發射器：固定在牆上，朝遠離牆的方向持續發光。預設無害，用來解謎
export class Emitter {
  constructor(tx, ty) {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = TILE;
    this.h = TILE;
    this.alive = true;
    this.solid = true;
    this.dir = null;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world) {
    if (!this.dir) {
      // 背對相鄰的牆
      const wall = DIRS.find((v) => world.map.isSolid(this.tx + v.x, this.ty + v.y));
      this.dir = wall ? { x: -wall.x, y: -wall.y } : { x: 1, y: 0 };
    }
    const sx = this.cx + this.dir.x * 9;
    const sy = this.cy + this.dir.y * 9;
    const beam = traceBeam(world, sx, sy, this.dir.x, this.dir.y, this, cfg.emitterDamage > 0);
    world.beams.push({ segments: beam.segments, kind: 'emitter' });
    applyBeamHit(world, beam.hit, cfg.emitterDamage, this.cx, beam.heats);
  }
}

// 鏡子箱：可以推、受場域影響，會以 '/' 或 '\' 的角度反射光線。被空氣砲打到時旋轉 90 度
export class MirrorBox extends Box {
  constructor(tx, ty) {
    super(tx, ty);
    this.isMirror = true;
    this.orient = '/';
  }

  onAirShot(world) {
    this.orient = this.orient === '/' ? '\\' : '/';
    world.burst(this.cx, this.cy, '#bfe9ff', 6);
  }
}

// 光線擊中時的效果。damage 為 0 時無害（只用於點亮接收器、融冰、煮水）
export function applyBeamHit(world, hit, damage, fromX, heats = []) {
  for (const h of heats) world.water.heatWater(h.tx, h.ty, STEP, cfg.laserHeat); // 雷射很燙：和熔岩一樣強
  if (hit.type === 'receiver') hit.entity.lit = true;
  // 光照到冰會升溫，持續約 1 秒就融化（不管光有沒有傷害）
  if (hit.type === 'ice') {
    if (hit.entity) hit.entity.heatUp(world, STEP);
    else world.water.heatTile(world, hit.tx, hit.ty, STEP);
  }
  if (!damage) return;
  if (hit.type === 'player') world.hurtPlayer(damage, { fromX });
  if (hit.type === 'enemy' && hit.entity.laserCd <= 0) {
    hit.entity.laserCd = 0.5;
    hit.entity.hurt(world, damage);
  }
}
