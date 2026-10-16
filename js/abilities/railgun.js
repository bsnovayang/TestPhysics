import { cfg } from '../config.js';
import { distToRect } from '../body.js';

// 電磁加速：把身邊的金屬物體高速射出；也負責更新閃電特效與技能冷卻
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const RailgunAbility = {
  // 電磁加速：把身邊（railRange 內）離游標最近的金屬物體朝游標方向射出。回傳是否成功
  fireRail() {
    const p = this.player;
    const o = p.shoulder();
    const cands = this.entities.filter((e) => e.isBody && e.alive && e.isMetal && e.mass <= cfg.railMaxMass && distToRect(o.x, o.y, e) <= cfg.railRange);
    if (!cands.length) {
      const heavy = this.entities.some((e) => e.isBody && e.alive && e.isMetal && distToRect(o.x, o.y, e) <= cfg.railRange);
      this.toast(heavy ? '太重了，射不出去' : '身邊沒有金屬');
      return false;
    }
    const m = this.mouse;
    const t = cands.reduce((a, b) => (Math.hypot(a.cx - m.x, a.cy - m.y) <= Math.hypot(b.cx - m.x, b.cy - m.y) ? a : b));
    let dx = m.x - t.cx;
    let dy = m.y - t.cy;
    const d = Math.hypot(dx, dy);
    if (d < 4) { dx = p.facing; dy = 0; } else { dx /= d; dy /= d; }
    if (this.grab?.target === t) this.endGrab();
    t.rewind = null;
    t.vx = dx * cfg.railSpeed;
    t.vy = dy * cfg.railSpeed;
    t.railT = cfg.railTime;
    t.railLast = { x: t.cx, y: t.cy };
    // 發射的閃光：從角色到物體一道閃電
    this.bolts.push({ x1: o.x, y1: o.y, x2: t.cx, y2: t.cy, life: 0.2 });
    this.burst(t.cx, t.cy, '#bfefff', 14);
    return true;
  },

  // 電磁加速飛行中的物體：沿路留下閃電
  updateRails(dt) {
    for (const e of this.entities) {
      if (!(e.railT > 0)) continue;
      e.railT -= dt;
      if (e.alive && e.railLast) {
        this.bolts.push({ x1: e.railLast.x, y1: e.railLast.y, x2: e.cx, y2: e.cy, life: 0.3 });
        e.railLast = { x: e.cx, y: e.cy };
      }
    }
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
  },
};
