import { cfg } from '../config.js';

// 向量反射：按住維持的反射場（雷射的反射在 light.js 的 traceBeam 裡）
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const ReflectAbility = {
  // 向量反射：維持中持續耗 MP；身邊的子彈原路彈回去（變成我方子彈）、衝過來的物體照物理反彈，每次反射額外耗 MP。
  // 雷射在 traceBeam 裡反射（world.reflectLaser 表示這一幀有反射雷射）。放開按鍵或 MP 用光時結束，進入冷卻
  updateReflect(dt) {
    const rf = this.reflect;
    if (!rf) return;
    const p = this.player;
    rf.flash = Math.max(0, rf.flash - dt);
    if (!this.input.isDown(rf.key)) return this.endReflect(false);
    let spend = cfg.reflectDrain * dt;
    if (this.reflectLaser) spend += cfg.reflectLaserCost * dt;
    const R = cfg.reflectRadius;
    for (const e of this.entities) {
      if (!e.alive) continue;
      if (e.isBullet && !e.friendly) {
        const nx = e.cx - p.cx;
        const ny = e.cy - p.cy;
        const d = Math.hypot(nx, ny);
        if (d > R) continue;
        // 子彈原路彈回（回到發射者），不是照圓的法線反射，否則角色一移動就會斜斜地彈開
        e.vx = -e.vx;
        e.vy = -e.vy;
        e.friendly = true;
        spend += cfg.reflectBulletCost;
        rf.flash = 0.15;
        this.burst(e.cx, e.cy, '#ffb347', 5);
        continue;
      }
      if (!e.isBody || e.held || e.isBoss || e.reflectCd > 0) continue;
      // 矩形上離角色中心最近的點
      const qx = Math.max(e.x, Math.min(p.cx, e.x + e.w));
      const qy = Math.max(e.y, Math.min(p.cy, e.y + e.h));
      const d = Math.hypot(qx - p.cx, qy - p.cy);
      if (d > R) continue;
      const ux = (e.cx - p.cx) / (Math.hypot(e.cx - p.cx, e.cy - p.cy) || 1);
      const uy = (e.cy - p.cy) / (Math.hypot(e.cx - p.cx, e.cy - p.cy) || 1);
      const rel = (e.vx - p.vx) * ux + (e.vy - p.vy) * uy;
      if (rel < -40) {
        // 衝過來的物體：相對速度反向，越重越快消耗越多
        e.vx -= 2 * rel * ux;
        e.vy -= 2 * rel * uy;
        spend += Math.min(20, Math.max(2, (e.mass * -rel) / 40));
      } else if (e.isEnemy) {
        // 貼著的敵人：推開
        e.vx += ux * 160;
        e.vy += uy * 160;
        spend += 2;
      } else continue;
      e.reflectCd = 0.25;
      e.stunT = Math.max(e.stunT ?? 0, 0.3);
      rf.flash = 0.15;
      this.burst(qx, qy, '#ffb347', 6);
    }
    for (const e of this.entities) if (e.reflectCd > 0) e.reflectCd -= dt;
    p.mp -= spend;
    if (p.mp <= 0) { p.mp = 0; this.endReflect(true); }
  },

  endReflect(empty) {
    if (!this.reflect) return;
    this.reflect = null;
    this.cooldowns.reflect = empty ? cfg.reflectCdEmpty : cfg.reflectCd;
    if (empty) this.toast('MP 耗盡，反射中斷');
  },
};
