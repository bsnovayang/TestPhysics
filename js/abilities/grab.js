import { cfg, GRAB_LEVELS } from '../config.js';
import { distToRect } from '../body.js';

// 重力抓取：按住抓起物體搬運，放開時保留速度（分三級，見 config.js 的 GRAB_LEVELS）
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const GrabAbility = {
  // 重力抓取：抓住游標下的物體（箱子、鐵塊、輕的敵人）。回傳是否成功
  startGrab(keyCode) {
    const p = this.player;
    const o = p.shoulder();
    const t = this.entities.find((e) => e.isBody && e.alive && !e.isBoss
      && this.mouse.x > e.x - 4 && this.mouse.x < e.x + e.w + 4 && this.mouse.y > e.y - 4 && this.mouse.y < e.y + e.h + 4);
    if (!t) { this.toast('游標下沒有可以抓的東西'); return false; }
    const lv = GRAB_LEVELS[cfg.grabLevel] ?? GRAB_LEVELS[1];
    if (distToRect(o.x, o.y, t) > lv.range) { this.toast(lv.carry ? '要靠近一點才抓得到' : '太遠了'); return false; }
    if (t.mass > lv.maxMass) { this.toast('太重了，抓不起來'); return false; }
    if (t === p.groundBody) { this.toast('不能抓自己腳下的東西'); return false; }
    if (this.fields.jammedAt(t.cx, t.cy, 'gravity')) { this.toast('重力被干擾，抓不起來'); return false; }
    // 中間不能被牆擋住
    const d = Math.hypot(t.cx - o.x, t.cy - o.y);
    for (let k = 8; k < d; k += 4) {
      const x = o.x + ((t.cx - o.x) / d) * k;
      const y = o.y + ((t.cy - o.y) / d) * k;
      // 碰到目標外圍 4 px 就算看得到（放在平台上的箱子，視線常會擦過平台邊角）
      if (x > t.x - 4 && x < t.x + t.w + 4 && y > t.y - 4 && y < t.y + t.h + 4) break;
      if (this.map.pointSolid(x, y)) { this.toast('被牆擋住了'); return false; }
    }
    this.grab = { target: t, key: keyCode };
    t.held = true;
    this.burst(t.cx, t.cy, '#c9a8ff', 10);
    return true;
  },

  endGrab(message) {
    if (!this.grab) return;
    this.grab.target.held = false;
    this.grab = null;
    if (message) this.toast(message);
  },

  // 被抓住的物體追向游標（限制在抓取距離內），速度有上限；放開按鍵時保留當下的速度，所以可以丟出去
  updateGrab(dt) {
    const g = this.grab;
    if (!g) return;
    const p = this.player;
    const t = g.target;
    if (!t.alive) return this.endGrab();
    if (!this.input.isDown(g.key)) return this.endGrab();
    if (t === p.groundBody) return this.endGrab('不能抓自己腳下的東西');
    if (this.fields.jammedAt(t.cx, t.cy, 'gravity')) return this.endGrab('重力被干擾，放開了');
    p.mp -= cfg.grabDrain * dt;
    if (p.mp <= 0) { p.mp = 0; return this.endGrab('MP 耗盡'); }
    const o = p.shoulder();
    const lv = GRAB_LEVELS[cfg.grabLevel] ?? GRAB_LEVELS[1];
    // 被牆卡住、角色走遠了就放開
    if (distToRect(o.x, o.y, t) > lv.range + 24) return this.endGrab('離太遠，放開了');
    let tx = this.mouse.x;
    let ty = this.mouse.y;
    const d = Math.hypot(tx - o.x, ty - o.y) || 1;
    // Lv1：拿在角色面前（游標只決定方向）；Lv2 以上：跟著游標，限制在抓取距離內
    const reach = lv.carry ? 10 + Math.max(t.w, t.h) / 2 : Math.min(d, lv.range);
    tx = o.x + ((tx - o.x) / d) * reach;
    ty = o.y + ((ty - o.y) / d) * reach;
    let vx = (tx - t.cx) * 10;
    let vy = (ty - t.cy) * 10;
    const v = Math.hypot(vx, vy);
    if (v > cfg.grabSpeed) { vx *= cfg.grabSpeed / v; vy *= cfg.grabSpeed / v; }
    t.vx = vx;
    t.vy = vy;
    if (t.isEnemy) t.stunT = Math.max(t.stunT, 0.2); // 被抓住的敵人不能行動
  },
};
