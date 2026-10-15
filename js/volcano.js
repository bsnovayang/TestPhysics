import { cfg, TILE } from './config.js';
import { STEAM_EXPANSION } from './water.js';

const DIRS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
];

function solidAt(world, x, y) {
  return world.map.pointSolid(x, y);
}

// 飛行中的熔岩塊（噴發口噴出）。受重力與時間場域影響、會穿過傳送門。
// 被時停時變成可以站、而且不燙的實心；碰到水就在那一格凝固成石頭；落地後變回熔岩液體
export class LavaBlob {
  constructor(x, y, vx, vy) {
    this.w = 8;
    this.h = 8;
    this.x = x - 4;
    this.y = y - 4;
    this.vx = vx;
    this.vy = vy;
    this.alive = true;
    this.solid = false;
    this.hittable = true;
    this.isLavaBlob = true;
    this.time = 1;
    this.life = 8;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    const m = world.fields.sample(this.cx, this.cy);
    this.time = m.time;
    this.solid = m.time < 0.05; // 時停：實心、不燙
    const tx = Math.floor(this.cx / TILE);
    const ty = Math.floor(this.cy / TILE);

    // 碰到水：在這一格凝固成石頭（凍住的熔岩塊也一樣，這樣倒水就能把熔岩柱變成石柱）
    if (world.water.get(tx, ty) > 0.05) {
      this.solidify(world, tx, ty);
      return;
    }
    if (this.solid) return;

    const ldt = dt * m.time;
    this.life -= ldt;
    this.vx += m.gx * ldt;
    this.vy += m.gy * ldt;
    const nx = this.cx + this.vx * ldt;
    const ny = this.cy + this.vy * ldt;
    const cross = world.portals.crossSegment(this.cx, this.cy, nx, ny);
    if (cross) {
      const v = cross.rotate(this.vx, this.vy);
      this.vx = v.x;
      this.vy = v.y;
      this.x = cross.x - this.w / 2;
      this.y = cross.y - this.h / 2;
      return;
    }
    if (solidAt(world, nx, ny) || this.life <= 0) {
      // 落地：變回熔岩液體
      world.water.addLava(tx, ty, cfg.blobLava);
      this.alive = false;
      return;
    }
    this.x = nx - this.w / 2;
    this.y = ny - this.h / 2;
    if (world.overlap(this, world.player)) world.hurtPlayer(cfg.blobDamage, { fromX: this.cx });
  }

  solidify(world, tx, ty) {
    this.alive = false;
    if (world.map.isSolid(tx, ty) || world.water.occupied(world, tx, ty)) {
      world.burst(this.cx, this.cy, '#bbbbbb', 6);
      return;
    }
    const i = world.water.idx(tx, ty);
    const water = world.water.amount[i];
    world.water.ventSteam(tx, ty, water * STEAM_EXPANSION);
    world.water.amount[i] = 0;
    world.water.lava[i] = 0;
    world.map.set(tx, ty, 'Q');
    world.burst(this.cx, this.cy, '#bbbbbb', 10);
  }

  onAirShot(world, dir) {
    this.vx += dir.x * cfg.cannonImpulse * 0.6;
    this.vy += dir.y * cfg.cannonImpulse * 0.6;
  }
}

// 火山彈：噴發時拋出的石塊，打到玩家或敵人會受傷，落地時濺出熔岩。可以用空氣砲打偏
export class VolcanicBomb {
  constructor(x, y, vx, vy) {
    this.w = 8;
    this.h = 8;
    this.x = x - 4;
    this.y = y - 4;
    this.vx = vx;
    this.vy = vy;
    this.alive = true;
    this.solid = false;
    this.hittable = true;
    this.isBomb = true;
    this.time = 1;
    this.spin = 0;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    const m = world.fields.sample(this.cx, this.cy);
    this.time = m.time;
    this.solid = m.time < 0.05;
    if (this.solid) return;
    const ldt = dt * m.time;
    this.spin += ldt * 8;
    this.vx += m.gx * ldt;
    this.vy += m.gy * ldt;
    const nx = this.cx + this.vx * ldt;
    const ny = this.cy + this.vy * ldt;
    const cross = world.portals.crossSegment(this.cx, this.cy, nx, ny);
    if (cross) {
      const v = cross.rotate(this.vx, this.vy);
      this.vx = v.x;
      this.vy = v.y;
      this.x = cross.x - this.w / 2;
      this.y = cross.y - this.h / 2;
      return;
    }
    const tx = Math.floor(this.cx / TILE);
    const ty = Math.floor(this.cy / TILE);
    if (solidAt(world, nx, ny) || ny > world.map.rows.length * TILE + 32) {
      this.explode(world, tx, ty);
      return;
    }
    this.x = nx - this.w / 2;
    this.y = ny - this.h / 2;
    if (world.overlap(this, world.player)) {
      world.hurtPlayer(cfg.bombDamage, { fromX: this.cx });
      this.explode(world, tx, ty);
      return;
    }
    const enemy = world.entities.find((e) => e.isEnemy && e.alive && world.overlap(this, e));
    if (enemy) {
      enemy.hurt(world, cfg.bombDamage);
      this.explode(world, tx, ty);
    }
  }

  explode(world, tx, ty) {
    this.alive = false;
    world.water.addLava(tx, ty, cfg.blobLava * 2);
    world.burst(this.cx, this.cy, '#ff8a3d', 14);
  }

  onAirShot(world, dir) {
    this.vx += dir.x * cfg.cannonImpulse;
    this.vy += dir.y * cfg.cannonImpulse;
  }
}

// 間歇噴發口：安靜 → 預兆 → 噴發，往上噴出熔岩塊並拋出火山彈。上方被實心擋住時不會噴發。
// 也會把周圍的熔岩吸回去，否則噴出來的熔岩會越積越多，淹沒整個房間
export class Vent {
  constructor(tx, ty) {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = TILE;
    this.h = TILE;
    this.alive = true;
    this.isVent = true;
    this.state = 'idle';
    this.timer = 2;
    this.time = 1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    const m = world.fields.sample(this.cx, this.cy);
    this.time = m.time;
    const ldt = dt * m.time;
    if (ldt <= 0) return;
    // 房間裡的熔岩比基準量多時，把周圍的熔岩吸回去（噴出來的熔岩最後會回到火山裡）
    const total = world.water.lava.reduce((a, b) => a + b, 0);
    if (total > world.lavaBaseline + 0.5) {
      for (let dy = -2; dy <= 0; dy++) for (let dx = -3; dx <= 3; dx++) world.water.takeLava(this.tx + dx, this.ty + dy, cfg.ventDrain * ldt);
    }
    // 上方被實心（例如石頭）封住：不會噴發
    this.blocked = world.map.isSolid(this.tx, this.ty - 1) || world.map.isSolid(this.tx, this.ty);
    this.timer -= ldt;
    switch (this.state) {
      case 'idle':
        if (this.timer <= 0) { this.state = 'warn'; this.timer = cfg.ventWarn; }
        break;
      case 'warn':
        if (Math.random() < 0.5) world.particles.push({ x: this.cx + (Math.random() - 0.5) * 12, y: this.y, vx: 0, vy: -30 - Math.random() * 40, life: 0.4, color: '#ff8a3d' });
        if (this.timer <= 0) {
          if (this.blocked) { this.state = 'idle'; this.timer = cfg.ventInterval; break; }
          this.state = 'erupt';
          this.timer = cfg.ventDuration;
          for (let k = 0; k < cfg.ventBombs; k++) {
            const side = k % 2 ? 1 : -1;
            const a = -Math.PI / 2 + side * (0.35 + Math.random() * 0.5);
            const s = 300 + Math.random() * 80;
            world.entities.push(new VolcanicBomb(this.cx, this.y, Math.cos(a) * s, Math.sin(a) * s));
          }
        }
        break;
      case 'erupt': {
        // 每一幀噴出一塊熔岩，方向和當下的重力相反，速度略有不同，連起來像一根熔岩柱
        const d = world.water.downAt(m) ?? { x: 0, y: 1 };
        const s = cfg.ventSpeed * (0.85 + Math.random() * 0.3);
        const side = (Math.random() - 0.5) * 40;
        // 每一幀噴出兩塊（左右各偏一點），凍住時才會是一根夠寬、站得上去的柱子
        for (const off of [-5, 5]) {
          const ox = d.y ? off : 0;
          const oy = d.x ? off : 0;
          world.entities.push(new LavaBlob(this.cx + ox, this.cy + oy, -d.x * s + (d.y ? side * 0.3 : 0), -d.y * s + (d.x ? side * 0.3 : 0)));
        }
        if (this.timer <= 0) { this.state = 'idle'; this.timer = cfg.ventInterval; }
        break;
      }
    }
  }
}

// 液體源：固定在牆上，往遠離牆的方向持續流出熔岩或水。出口被實心封住就會停止。
// 用空氣砲打它可以開關（和火爐一樣）
export class LiquidSource {
  constructor(tx, ty, liquid, on) {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = TILE;
    this.h = TILE;
    this.liquid = liquid; // 'lava' 或 'water'
    this.on = on;
    this.alive = true;
    this.solid = true;
    this.hittable = true;
    this.isSource = true;
    this.dir = null;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    if (!this.dir) {
      const wall = DIRS.find((v) => world.map.isSolid(this.tx + v.x, this.ty + v.y));
      this.dir = wall ? { x: -wall.x, y: -wall.y } : { x: 0, y: 1 };
    }
    if (!this.on) return;
    const ox = this.tx + this.dir.x;
    const oy = this.ty + this.dir.y;
    if (world.map.isSolid(ox, oy)) return; // 出口被封住
    const rate = (this.liquid === 'lava' ? cfg.lavaSourceRate : cfg.waterSourceRate) * dt;
    if (this.liquid === 'lava') world.water.addLava(ox, oy, rate);
    else world.water.add(ox, oy, rate);
  }

  onAirShot(world) {
    this.on = !this.on;
    world.toast(`${this.liquid === 'lava' ? '熔岩源' : '水源'}${this.on ? '開啟' : '關閉'}`);
    world.burst(this.cx, this.cy, this.liquid === 'lava' ? '#ff8a3d' : '#9fd8ff', 8);
  }
}
