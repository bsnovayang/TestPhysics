// 定向重力的 LOL 式施放：按住技能鍵時拖曳游標決定方向，放開確定
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const DirAimAbility = {
  // 定向重力的方向：從起點（網的落點或展開的場域）指向游標。場域展開後也會即時改變，放開按鍵才固定
  dirAimAnchor() {
    const a = this.dirAim;
    if (!a) return null;
    if (a.web.field) return this.fields.list.includes(a.web.field) ? a.web.field : null;
    return a.web.alive ? { x: a.web.tx, y: a.web.ty } : null;
  },

  updateDirAim() {
    const a = this.dirAim;
    if (!a) return;
    const anchor = this.dirAimAnchor();
    if (!anchor) { this.dirAim = null; return; }
    const dx = this.mouse.x - anchor.x;
    const dy = this.mouse.y - anchor.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) {
      const dir = { x: dx / d, y: dy / d };
      a.web.dir = dir;
      if (a.web.field) a.web.field.dir = dir;
    }
    if (!this.input.isDown(a.key)) this.dirAim = null;
  },
};
