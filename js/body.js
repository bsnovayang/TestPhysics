import { cfg, VIEW_H, VIEW_W } from './config.js';

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function approach(value, target, delta) {
  if (value < target) return Math.min(value + delta, target);
  return Math.max(value - delta, target);
}

// 受場域影響、會和地形碰撞的物體（玩家、箱子、敵人）
export class Body {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vx = 0;
    this.vy = 0;
    this.mass = 1;
    this.alive = true;
    this.solid = false;
    this.isBody = true;
    this.mods = { gx: 0, gy: cfg.gravity, time: 1, inField: false };
    this.groundAxis = 'y'; // 'x'、'y'，或 null（無重力）
    this.groundSign = 1;   // 地面在哪一側（+1 為下或右）
    this.grounded = false;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  // 依中心點取得場域參數，並判斷地面方向
  sample(world) {
    this.mods = world.fields.sample(this.cx, this.cy);
    const ax = Math.abs(this.mods.gx);
    const ay = Math.abs(this.mods.gy);
    if (Math.max(ax, ay) < 1) {
      this.groundAxis = null;
    } else if (ay >= ax) {
      this.groundAxis = 'y';
      this.groundSign = Math.sign(this.mods.gy);
    } else {
      this.groundAxis = 'x';
      this.groundSign = Math.sign(this.mods.gx);
    }
  }

  applyGravity(ldt) {
    this.vx += this.mods.gx * ldt;
    this.vy += this.mods.gy * ldt;
    this.applyDrag(ldt);
  }

  // 只削減「逆著場域重力」的速度：順著重力衝出去不受影響（電梯保有衝力），
  // 掉回場域時才會被減速，所以來回彈跳會一次比一次小，最後穩定漂浮
  applyDrag(ldt) {
    if (!this.mods.drag) return;
    const g = Math.hypot(this.mods.gx, this.mods.gy);
    if (g < 1) return;
    const ux = this.mods.gx / g;
    const uy = this.mods.gy / g;
    const along = this.vx * ux + this.vy * uy;
    if (along >= 0) return;
    const cut = along * (1 - Math.exp(-this.mods.drag * ldt));
    this.vx -= ux * cut;
    this.vy -= uy * cut;
  }

  clampVelocity() {
    const m = cfg.maxSpeed;
    this.vx = Math.max(-m, Math.min(m, this.vx));
    this.vy = Math.max(-m, Math.min(m, this.vy));
  }

  tryOffset(world, axis, d) {
    return axis === 'x'
      ? world.rectBlocked(this.x + d, this.y, this.w, this.h, this)
      : world.rectBlocked(this.x, this.y + d, this.w, this.h, this);
  }

  // 沿單一軸移動，每次最多 1 px，避免穿牆。被擋住時回傳擋住的東西（'tile' 或物件）
  moveAxis(world, axis, amount) {
    if (amount === 0) return null;
    const s = Math.sign(amount);
    let rem = Math.abs(amount);
    while (rem > 1e-6) {
      const step = Math.min(rem, 1);
      const blocker = this.tryOffset(world, axis, s * step);
      if (blocker) {
        // 被擋住時，用越來越小的距離貼近牆面
        for (let sub = step / 2; sub > 0.06; sub /= 2) {
          if (!this.tryOffset(world, axis, s * sub)) this[axis] += s * sub;
        }
        return blocker;
      }
      this[axis] += s * step;
      rem -= step;
    }
    return null;
  }

  // 依當前速度移動，被擋住的軸向速度歸零。回傳 x、y 的擋住物
  moveByVelocity(world, ldt) {
    const bx = this.moveAxis(world, 'x', this.vx * ldt);
    if (bx) this.vx = 0;
    const by = this.moveAxis(world, 'y', this.vy * ldt);
    if (by) this.vy = 0;
    return { bx, by };
  }

  checkGrounded(world) {
    if (!this.groundAxis) {
      this.grounded = false;
      this.groundBody = null;
      return false;
    }
    const blocker = this.tryOffset(world, this.groundAxis, this.groundSign * 0.5);
    this.grounded = !!blocker;
    this.groundBody = blocker && blocker !== 'tile' ? blocker : null;
    return this.grounded;
  }

  // 地面摩擦：沿著地面方向減速
  applyFriction(amount) {
    if (!this.grounded) return;
    if (this.groundAxis === 'y') this.vx = approach(this.vx, 0, amount);
    else if (this.groundAxis === 'x') this.vy = approach(this.vy, 0, amount);
  }

  isOutOfBounds() {
    return this.y > VIEW_H + 48 || this.y + this.h < -48 || this.x > VIEW_W + 48;
  }

  touchingSpikes(world, inset = 2) {
    return world.map.rectSpikes(this.x + inset, this.y + inset, this.w - inset * 2, this.h - inset * 2);
  }
}
