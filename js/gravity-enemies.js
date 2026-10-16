import { cfg, TILE } from './config.js';
import { approach } from './body.js';
import { Bullet } from './projectiles.js';
import { Enemy, Walker } from './enemies.js';
import { IronBlock } from './objects.js';

// ---------------------------------------------------------------------------
// 重力區的敵人：每一種都有一個要用重力技能才好處理的弱點
// ---------------------------------------------------------------------------

// 重壓兵：很重，空氣砲推不動也打不痛；靠近時會跳起來重踩地面，震波會傷到站在附近地上的玩家。
// 弱點：它怕摔。把它浮起來（反重力撞天花板、減重時跳太高、場域消失時從高處掉下）就會受撞擊傷害
export class Presser extends Walker {
  constructor(tx, ty) {
    super(tx, ty);
    this.w = 18;
    this.h = 18;
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.hp = 4;
    this.maxHp = 4;
    this.mass = 8;
    this.density = 3;
    this.speed = 26;
    this.armored = true;
    this.color = '#7a6a9a';
    this.slamCd = 1.5;
    this.slamming = false;
  }

  think(world, ldt) {
    this.slamCd -= ldt;
    const p = world.player;
    if (this.grounded && this.groundAxis === 'y') {
      if (this.slamming) {
        this.slamming = false;
        this.slamCd = 2.2;
        // 落地震波：站在地上、距離 4 格內的玩家受傷
        world.burst(this.cx, this.groundSign > 0 ? this.y + this.h : this.y, '#c9b8ff', 18);
        if (p.grounded && Math.abs(p.cx - this.cx) < 64 && Math.abs(p.cy - this.cy) < 32) world.hurtPlayer(1, { fromX: this.cx });
      }
      if (this.slamCd <= 0 && this.stunT <= 0 && Math.abs(p.cx - this.cx) < 72 && Math.abs(p.cy - this.cy) < 48) {
        this.vy = -this.groundSign * 300; // 低於撞擊門檻：正常重力下自己落地不會受傷
        this.vx = 0;
        this.slamming = true;
        return;
      }
    }
    if (this.slamming) return;
    if (this.grounded) this.dir = Math.sign(p.cx - this.cx) || this.dir;
    super.think(world, ldt);
  }
}

// 氣球兵：氣球的浮力剛好抵消正常重力，再用小螺旋槳維持高度；飄到玩家正上方時往下丟炸彈。
// 空氣砲打不破（只會被推開）。弱點：重力變小時浮力就贏了——無重力或反重力會讓它一路飄上去，撞到東西就破
export class Balloon extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 14, 18);
    this.y = ty * TILE;
    this.homeY = this.y;
    this.hp = 1;
    this.maxHp = 1;
    this.mass = 3;
    this.armored = true;
    this.contactDamage = 1;
    this.color = '#5fc8a8';
    this.dropT = 1.5;
  }

  physics(world, ldt) {
    const p = world.player;
    // 浮力固定往上（大小等於正常重力），所以實際受力 = 場域重力 - 正常重力
    const ax = this.mods.gx;
    let ay = this.mods.gy - cfg.gravity;
    // 螺旋槳最多出力 500 px/s²：減重（少 450）還撐得住，無重力（少 900）或反重力就撐不住
    if (this.stunT <= 0) {
      const want = (this.homeY - this.y) * 3 - this.vy * 2;
      ay += Math.max(-500, Math.min(500, want));
      this.vx = approach(this.vx, (Math.sign(p.cx - this.cx) || 1) * 30, 60 * ldt);
    }
    this.vx += ax * ldt;
    this.vy += ay * ldt;
    this.applyDrag(ldt);
    this.clampVelocity();
    this.lastMove = this.moveByVelocity(world, ldt);
  }

  think(world, ldt) {
    this.dropT -= ldt;
    const p = world.player;
    if (this.dropT <= 0 && Math.abs(p.cx - this.cx) < 20 && p.cy > this.cy) {
      this.dropT = 1.6;
      world.entities.push(new Bullet(this.cx, this.y + this.h + 4, 0, 150));
    }
  }

  // 氣球很脆弱：撞到牆或天花板的速度超過 150 就破
  onImpact(world, speed) {
    if (speed > 150) {
      world.popup(this.cx, this.y, '破了！', '#9ff0d8');
      this.die(world);
    }
  }

  takeImpact(world, amount) {
    if (amount > 0) this.die(world);
  }

  onAirShot(world, dir) {
    this.vx += (dir.x * cfg.cannonImpulse) / this.mass;
    this.vy += (dir.y * cfg.cannonImpulse) / this.mass;
    this.stunT = 0.3;
    world.popup(this.cx, this.y, '無效', '#9aa7bd');
  }
}

// 倒吊兵：自己的重力是反的，走在天花板上，看到下方的玩家就丟石頭。待在高處，空氣砲打不到。
// 弱點：反重力會讓它的重力變回向下，從天花板摔到地上（場域結束後又會摔回天花板）
export class CeilingWalker extends Walker {
  constructor(tx, ty) {
    super(tx, ty);
    this.y = ty * TILE;
    this.hp = 4;
    this.maxHp = 4;
    this.speed = 30;
    this.color = '#4fb0c6';
    this.throwT = 1.5;
  }

  sample(world) {
    super.sample(world);
    this.mods = { ...this.mods, gx: -this.mods.gx, gy: -this.mods.gy };
    if (this.groundAxis) this.groundSign = -this.groundSign;
  }

  think(world, ldt) {
    super.think(world, ldt);
    this.throwT -= ldt;
    const p = world.player;
    if (this.throwT > 0 || this.stunT > 0 || !this.grounded || this.groundSign > 0) return;
    const dx = p.cx - this.cx;
    const dy = p.cy - this.cy;
    if (dy < 32 || Math.abs(dx) > dy * 0.8) return; // 只丟正下方附近
    this.throwT = 2;
    const d = Math.hypot(dx, dy);
    world.entities.push(new Bullet(this.cx, this.y + this.h + 4, (dx / d) * 140, (dy / d) * 140));
  }
}

// 重力盾兵：身邊有一圈往外推的重力盾，從外面射進來的空氣砲和網會被彈開，走路也擠不進去；它自己不受盾影響。
// 弱點：重力干擾器讓盾失效；在盾上疊一個點重力（吸引）把它抵消；閃現進盾裡面，從裡面近距離打
export class ShieldSoldier extends Walker {
  constructor(tx, ty) {
    super(tx, ty);
    this.hp = 3;
    this.maxHp = 3;
    this.speed = 24;
    this.color = '#9b6bff';
    this.shieldR = 32; // 和玩家的場域一樣大：點重力放在同一個位置就能完整抵消
    this.shieldValue = -2; // 1800 px/s²，比玩家跑步的加速度大，走不進去
    this.fireT = 2;
  }

  think(world, ldt) {
    super.think(world, ldt);
    this.fireT -= ldt;
    if (this.fireT > 0) return;
    this.fireT = 2.5;
    const p = world.player;
    const dx = p.cx - this.cx;
    const dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > 300) return;
    world.entities.push(new Bullet(this.cx + (dx / d) * 10, this.cy + (dy / d) * 10, (dx / d) * 110, (dy / d) * 110));
  }
}

// ---------------------------------------------------------------------------
// 重力魔王：魔王自己提供打倒它的手段——它會轉動整個房間的重力、丟出鐵塊；
// 鐵塊被重力（房間的或玩家的）甩去高速撞它才會受傷。空氣砲在第 1 階段對它無效
// 第 1 階段：浮在房間中央，每隔一段時間轉動重力：下 → 上 → 下 → 左 → 下 → 右（轉向前有預告）。
//   每次都先回到向下，所以「把鐵塊推到它正下方，等重力轉上」一定有機會
export const BOSS_CYCLE = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }];
// 第 2 階段（血量一半以下）：吸到天花板上，重力回到向下，但會定期短暫反轉；這時靠近打它的核心也有效
// ---------------------------------------------------------------------------
const BOSS_DIRS = [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }];
export const BOSS = {
  hp: 12,           // 鐵塊撞一次就碎，所以血量比原本的 18 低
  turnEvery: 6,      // 第 1 階段：每 6 秒轉一次
  warn: 3,           // 轉向前的預告時間（王身上的箭頭轉向下一個方向、倒數 3、2、1）
  flipEvery: 7,      // 第 2 階段：重力向下維持 7 秒
  flipTime: 3,       // 第 2 階段：反轉持續 3 秒
  maxHit: 3,         // 一次撞擊最多扣的血
  blockEvery: 4,     // 每 4 秒丟一個鐵塊
  maxBlocks: 3,
  coreRange: 72,     // 第 2 階段：距離這麼近時，空氣砲才打得到核心（站在最上層平台的內側就打得到）
};

export class GravityBoss extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 32, 32);
    this.x = tx * TILE + TILE / 2 - 16;
    this.y = ty * TILE + TILE / 2 - 16;
    this.homeY = this.y;
    this.isBoss = true;
    this.hp = BOSS.hp;
    this.maxHp = BOSS.hp;
    this.mass = 1000;      // 撞過來的鐵塊會被彈開，魔王不會被撞走
    this.armored = true;
    this.contactDamage = 2;
    this.color = '#a070ff';
    this.phase = 1;
    this.dirIndex = 0;
    this.timer = BOSS.turnEvery;
    this.warnDir = null;   // 預告中的下一個方向（畫面顯示用）
    this.blockT = 2;
    this.fireT = 2.5;
    this.moveT = 0;        // 換階段時移動到天花板的剩餘時間
    this.coreCd = 0;
  }

  update(world, dt) {
    this.sample(world);
    this.time = this.mods.time;
    const ldt = dt * this.time;
    this.flashT -= dt;
    this.impactCd -= dt;
    this.coreCd -= dt;
    this.vx = 0;
    this.vy = 0;
    if (this.moveT > 0) {
      // 換階段：移動到天花板，期間無敵
      this.moveT = Math.max(0, this.moveT - dt);
      const k = 1 - this.moveT / 1.5;
      this.y = this.homeY + (this.ceilingY - this.homeY) * k;
    } else if (ldt > 0) {
      this.think(world, ldt);
    }
    if (world.overlap(this, world.player)) world.hurtPlayer(this.contactDamage, { fromX: this.cx });
  }

  // 重力時鐘（畫面顯示用）：整個循環、目前在第幾個、距離下次轉向的時間與這一段的長度
  clock(world) {
    if (this.phase === 1) return { cycle: BOSS_CYCLE, index: this.dirIndex, timer: this.timer, period: BOSS.turnEvery };
    const flipped = world.fields.base.y < 0;
    return { cycle: [BOSS_DIRS[0], BOSS_DIRS[2]], index: flipped ? 1 : 0, timer: this.timer, period: flipped ? BOSS.flipTime : BOSS.flipEvery };
  }

  setGravity(world, d) {
    world.fields.base = { x: d.x, y: d.y };
    world.burst(this.cx, this.cy, '#c9a8ff', 24);
  }

  think(world, ldt) {
    this.timer -= ldt;
    if (this.phase === 1) {
      const next = BOSS_CYCLE[(this.dirIndex + 1) % BOSS_CYCLE.length];
      this.warnDir = this.timer < BOSS.warn ? next : null;
      if (this.timer <= 0) {
        this.dirIndex = (this.dirIndex + 1) % BOSS_CYCLE.length;
        this.setGravity(world, next);
        this.timer = BOSS.turnEvery;
      }
    } else {
      const flipped = world.fields.base.y < 0;
      const next = flipped ? BOSS_DIRS[0] : BOSS_DIRS[2];
      this.warnDir = this.timer < BOSS.warn ? next : null;
      if (this.timer <= 0) {
        this.setGravity(world, next);
        this.timer = flipped ? BOSS.flipEvery : BOSS.flipTime;
      }
    }

    // 丟鐵塊：從身體側面往玩家那一側丟出，落點在魔王附近，讓玩家有機會把它推到魔王的下方
    this.blockT -= ldt;
    const blocks = world.entities.filter((e) => e.isIron && e.alive).length;
    if (this.blockT <= 0 && blocks < BOSS.maxBlocks) {
      this.blockT = BOSS.blockEvery;
      const side = Math.sign(world.player.cx - this.cx) || 1;
      const b = new IronBlock(0, 0);
      b.x = Math.round(this.cx - 8 + side * 28);
      b.y = Math.round(this.cy - 8);
      if (!world.rectBlocked(b.x, b.y, b.w, b.h, b) && !world.overlap(b, world.player)) {
        b.vx = side * 90;
        world.entities.push(b);
      }
    }

    // 子彈（可以用空氣砲打回去，但魔王有護甲，打回去也不痛）
    this.fireT -= ldt;
    if (this.fireT <= 0) {
      this.fireT = this.phase === 1 ? 2.4 : 1.8;
      const p = world.player;
      const dx = p.cx - this.cx;
      const dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      world.entities.push(new Bullet(this.cx + (dx / d) * 22, this.cy + (dy / d) * 22, (dx / d) * 130, (dy / d) * 130));
    }
  }

  // 撞擊：每次最多扣 BOSS.maxHit；換階段移動中無敵
  takeImpact(world, amount) {
    if (amount <= 0 || this.moveT > 0) return;
    this.hurt(world, Math.min(BOSS.maxHit, amount));
    if (this.alive && this.phase === 1 && this.hp <= this.maxHp / 2) this.enterPhase2(world);
  }

  // 空氣砲：第 1 階段無效；第 2 階段靠近時打得到核心（每 0.5 秒最多 1 點）
  takeDamage(world) {
    const p = world.player;
    if (this.phase === 2 && this.moveT <= 0 && Math.hypot(p.cx - this.cx, p.cy - this.cy) < BOSS.coreRange) {
      if (this.coreCd <= 0) {
        this.coreCd = 0.5;
        this.hurt(world, 1);
      }
      return;
    }
    world.popup(this.cx, this.y, '無效', '#9aa7bd');
  }

  enterPhase2(world) {
    this.phase = 2;
    this.moveT = 1.5;
    this.ceilingY = TILE + 2;
    this.timer = BOSS.flipEvery;
    this.warnDir = null;
    this.setGravity(world, BOSS_DIRS[0]);
    world.toast('重力魔王：第二階段');
  }

  die(world) {
    if (!this.alive) return;
    super.die(world);
    world.fields.base = { x: 0, y: 1 };
    world.toast('打倒了重力魔王！');
    world.burst(this.cx, this.cy, '#ffffff', 40);
  }
}
