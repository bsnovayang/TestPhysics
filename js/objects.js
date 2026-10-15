import { cfg, TILE } from './config.js';
import { Body, rectsOverlap } from './body.js';

// 可以推的箱子。key = true 時是鑰匙箱，只有它能啟動鎖開關。
export class Box extends Body {
  constructor(tx, ty, key = false) {
    super(tx * TILE, ty * TILE, TILE, TILE);
    this.key = key;
    this.solid = true;
    this.pushable = true;
    this.hittable = true;
    this.pushV = 0;
  }

  update(world, dt) {
    this.sample(world);
    const ldt = dt * this.mods.time;
    if (ldt > 0) {
      this.applyGravity(ldt);
      const pushed = this.pushV && this.groundAxis !== 'x';
      if (pushed) this.vx = this.pushV;
      else this.applyFriction(cfg.boxFriction * ldt);
      this.clampVelocity();
      const { bx } = this.moveByVelocity(world, ldt);
      // 推動排在一起的箱子
      if (pushed && bx && bx.pushable) bx.pushV = this.pushV;
    }
    this.pushV = 0;
    this.checkGrounded(world);
    if (this.isOutOfBounds()) this.alive = false;
  }

  // 時停中被打到時，速度會先累積，時間恢復後才一次釋放
  onAirShot(world, dir) {
    this.vx += (dir.x * cfg.cannonImpulse) / this.mass;
    this.vy += (dir.y * cfg.cannonImpulse) / this.mass;
  }
}

// 左右移動的平台（實心），會載著站在上面的物體一起移動。碰到牆或 '|' 標記時折返。
export class MovingPlatform {
  constructor(tx, ty, widthTiles) {
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = widthTiles * TILE;
    this.h = 8;
    this.dir = 1;
    this.speed = 80;
    this.solid = true;
    this.alive = true;
    this.time = 1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    this.time = world.fields.sample(this.cx, this.cy).time;
    const dx = this.dir * this.speed * dt * this.time;
    if (dx === 0) return;
    if (world.map.rectPlatformStop(this.x + dx, this.y, this.w, this.h)) {
      this.dir *= -1;
      return;
    }
    const riders = world.bodies().filter(
      (b) => b !== this && Math.abs(b.y + b.h - this.y) < 1 && b.x < this.x + this.w && b.x + b.w > this.x,
    );
    this.x += dx;
    for (const r of riders) r.moveAxis(world, 'x', dx);
  }
}

// 旋轉刀片：以中心旋轉的長棒，碰到會受傷
export class Blade {
  constructor(tx, ty) {
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
    this.len = 40;
    this.angle = 0;
    this.speed = 2.2;
    this.alive = true;
    this.time = 1;
  }

  get cx() { return this.x; }
  get cy() { return this.y; }

  update(world, dt) {
    this.time = world.fields.sample(this.x, this.y).time;
    this.angle += this.speed * dt * this.time;
    const p = world.player;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    for (let k = -this.len; k <= this.len; k += 4) {
      const px = this.x + c * k;
      const py = this.y + s * k;
      if (px > p.x - 2 && px < p.x + p.w + 2 && py > p.y - 2 && py < p.y + p.h + 2) {
        world.hurtPlayer(2, { fromX: this.x });
        break;
      }
    }
  }
}

// 壓碎機關：在上方等待 → 快速落下 → 停一下 → 升回原位
export class Crusher {
  constructor(tx, ty, widthTiles) {
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.homeY = this.y;
    this.w = widthTiles * TILE;
    this.h = TILE;
    this.state = 'wait';
    this.timer = 1;
    this.vy = 0;
    this.alive = true;
    this.time = 1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    this.time = world.fields.sample(this.cx, this.cy).time;
    const ldt = dt * this.time;
    switch (this.state) {
      case 'wait':
        this.timer -= ldt;
        if (this.timer <= 0) { this.state = 'fall'; this.vy = 0; }
        break;
      case 'fall':
        this.vy = Math.min(this.vy + 1400 * ldt, 520);
        this.y += this.vy * ldt;
        if (world.map.rectSolid(this.x, this.y, this.w, this.h)) {
          this.y = Math.floor((this.y + this.h) / TILE) * TILE - this.h;
          this.state = 'bottom';
          this.timer = 0.6;
          world.burst(this.cx, this.y + this.h, '#999999', 8);
        }
        break;
      case 'bottom':
        this.timer -= ldt;
        if (this.timer <= 0) this.state = 'rise';
        break;
      case 'rise':
        this.y -= 160 * ldt;
        if (this.y <= this.homeY) { this.y = this.homeY; this.state = 'wait'; this.timer = 0.8; }
        break;
    }
    if (world.overlap(this, world.player)) world.hurtPlayer(2, { fromX: this.cx });
  }
}

// 開關。kind = 'lock'：只對鑰匙箱有反應；kind = 'plate'：任何有重量的物體都可以
export class Switch {
  constructor(tx, ty, kind) {
    this.tx = tx;
    this.ty = ty;
    this.kind = kind;
    this.x = tx * TILE + 1;
    this.y = ty * TILE + 12;
    this.w = TILE - 2;
    this.h = 4;
    this.pressed = false;
  }

  update(world) {
    const candidates = this.kind === 'lock'
      ? world.entities.filter((e) => e instanceof Box && e.key && e.alive)
      : world.bodies();
    this.pressed = candidates.some((b) => rectsOverlap(this, b));
  }
}
