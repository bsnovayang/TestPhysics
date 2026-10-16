import { cfg } from '../config.js';

// 閃現：朝游標瞬間移動
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const BlinkAbility = {
  // 閃現：朝游標瞬間移動，保留原本的速度。不能穿牆時，停在路徑上最後一個空位
  blink() {
    const p = this.player;
    const from = { x: p.cx, y: p.cy };
    const dx = this.mouse.x - from.x;
    const dy = this.mouse.y - from.y;
    const d = Math.min(Math.hypot(dx, dy), cfg.blinkRange);
    if (d < 1) return;
    const tx = from.x + (dx / Math.hypot(dx, dy)) * d;
    const ty = from.y + (dy / Math.hypot(dx, dy)) * d;
    if (this.fields.jammedAt(from.x, from.y, 'space') || this.fields.jammedAt(tx, ty, 'space')) {
      this.toast('空間被干擾，無法閃現');
      this.refundSkill();
      return;
    }
    const ux = dx / Math.hypot(dx, dy);
    const uy = dy / Math.hypot(dx, dy);
    const free = (t) => !this.rectBlocked(from.x + ux * t - p.w / 2, from.y + uy * t - p.h / 2, p.w, p.h, p);

    let best = 0;
    if (cfg.blinkThroughWalls) {
      for (let t = d; t > 0; t -= 2) if (free(t)) { best = t; break; }
    } else {
      for (let t = 2; t <= d; t += 2) {
        if (!free(t)) break;
        best = t;
      }
    }
    this.burst(p.cx, p.cy, '#3ddc84', 10);
    p.x = from.x + ux * best - p.w / 2;
    p.y = from.y + uy * best - p.h / 2;
    this.burst(p.cx, p.cy, '#3ddc84', 10);
  },
};
