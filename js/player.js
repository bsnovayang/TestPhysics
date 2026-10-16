import { cfg, TILE, VIEW_W, VIEW_H, SLOT_KEYS, STEP } from './config.js';
import { Body, approach } from './body.js';
import { AirShot } from './projectiles.js';

const PUSH_RATIO = 0.6;

export class Player extends Body {
  constructor() {
    super(0, 0, 12, 28);
    this.isPlayer = true;
    this.hp = cfg.hp;
    this.mp = cfg.mpMax;
    this.facing = 1;
    this.coyoteT = 0;
    this.bufferT = 0;
    this.dashT = 0;
    this.dashDir = 1;
    this.dashCd = 0;
    this.airDashUsed = false;
    this.invT = 0;
    this.stunT = 0; // 受傷硬直：期間不接受移動輸入
    this.density = 1.03; // 不游的話會在水中慢慢下沉（約 5 秒沉到 4 格深的池底）
    this.swimCd = 0;
    this.hasteT = 0;
    this.cannonCd = 0;
    this.timeScale = 1;
  }

  respawn(spawn) {
    this.x = spawn.tx * TILE + (TILE - this.w) / 2;
    this.y = (spawn.ty + 1) * TILE - this.h;
    this.vx = 0;
    this.vy = 0;
    this.dashT = 0;
    this.hasteT = 0;
    this.invT = cfg.invulnTime;
    this.groundAxis = 'y';
    this.groundSign = 1;
  }

  // 空氣砲與網的發射點（肩膀），會隨重力方向翻轉
  shoulder() {
    const up = this.groundAxis === 'y' ? -this.groundSign : -1;
    return { x: this.cx, y: this.cy + up * 4 };
  }

  update(world, dt) {
    const input = world.input;
    this.sample(world);

    const hasted = this.hasteT > 0 && !world.fields.jammedAt(this.cx, this.cy, 'time');
    let t = this.mods.time * (hasted ? 2 : 1);
    t = Math.min(Math.max(t, cfg.playerMinTime), cfg.maxTimeScale);
    this.timeScale = t;
    const ldt = dt * t;

    this.checkGrounded(world);
    if (this.grounded) {
      this.coyoteT = cfg.coyoteTime;
      this.airDashUsed = false;
    } else {
      this.coyoteT -= ldt;
    }

    // 方向輸入：重力向下或向上時用 A/D；重力朝側面時改用 W/S 沿牆面移動
    const inX = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const inY = (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0);

    // 面向游標
    const dxMouse = world.mouse.x - this.cx;
    if (Math.abs(dxMouse) > 1) this.facing = Math.sign(dxMouse);

    // 游泳：在水中可以一直按跳躍往上游（方向和當下的重力相反）
    this.swimCd -= dt;
    if (input.wasPressed('Space') && this.submerged > 0.3 && this.swimCd <= 0 && this.stunT <= 0 && this.groundAxis) {
      if (this.groundAxis === 'y') this.vy = -this.groundSign * cfg.swimSpeed;
      else this.vx = -this.groundSign * cfg.swimSpeed;
      this.swimCd = cfg.swimCooldown;
    }

    // 跳躍（起跳速度固定，以正常重力換算）
    if (input.wasPressed('Space')) this.bufferT = cfg.jumpBuffer;
    else this.bufferT -= ldt;
    if (this.bufferT > 0 && this.coyoteT > 0 && this.groundAxis && this.stunT <= 0) {
      // 補上逐步積分損失的高度（g·dt/2），再多留一點餘裕，確保剛好 N 格高的台階跳得上去
      const v0 = Math.sqrt(2 * cfg.gravity * (cfg.jumpHeight + 0.15) * TILE) + (cfg.gravity * STEP) / 2;
      if (this.groundAxis === 'y') this.vy = -this.groundSign * v0;
      else this.vx = -this.groundSign * v0;
      this.bufferT = 0;
      this.coyoteT = 0;
      this.grounded = false;
    }

    // 衝刺（空中只能一次）
    this.dashCd -= dt;
    if (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight')) {
      if (this.dashCd <= 0 && this.stunT <= 0 && (this.grounded || !this.airDashUsed)) {
        this.dashT = cfg.dashTime;
        this.dashDir = inX || this.facing;
        this.dashCd = cfg.dashCooldown;
        if (!this.grounded) this.airDashUsed = true;
      }
    }

    this.stunT -= dt;
    if (this.dashT > 0) {
      this.dashT -= ldt;
      this.vx = this.dashDir * cfg.dashSpeed;
      if (!this.grounded) this.vy = 0;
    } else {
      if (this.stunT <= 0) this.applyControl(inX, inY, ldt, this.onIce(world) ? cfg.iceFriction : 1);
      this.applyGravity(ldt);
      this.applyWater(world, ldt);
    }

    // 沿重力方向的終端速度
    if (this.groundAxis === 'y') {
      this.vy = Math.max(-cfg.maxFall, Math.min(cfg.maxFall, this.vy));
    }
    this.clampVelocity();

    // 移動，推箱子
    const bx = this.moveAxis(world, 'x', this.vx * ldt);
    if (bx) {
      if (bx.pushable && inX !== 0 && this.groundAxis === 'y') {
        bx.pushV = inX * cfg.runSpeed * PUSH_RATIO;
        this.vx = bx.pushV;
      } else {
        this.vx = 0;
      }
    }
    const by = this.moveAxis(world, 'y', this.vy * ldt);
    if (by) this.vy = 0;

    // 計時器（真實時間）
    this.invT -= dt;
    this.hasteT -= dt;
    this.cannonCd -= dt;
    if (!world.fields.channeling && !world.grab) this.mp = Math.min(cfg.mpMax, this.mp + cfg.mpRegen * dt);

    this.handleActions(world);
    this.checkHazards(world);
  }

  // grip：地面抓地力倍率（冰面上很低，會滑）
  applyControl(inX, inY, ldt, grip = 1) {
    const axis = this.groundAxis;
    if (axis === 'y') {
      const accel = this.grounded ? cfg.groundAccel * grip : cfg.airAccel;
      this.vx = approach(this.vx, inX * cfg.runSpeed, accel * ldt);
    } else if (axis === 'x') {
      const accel = this.grounded ? cfg.groundAccel * grip : cfg.airAccel;
      this.vy = approach(this.vy, inY * cfg.runSpeed, accel * ldt);
    } else if (inX !== 0) {
      // 無重力：只有按方向鍵時才施力，不會自動減速，可以用空氣砲的後座力推進
      this.vx = approach(this.vx, inX * cfg.runSpeed, cfg.airAccel * 0.5 * ldt);
    }
  }

  handleActions(world) {
    const input = world.input;

    // 空氣砲（按住連射）
    if (input.isDown('Mouse0') && this.cannonCd <= 0) {
      const o = this.shoulder();
      let dx = world.mouse.x - o.x;
      let dy = world.mouse.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.001) { dx = this.facing; dy = 0; } else { dx /= d; dy /= d; }
      world.projectiles.push(new AirShot(o.x + dx * 6, o.y + dy * 6, dx, dy));
      this.vx -= dx * cfg.recoil;
      this.vy -= dy * cfg.recoil;
      this.cannonCd = 1 / cfg.cannonRate;
    }

    // 技能欄
    SLOT_KEYS.forEach((slot, i) => {
      if (input.wasPressed(slot.code)) world.castSkill(i, slot.code);
    });

    // 解除所有場域
    if (input.wasPressed('KeyX') || input.wasPressed('Mouse1')) {
      if (world.fields.list.length) world.toast('解除所有場域');
      world.fields.clear();
    }
  }

  checkHazards(world) {
    if (this.x > VIEW_W) {
      world.requestRoom(world.roomIndex + 1);
      return;
    }
    if (this.y > VIEW_H + 32 || this.y + this.h < -32) {
      world.hurtPlayer(2, { respawn: true });
      return;
    }
    if (this.touchingSpikes(world, 3) || this.touchingLava(world)) {
      world.hurtPlayer(2, { respawn: true });
    }
  }
}
