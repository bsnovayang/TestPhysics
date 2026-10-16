import { cfg, STEP } from '../config.js';

// 時間倒轉：記錄物體最近的位置，倒轉時沿路徑倒退（倒退中可以載人）
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const RewindAbility = {
  // 時間倒轉：物體沿著過去的路徑倒退回去。由網打中物體時呼叫
  startRewind(target) {
    if (this.fields.jammedAt(target.cx, target.cy, 'time')) { this.toast('時間被干擾，無法倒轉'); this.refundSkill(); return; }
    const h = target.hist ?? [];
    const moved = h.some((q) => Math.abs(q.x - target.x) > 4 || Math.abs(q.y - target.y) > 4);
    if (!moved) { this.toast('它最近沒有移動過'); this.refundSkill(); return; }
    if (this.grab?.target === target) this.endGrab();
    target.rewind = { frames: target.hist.slice().reverse(), i: 0 };
    target.hist = [];
    target.vx = 0;
    target.vy = 0;
    this.burst(target.cx, target.cy, '#9fd8ff', 14);
  },

  // 每幀記錄物體的位置（最多 rewindTime 秒），倒轉時拿來播放
  recordHistory() {
    const max = Math.round(cfg.rewindTime / STEP);
    for (const e of this.entities) {
      if (!e.isBody || !e.alive || e.rewind || e.isBoss) continue;
      (e.hist ??= []).push({ x: e.x, y: e.y });
      if (e.hist.length > max) e.hist.shift();
    }
  },

  // 倒轉中的物體：照著記錄倒著走（實心，站在上面的東西會被載著走）
  stepRewinds() {
    for (const e of this.entities) {
      const r = e.rewind;
      if (!r || !e.alive) continue;
      r.i = Math.min(r.frames.length - 1, r.i + cfg.rewindSpeed);
      const to = r.frames[Math.floor(r.i)];
      const dx = to.x - e.x;
      const dy = to.y - e.y;
      const riders = this.bodies().filter((b) => b !== e && !b.rewind && Math.abs(b.y + b.h - e.y) < 1.5 && b.x < e.x + e.w && b.x + b.w > e.x);
      // 往上時先移動站在上面的東西，往下時先移動自己，避免互相卡住
      if (dy < 0) for (const b of riders) b.moveAxis(this, 'y', dy);
      e.x = to.x;
      e.y = to.y;
      if (dy >= 0) for (const b of riders) b.moveAxis(this, 'y', dy);
      for (const b of riders) b.moveAxis(this, 'x', dx);
      e.vx = 0;
      e.vy = 0;
      if (r.i >= r.frames.length - 1) e.rewind = null;
    }
  },
};
