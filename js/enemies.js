import { cfg, TILE } from './config.js';
import { Body, approach, impactDamage } from './body.js';
import { Bullet } from './projectiles.js';
import { traceBeam, applyBeamHit } from './light.js';

export class Enemy extends Body {
  constructor(tx, ty, w, h) {
    super(tx * TILE + (TILE - w) / 2, (ty + 1) * TILE - h, w, h);
    this.isEnemy = true;
    this.hittable = true;
    this.hp = 3;
    this.maxHp = 3;
    this.armored = false;       // 空氣砲打不痛
    this.impactImmune = false;  // 不怕撞擊
    this.contactDamage = 1;
    this.stunT = 0;
    this.flashT = 0;
    this.impactCd = 0;          // 物體互撞後的短暫冷卻，避免重疊時每幀重複受傷
    this.laserCd = 0;           // 被雷射打到後的短暫冷卻
    this.density = 1.3;         // 一般敵人會沉入水中
    this.time = 1;
    this.ally = false;          // 被洗腦，變成自己人
    this.contactCd = 0;         // 和其他敵人（或自己人）互撞造成接觸傷害的冷卻
  }

  // 目前的對手：自己人找最近的敵人（下了移動指令時不找）；敵人找玩家或自己人中最近的
  foe(world) {
    if (this.ally) return world.allyOrder ? null : world.nearestHostile(this, cfg.allySight);
    return world.nearestTarget(this);
  }

  // 攻擊對象：自己人打敵人（魔王除外）；敵人打玩家和自己人
  victims(world) {
    if (this.ally) return world.entities.filter((e) => e.isEnemy && e.alive && !e.ally && !e.isBoss);
    return [world.player, ...world.allies()];
  }

  // 對某個對象造成傷害：玩家走受傷流程，其他直接扣血並擊退（有護甲的照樣不痛）
  strike(world, target, amount) {
    if (target === world.player) { world.hurtPlayer(amount, { fromX: this.cx }); return; }
    target.takeDamage(world, amount, { x: Math.sign(target.cx - this.cx) || 1, y: -0.3 });
  }

  // 自己人沒有對手時：走到指令的位置，或跟著玩家
  allyGoal(world) {
    if (world.allyOrder) return { cx: world.allyOrder.x, cy: world.allyOrder.y, stop: 4 };
    return { cx: world.player.cx, cy: world.player.cy, stop: 36 };
  }

  // 自己人的走路：朝對手或目標走，靠近就停
  allyWalk(world, ldt) {
    if (this.stunT > 0 || !this.grounded || this.groundAxis !== 'y') {
      this.applyFriction(300 * ldt);
      return;
    }
    const f = this.foe(world);
    const goal = f ? { cx: f.cx, stop: 2 } : this.allyGoal(world);
    const dx = goal.cx - this.cx;
    if (Math.abs(dx) <= goal.stop) { this.applyFriction(600 * ldt); return; }
    this.dir = Math.sign(dx);
    this.vx = this.dir * this.speed;
  }

  update(world, dt) {
    this.sample(world);
    this.time = this.mods.time;
    const ldt = dt * this.time;
    this.stunT -= ldt;
    this.flashT -= dt;
    this.impactCd -= dt;
    this.laserCd -= dt;
    this.checkGrounded(world);
    if (ldt > 0) {
      this.think(world, ldt);
      this.physics(world, ldt);
    }
    if (this.touchingSpikes(world) || this.touchingLava(world) || this.isOutOfBounds()) {
      this.die(world);
      return;
    }
    // 接觸傷害：敵人撞到玩家或自己人、自己人撞到敵人
    this.contactCd -= dt;
    for (const v of this.victims(world)) {
      if (!world.overlap(this, v)) continue;
      if (v === world.player) { world.hurtPlayer(this.contactDamage, { fromX: this.cx }); continue; }
      if (this.contactCd > 0) continue;
      this.contactCd = 0.6;
      this.strike(world, v, this.contactDamage);
    }
  }

  think() {}

  physics(world, ldt) {
    this.applyGravity(ldt);
    this.applyWater(world, ldt);
    if (this.groundAxis === 'y') this.vy = Math.max(-cfg.maxFall, Math.min(cfg.maxFall, this.vy));
    this.clampVelocity();
    this.lastMove = this.moveByVelocity(world, ldt);
  }

  // 撞到牆或地面
  onImpact(world, speed) {
    this.takeImpact(world, impactDamage(speed));
  }

  takeImpact(world, amount) {
    if (amount <= 0) return;
    if (this.impactImmune) {
      world.popup(this.cx, this.y, '免疫', '#9aa7bd');
      return;
    }
    this.hurt(world, amount);
  }

  hurt(world, amount) {
    this.hp -= amount;
    this.flashT = 0.12;
    world.popup(this.cx, this.y, `-${amount}`, '#ff8a8a');
    if (this.hp <= 0) this.die(world);
  }

  takeDamage(world, amount, dir) {
    if (!this.armored) this.hurt(world, amount);
    this.vx += (dir.x * cfg.cannonImpulse) / this.mass;
    this.vy += (dir.y * cfg.cannonImpulse) / this.mass;
    this.stunT = 0.3;
  }

  // 打到自己人：只會推開，不會受傷
  onAirShot(world, dir) {
    if (this.ally) {
      this.vx += (dir.x * cfg.cannonImpulse) / this.mass;
      this.vy += (dir.y * cfg.cannonImpulse) / this.mass;
      return;
    }
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
    if (this.ally) { this.allyWalk(world, ldt); return; }
    if (this.stunT > 0 || !this.grounded || this.groundAxis !== 'y') {
      this.applyFriction(300 * ldt);
      return;
    }
    if (!this.groundAhead(world, this.dir)) this.dir *= -1;
    this.vx = this.dir * this.speed;
  }

  physics(world, ldt) {
    super.physics(world, ldt);
    if (this.lastMove.bx && this.stunT <= 0 && !this.ally) this.dir *= -1;
  }
}

// 雷射兵：巡邏，看到玩家就停下來集氣（前段追蹤玩家、最後一段鎖定方向），然後發射雷射。
// 雷射射程無限，直到被擋住；會被鏡子反射、穿過傳送門、被重力彎曲、被時間場域折射，也會打傷其他敵人
export class LaserEnemy extends Walker {
  constructor(tx, ty) {
    super(tx, ty);
    this.speed = 28;
    this.color = '#e84393';
    this.state = 'patrol';
    this.timer = 0;
    this.aim = { x: 1, y: 0 };
  }

  get eye() {
    return { x: this.cx, y: this.cy - 2 };
  }

  canSee(world, target) {
    const e = this.eye;
    const dx = target.cx - e.x;
    const dy = target.cy - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 360) return false;
    for (let t = 8; t < d; t += 6) {
      if (world.map.pointSolid(e.x + (dx / d) * t, e.y + (dy / d) * t)) return false;
    }
    return true;
  }

  aimAt(target) {
    const e = this.eye;
    const d = Math.hypot(target.cx - e.x, target.cy - e.y) || 1;
    this.aim = { x: (target.cx - e.x) / d, y: (target.cy - e.y) / d };
  }

  think(world, ldt) {
    const p = this.foe(world);
    this.timer += ldt;
    switch (this.state) {
      case 'patrol':
        super.think(world, ldt);
        if (p && this.timer > cfg.laserCooldown && this.stunT <= 0 && this.canSee(world, p)) {
          this.state = 'charge';
          this.timer = 0;
        }
        return;
      case 'charge':
        this.applyFriction(600 * ldt);
        if (p && this.timer < cfg.laserCharge - cfg.laserLock) this.aimAt(p);
        this.emit(world, 'telegraph');
        if (this.timer >= cfg.laserCharge) { this.state = 'fire'; this.timer = 0; }
        return;
      case 'fire': {
        this.applyFriction(600 * ldt);
        const beam = this.emit(world, 'laser');
        applyBeamHit(world, beam.hit, cfg.laserDamage, this.cx, beam.heats);
        if (this.timer >= cfg.laserFire) { this.state = 'patrol'; this.timer = 0; }
      }
    }
  }

  // 被擊退時打斷集氣
  takeDamage(world, amount, dir) {
    super.takeDamage(world, amount, dir);
    if (this.state === 'charge') { this.state = 'patrol'; this.timer = 0; }
  }

  emit(world, kind) {
    const e = this.eye;
    // 自己人的雷射不會打到玩家
    const beam = traceBeam(world, e.x + this.aim.x * 8, e.y + this.aim.y * 8, this.aim.x, this.aim.y, this, !this.ally);
    const locked = kind === 'telegraph' && this.timer >= cfg.laserCharge - cfg.laserLock;
    world.beams.push({ segments: beam.segments, kind: locked ? 'locked' : kind });
    return beam;
  }
}

// 重裝兵：空氣砲打不痛、也不怕撞擊，只能推進尖刺或坑裡。但它很重，被甩去撞別人時傷害很高
export class Heavy extends Walker {
  constructor(tx, ty) {
    super(tx, ty);
    this.w = 20;
    this.h = 26;
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.mass = 5;
    this.density = 3;
    this.isMetal = true; // 磁力吸得到
    this.speed = 22;
    this.armored = true;
    this.impactImmune = true;
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
      const t = this.foe(world) ?? (this.ally ? this.allyGoal(world) : world.player);
      if (this.ally && !this.foe(world) && Math.abs(t.cx - this.cx) < t.stop) return; // 自己人到了目標就不跳
      const dir = Math.sign(t.cx - this.cx) || 1;
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
    this.phase = (tx * 1.7 + ty * 0.9) % (Math.PI * 2); // 依位置決定，不用亂數（結果才會每次相同）
  }

  physics(world, ldt) {
    this.phase += ldt * 3;
    const ax = this.mods.gx;
    const ay = this.mods.gy - cfg.gravity;
    if (this.stunT <= 0) {
      const t = this.foe(world) ?? (this.ally ? this.allyGoal(world) : world.player);
      const target = Math.abs(t.cx - this.cx) < 6 ? 0 : (Math.sign(t.cx - this.cx) || 1) * 35;
      this.vx = approach(this.vx, target, 120 * ldt);
      const wantY = this.homeY + Math.sin(this.phase) * 6;
      this.vy += ((wantY - this.y) * 4 - this.vy * 2) * ldt;
    }
    this.vx += ax * ldt;
    this.vy += ay * ldt;
    this.applyDrag(ldt);
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

  // 砲台固定不動：會受傷，但不會被擊退
  takeDamage(world, amount) {
    this.hurt(world, amount);
  }

  think(world, ldt) {
    this.fireT -= ldt;
    if (this.fireT > 0) return;
    this.fireT = 1.8;
    const p = this.foe(world);
    if (!p) return;
    const dx = p.cx - this.cx;
    const dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > 360) return;
    // 被地形擋住時不射擊
    for (let t = 10; t < d; t += 6) {
      if (world.map.pointSolid(this.cx + (dx / d) * t, this.cy + (dy / d) * t)) return;
    }
    const b = new Bullet(this.cx + (dx / d) * 8, this.cy + (dy / d) * 8, (dx / d) * 120, (dy / d) * 120);
    b.friendly = this.ally;
    world.entities.push(b);
  }
}
