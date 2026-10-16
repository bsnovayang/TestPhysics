import { cfg } from './config.js';
import { Field } from './fields.js';
import { SKILLS } from './skills.js';

const WEB_STEP = 4;
// 重力盾：從盾外飛進來的網和空氣砲會被彈開（沿盾的推力方向反射）。
// 在盾裡面發射的不受影響；推力被玩家的點重力抵消到剩不到一半時也不會彈開
const SHIELD_MIN_RATIO = 0.5;

// 回傳反射後的單位方向；不用反射時回傳 null。started：這發是不是在盾裡面發射的
function bounceByShield(world, x, y, dx, dy, startedInside) {
  if (startedInside) return null;
  const push = world.fields.shieldPush(x, y, { skipAlly: true }); // 自己人的盾不擋玩家的網和空氣砲
  if (!push) return null;
  const m = Math.hypot(push.x, push.y);
  if (m < push.shield * SHIELD_MIN_RATIO) return null;
  const nx = push.x / m;
  const ny = push.y / m;
  const dot = dx * nx + dy * ny;
  if (dot >= 0) return null; // 已經在往外飛
  world.burst(x, y, '#c9a8ff', 4);
  return { x: dx - 2 * dot * nx, y: dy - 2 * dot * ny };
}

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

  get isPortal() {
    return SKILLS[this.skillId].type === 'portal';
  }

  update(world, dt) {
    let remaining = cfg.webSpeed * dt;
    while (remaining > 0) {
      const dx = this.tx - this.x;
      const dy = this.ty - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) return this.arrive(world);
      const step = Math.min(WEB_STEP, remaining, dist);
      // 被重力盾彈開：方向改變，剩下的距離不變
      if (this.startedInside === undefined) this.startedInside = !!world.fields.shieldPush(this.x, this.y, { skipAlly: true });
      const bent = bounceByShield(world, this.x, this.y, dx / dist, dy / dist, this.startedInside);
      if (bent) {
        this.tx = this.x + bent.x * dist;
        this.ty = this.y + bent.y * dist;
        this.dir = bent;
      }
      const ux = bent ? bent.x : dx / dist;
      const uy = bent ? bent.y : dy / dist;
      const nx = this.x + ux * step;
      const ny = this.y + uy * step;

      // 一般的網可以穿過傳送門，從出口繼續飛完剩下的距離
      if (!this.isPortal) {
        const cross = world.portals.crossSegment(this.x, this.y, nx, ny);
        if (cross) {
          const d = cross.rotate(dx / dist, dy / dist);
          const left = dist - step;
          this.x = cross.x;
          this.y = cross.y;
          this.tx = this.x + d.x * left;
          this.ty = this.y + d.y * left;
          remaining -= step;
          continue;
        }
      }

      if (world.map.pointSolid(nx, ny)) return this.hitWall(world, nx, ny);
      const hit = world.hitTest(nx, ny, 2);
      if (hit) return this.isPortal ? this.fail(world, '傳送門要開在牆面上') : this.expand(world, hit.isBody ? hit : null);
      this.x = nx;
      this.y = ny;
      remaining -= step;
    }
  }

  arrive(world) {
    if (this.isPortal) return this.fail(world, '傳送門要開在牆面上');
    this.expand(world);
  }

  hitWall(world, hx, hy) {
    if (!this.isPortal) return this.expand(world);
    const result = world.portals.place(world, this.x, this.y, hx, hy);
    if (result.error) return this.fail(world, result.error);
    world.burst(this.x, this.y, result.portal.color, 12);
    this.alive = false;
  }

  fail(world, message) {
    world.toast(message);
    world.refundSkill();
    world.burst(this.x, this.y, '#888888', 6);
    this.alive = false;
  }

  expand(world, target = null) {
    // 洗腦：打中敵人就控制它；打中地面（或自己人以外的地方）就命令自己人走過去
    if (SKILLS[this.skillId].type === 'charm') {
      if (target?.isEnemy) world.charm(target);
      else world.commandAllies(this.x, this.y);
      this.alive = false;
      return;
    }
    // 時間倒轉：一定要打中物體
    if (SKILLS[this.skillId].type === 'rewind') {
      if (!target) return this.fail(world, '時間倒轉要瞄準物體');
      world.startRewind(target);
      this.alive = false;
      return;
    }
    const x = target ? target.cx : this.x;
    const y = target ? target.cy : this.y;
    this.field = new Field(x, y, this.skillId, this.dir, target);
    world.fields.add(this.field);
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
    // 和玩家一樣，在時停中最低保有 0.2 倍速度：才打得到被時停的物體，讓力量累積在物體上（曠野之息式的時停）
    const tm = Math.max(m.time, cfg.playerMinTime);
    const dist = cfg.cannonSpeed * dt * tm;
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 0; i < steps; i++) {
      if (this.startedInside === undefined) this.startedInside = !!world.fields.shieldPush(this.x, this.y, { skipAlly: true });
      const bent = bounceByShield(world, this.x, this.y, this.dx, this.dy, this.startedInside);
      if (bent) { this.dx = bent.x; this.dy = bent.y; }
      const nx = this.x + (this.dx * dist) / steps;
      const ny = this.y + (this.dy * dist) / steps;
      const cross = world.portals.crossSegment(this.x, this.y, nx, ny);
      if (cross) {
        const d = cross.rotate(this.dx, this.dy);
        this.x = cross.x;
        this.y = cross.y;
        this.dx = d.x;
        this.dy = d.y;
        continue;
      }
      // 先檢查物件再檢查牆：嵌在牆裡的裝置（例如火爐）才打得到
      const hit = world.hitTest(nx, ny, 3, true);
      if (hit) {
        hit.onAirShot(world, { x: this.dx, y: this.dy });
        world.burst(nx, ny, '#cfe8ff', 6);
        this.alive = false;
        return;
      }
      if (world.map.pointSolid(nx, ny)) {
        world.burst(this.x, this.y, '#cfe8ff', 4);
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
    this.age = 0;
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
    this.age += ldt;
    // 剛射出的 0.1 秒不會被地形擋住：站在平台上的砲台往下打時，子彈一生成就會碰到腳下的平台而消失
    if (this.life <= 0 || (this.age > 0.1 && world.solidTiles(this.x, this.y, this.w, this.h))) {
      this.alive = false;
      return;
    }
    if (this.solid) return;
    if (this.friendly) {
      const enemy = world.entities.find((e) => e.isEnemy && e.alive && !e.ally && world.overlap(this, e));
      if (enemy) {
        enemy.takeDamage(world, 2, { x: Math.sign(this.vx), y: Math.sign(this.vy) });
        this.alive = false;
      }
      return;
    }
    // 敵人的子彈：自己人的重力盾會把它彈開
    const push = world.fields.shieldPush(this.cx, this.cy, { onlyAlly: true });
    if (push) {
      const m = Math.hypot(push.x, push.y) || 1;
      const dot = (this.vx * push.x + this.vy * push.y) / m;
      if (dot < 0) { this.vx -= (2 * dot * push.x) / m; this.vy -= (2 * dot * push.y) / m; }
    }
    if (world.overlap(this, world.player)) {
      world.hurtPlayer(1, { fromX: this.cx });
      this.alive = false;
      return;
    }
    // 也會打到自己人
    const ally = world.entities.find((e) => e.ally && e.alive && world.overlap(this, e));
    if (ally) {
      ally.takeDamage(world, 1, { x: Math.sign(this.vx), y: Math.sign(this.vy) });
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
