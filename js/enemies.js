import { cfg, TILE } from './config.js';
import { Body, approach } from './body.js';
import { Bullet } from './projectiles.js';

class Enemy extends Body {
  constructor(tx, ty, w, h) {
    super(tx * TILE + (TILE - w) / 2, (ty + 1) * TILE - h, w, h);
    this.isEnemy = true;
    this.hittable = true;
    this.hp = 3;
    this.maxHp = 3;
    this.armored = false;
    this.contactDamage = 1;
    this.stunT = 0;
    this.flashT = 0;
    this.time = 1;
  }

  update(world, dt) {
    this.sample(world);
    this.time = this.mods.time;
    const ldt = dt * this.time;
    this.stunT -= ldt;
    this.flashT -= dt;
    this.checkGrounded(world);
    if (ldt > 0) {
      this.think(world, ldt);
      this.physics(world, ldt);
    }
    if (this.touchingSpikes(world) || this.isOutOfBounds()) {
      this.die(world);
      return;
    }
    if (world.overlap(this, world.player)) {
      world.hurtPlayer(this.contactDamage, { fromX: this.cx });
    }
  }

  think() {}

  physics(world, ldt) {
    this.applyGravity(ldt);
    if (this.groundAxis === 'y') this.vy = Math.max(-cfg.maxFall, Math.min(cfg.maxFall, this.vy));
    this.clampVelocity();
    this.lastMove = this.moveByVelocity(world, ldt);
  }

  takeDamage(world, amount, dir) {
    if (!this.armored) {
      this.hp -= amount;
      this.flashT = 0.12;
      if (this.hp <= 0) this.die(world);
    }
    this.vx += (dir.x * cfg.cannonImpulse) / this.mass;
    this.vy += (dir.y * cfg.cannonImpulse) / this.mass;
    this.stunT = 0.3;
  }

  onAirShot(world, dir) {
    this.takeDamage(world, cfg.cannonDamage, dir);
  }

  die(world) {
    if (!this.alive) return;
    this.alive = false;
    world.burst(this.cx, this.cy, this.color, 16);
  }

  // 前方腳下有沒有地面（依當前重力方向）
  groundAhead(world, dir) {
    if (this.groundAxis !== 'y') return true;
    const fx = dir > 0 ? this.x + this.w + 1 : this.x - 1;
    const fy = this.groundSign > 0 ? this.y + this.h + 2 : this.y - 2;
    return world.map.pointSolid(fx, fy);
  }
}

// 步行兵：左右走，碰到牆或懸崖就轉身
export class Walker extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 14, 14);
    this.dir = -1;
    this.speed = 40;
    this.color = '#ff9f43';
  }

  think(world, ldt) {
    if (this.stunT > 0 || !this.grounded || this.groundAxis !== 'y') {
      this.applyFriction(300 * ldt);
      return;
    }
    if (!this.groundAhead(world, this.dir)) this.dir *= -1;
    this.vx = this.dir * this.speed;
  }

  physics(world, ldt) {
    super.physics(world, ldt);
    if (this.lastMove.bx && this.stunT <= 0) this.dir *= -1;
  }
}

// 重裝兵：空氣砲打不動血量，必須用能力把它推進尖刺或坑裡
export class Heavy extends Walker {
  constructor(tx, ty) {
    super(tx, ty);
    this.w = 20;
    this.h = 26;
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.mass = 5;
    this.speed = 22;
    this.armored = true;
    this.contactDamage = 2;
    this.color = '#c0392b';
  }
}

// 跳躍兵：每隔一段時間朝玩家跳過去。低重力時會跳得更高
export class Jumper extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 14, 14);
    this.jumpT = 1.2;
    this.color = '#f1c40f';
  }

  think(world, ldt) {
    if (this.grounded) this.applyFriction(600 * ldt);
    if (this.stunT > 0) return;
    this.jumpT -= ldt;
    if (this.grounded && this.jumpT <= 0 && this.groundAxis === 'y') {
      const dir = Math.sign(world.player.cx - this.cx) || 1;
      this.vy = -this.groundSign * 270;
      this.vx = dir * 70;
      this.jumpT = 1.6;
    }
  }
}

// 飛行兵：自己抵消正常重力。場域讓重力改變時，多出來的部分會把它推離原本的高度
export class Flyer extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 14, 12);
    this.homeY = this.y;
    this.color = '#ff6bcb';
    this.phase = Math.random() * Math.PI * 2;
  }

  physics(world, ldt) {
    this.phase += ldt * 3;
    const ax = this.mods.gx;
    const ay = this.mods.gy - cfg.gravity;
    if (this.stunT <= 0) {
      const target = (Math.sign(world.player.cx - this.cx) || 1) * 35;
      this.vx = approach(this.vx, target, 120 * ldt);
      const wantY = this.homeY + Math.sin(this.phase) * 6;
      this.vy += ((wantY - this.y) * 4 - this.vy * 2) * ldt;
    }
    this.vx += ax * ldt;
    this.vy += ay * ldt;
    this.clampVelocity();
    this.lastMove = this.moveByVelocity(world, ldt);
  }
}

// 砲台：固定不動，朝玩家發射子彈。時間場域會改變它的射速
export class Turret extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 14, 14);
    this.hp = 5;
    this.maxHp = 5;
    this.fireT = 1.5;
    this.color = '#95a5a6';
  }

  physics() {}

  takeDamage(world, amount) {
    this.hp -= amount;
    this.flashT = 0.12;
    if (this.hp <= 0) this.die(world);
  }

  think(world, ldt) {
    this.fireT -= ldt;
    if (this.fireT > 0) return;
    this.fireT = 1.8;
    const p = world.player;
    const dx = p.cx - this.cx;
    const dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > 360) return;
    // 被地形擋住時不射擊
    for (let t = 10; t < d; t += 6) {
      if (world.map.pointSolid(this.cx + (dx / d) * t, this.cy + (dy / d) * t)) return;
    }
    world.entities.push(new Bullet(this.cx + (dx / d) * 8, this.cy + (dy / d) * 8, (dx / d) * 120, (dy / d) * 120));
  }
}
