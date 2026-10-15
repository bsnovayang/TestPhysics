import { cfg } from './config.js';
import { Field } from './fields.js';

const WEB_STEP = 4;

// 網：朝目標直線飛行，到達目標或碰到東西時展開場域。飛行中不受場域影響。
// 擊中箱子或敵人時，場域會附著在對方身上。
export class Web {
  constructor(x, y, tx, ty, skillId, dir) {
    this.x = x;
    this.y = y;
    this.tx = tx;
    this.ty = ty;
    this.skillId = skillId;
    this.dir = dir;
    this.alive = true;
  }

  update(world, dt) {
    let remaining = cfg.webSpeed * dt;
    while (remaining > 0) {
      const dx = this.tx - this.x;
      const dy = this.ty - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) return this.expand(world);
      const step = Math.min(WEB_STEP, remaining, dist);
      const nx = this.x + (dx / dist) * step;
      const ny = this.y + (dy / dist) * step;
      if (world.map.pointSolid(nx, ny)) return this.expand(world);
      const hit = world.hitTest(nx, ny, 2);
      if (hit) return this.expand(world, hit.isBody ? hit : null);
      this.x = nx;
      this.y = ny;
      remaining -= step;
    }
  }

  expand(world, target = null) {
    const x = target ? target.cx : this.x;
    const y = target ? target.cy : this.y;
    world.fields.add(new Field(x, y, this.skillId, this.dir, target));
    world.burst(x, y, '#ffffff', 10);
    this.alive = false;
  }
}

// 空氣砲：傷害低、擊退中等。會受時間場域影響。
export class AirShot {
  constructor(x, y, dx, dy) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.traveled = 0;
    this.alive = true;
  }

  update(world, dt) {
    const m = world.fields.sample(this.x, this.y);
    const dist = cfg.cannonSpeed * dt * m.time;
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 0; i < steps; i++) {
      const nx = this.x + (this.dx * dist) / steps;
      const ny = this.y + (this.dy * dist) / steps;
      if (world.map.pointSolid(nx, ny)) {
        world.burst(this.x, this.y, '#cfe8ff', 4);
        this.alive = false;
        return;
      }
      const hit = world.hitTest(nx, ny, 3, true);
      if (hit) {
        hit.onAirShot(world, { x: this.dx, y: this.dy });
        world.burst(nx, ny, '#cfe8ff', 6);
        this.alive = false;
        return;
      }
      this.x = nx;
      this.y = ny;
    }
    this.traveled += dist;
    if (this.traveled > cfg.cannonRange) this.alive = false;
  }
}

// 敵人的子彈。被時停時會變成可以踩的實心物體；被空氣砲打到會反彈，變成我方子彈。
export class Bullet {
  constructor(x, y, vx, vy) {
    this.w = 6;
    this.h = 6;
    this.x = x - 3;
    this.y = y - 3;
    this.vx = vx;
    this.vy = vy;
    this.life = 6;
    this.alive = true;
    this.solid = false;
    this.hittable = true;
    this.isBullet = true;
    this.friendly = false;
    this.time = 1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    const m = world.fields.sample(this.cx, this.cy);
    this.time = m.time;
    this.solid = m.time < 0.05;
    const ldt = dt * m.time;
    this.x += this.vx * ldt;
    this.y += this.vy * ldt;
    this.life -= ldt;
    if (this.life <= 0 || world.map.rectSolid(this.x, this.y, this.w, this.h)) {
      this.alive = false;
      return;
    }
    if (this.solid) return;
    if (this.friendly) {
      const enemy = world.entities.find((e) => e.isEnemy && e.alive && world.overlap(this, e));
      if (enemy) {
        enemy.takeDamage(world, 2, { x: Math.sign(this.vx), y: Math.sign(this.vy) });
        this.alive = false;
      }
    } else if (world.overlap(this, world.player)) {
      world.hurtPlayer(1, { fromX: this.cx });
      this.alive = false;
    }
  }

  onAirShot(world, dir) {
    const speed = Math.max(120, Math.hypot(this.vx, this.vy)) * 1.5;
    this.vx = dir.x * speed;
    this.vy = dir.y * speed;
    this.friendly = true;
  }
}
