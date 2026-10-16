import { cfg } from '../config.js';

// 附身：網打中敵人就附身，操作轉給那隻敵人（見 Enemy.controlled）。
// 本體被時間凍結：無敵、敵人不會瞄準它。再按一次技能鍵或 Esc 回到本體；MP 用光或那隻敵人被打倒時強制回到本體。
// 回到本體後，那隻敵人恢復成敵人並暈眩一下，技能進入冷卻
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const PossessAbility = {
  startPossess(target) {
    if (target.isBoss) { this.toast('魔王不受影響'); this.refundSkill(); return; }
    if (this.grab) this.endGrab();
    if (this.reflect) this.endReflect(false);
    this.dirAim = null;
    target.ally = false;
    target.possessed = true;
    target.stunT = 0;
    if (target.state) { target.state = 'patrol'; target.timer = 0; }
    const slot = this.loadout.indexOf('possess');
    this.possess = { target, key: slot >= 0 ? this.slotKey(slot) : null };
    const p = this.player;
    p.vx = 0;
    p.vy = 0;
    this.burst(target.cx, target.cy, '#ff7ad9', 18);
    this.burst(p.cx, p.cy, '#9fd8ff', 12);
  },

  endPossess(message) {
    const pos = this.possess;
    if (!pos) return;
    this.possess = null;
    const t = pos.target;
    if (t.alive) {
      t.possessed = false;
      t.stunT = cfg.possessStun;
      if (t.state) { t.state = 'patrol'; t.timer = 0; }
      if (t.flies) t.homeY = t.y; // 會飛的就在現在的高度停住
      this.burst(t.cx, t.cy, '#ffffff', 10);
    }
    this.cooldowns.possess = cfg.possessCd;
    this.burst(this.player.cx, this.player.cy, '#ff7ad9', 12);
    if (message) this.toast(message);
  },

  updatePossess(dt) {
    const pos = this.possess;
    if (!pos) return;
    if (!pos.target.alive) return this.endPossess('附身的敵人被打倒了');
    if (pos.key && this.input.wasPressed(pos.key)) return this.endPossess();
    const p = this.player;
    p.mp -= cfg.possessDrain * dt;
    if (p.mp <= 0) { p.mp = 0; this.endPossess('MP 耗盡，回到本體'); }
  },
};
