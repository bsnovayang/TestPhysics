import { cfg, CHARM_LEVELS } from '../config.js';

// 洗腦：被洗腦的敵人變成自己人（攻擊敵人、不攻擊玩家），維持時每隻每秒耗 MP，MP 用光時全部清醒。
// 自己人被打死就沒了。對地面施放：命令自己人走過去待命（指令優先於自動攻擊）；對自己人再放一次：恢復跟隨
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const CharmAbility = {
  allies() {
    return this.entities.filter((e) => e.ally && e.alive);
  },

  charm(target) {
    if (target.isBoss) { this.toast('魔王不受影響'); this.refundSkill(); return; }
    if (target.ally) {
      this.allyOrder = null;
      this.toast('自己人：跟著我');
      this.burst(target.cx, target.cy, '#ff7ad9', 8);
      return;
    }
    const cap = CHARM_LEVELS[cfg.charmLevel] ?? 1;
    const allies = this.allies();
    // 超過上限：最早控制的那隻清醒
    while (allies.length >= cap) this.wake(allies.shift());
    target.ally = true;
    target.charmT = this.time;
    target.stunT = Math.max(target.stunT, 0.3);
    if (target.state) { target.state = 'patrol'; target.timer = 0; } // 雷射兵：打斷集氣
    this.burst(target.cx, target.cy, '#ff7ad9', 16);
    this.popup(target.cx, target.y, '洗腦', '#ff7ad9');
  },

  wake(e) {
    if (!e) return;
    e.ally = false;
    this.burst(e.cx, e.cy, '#ffffff', 10);
    this.popup(e.cx, e.y, '清醒', '#ffb0b0');
  },

  commandAllies(x, y) {
    if (!this.allies().length) { this.toast('沒有被洗腦的敵人'); return; }
    this.allyOrder = { x, y };
    this.burst(x, y, '#ff7ad9', 8);
  },

  updateCharm(dt) {
    const allies = this.allies();
    if (!allies.length) { this.allyOrder = null; return; }
    const p = this.player;
    p.mp -= cfg.charmDrain * allies.length * dt;
    if (p.mp <= 0) {
      p.mp = 0;
      for (const e of allies) this.wake(e);
      this.allyOrder = null;
      this.toast('MP 耗盡，洗腦解除');
    }
  },

  // 自己人的對手：射程內最近的敵人（魔王除外）
  nearestHostile(from, range) {
    let best = null;
    let bd = range;
    for (const e of this.entities) {
      if (!e.isEnemy || !e.alive || e.ally || e.isBoss || e === from) continue;
      const d = Math.hypot(e.cx - from.cx, e.cy - from.cy);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },

  // 敵人的對手：玩家或自己人中最近的
  nearestTarget(from) {
    let best = this.player;
    let bd = Math.hypot(this.player.cx - from.cx, this.player.cy - from.cy);
    for (const e of this.allies()) {
      const d = Math.hypot(e.cx - from.cx, e.cy - from.cy);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },
};
