// 反射場：場域的邊界是一面會反彈的牆。外面的東西進不來、裡面的東西出不去，碰到邊界時速度沿法線反射。
// 會被擋的：玩家、箱子、敵人、子彈、熔岩塊與火山彈（這裡處理）、空氣砲（projectiles.js）、雷射（light.js）、
// 像素水的水、蒸氣、熔岩（pixel-water.js 把邊界當成牆）。網可以穿過（否則放不出場域）
// 附著在某個東西上時，那個東西自己不受影響（附著在自己身上＝一面跟著走的反射盾）
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const ReflectFieldAbility = {
  // 目前有效的反射場（被「全部」干擾器關掉的不算）
  reflectFields() {
    return this.fields.list.filter((f) => f.skill.type === 'reflectField' && !this.fields.jammedAt(f.x, f.y, 'vector'));
  },

  // 會被反射場擋住的東西
  reflectMovers() {
    if (!this.fields.list.some((f) => f.skill.type === 'reflectField')) return [];
    const list = [this.player];
    for (const e of this.entities) if (e.alive && (e.isBody || e.isBullet || e.isLavaBlob || e.isBomb)) list.push(e);
    return list;
  },

  // 線段 (x0,y0)→(x1,y1) 有沒有穿過某個反射場的邊界；有的話回傳該點的法線（從圓心往外）
  reflectCross(x0, y0, x1, y1) {
    for (const f of this.reflectFields()) {
      const a = Math.hypot(x0 - f.x, y0 - f.y) < f.r;
      const b = Math.hypot(x1 - f.x, y1 - f.y) < f.r;
      if (a === b) continue;
      const d = Math.hypot(x1 - f.x, y1 - f.y) || 1;
      return { x: (x1 - f.x) / d, y: (y1 - f.y) / d };
    }
    return null;
  },

  // 所有東西移動完之後：在反射場外面的推回外面、在裡面的推回裡面，速度沿法線反射
  // before：[[物體, 移動前的中心 x, y], ...]
  resolveReflectFields(before) {
    const fields = this.reflectFields();
    if (!fields.length) return;
    for (const [m, px, py] of before) {
      if (!m.alive && m !== this.player) continue;
      const br = Math.max(m.w, m.h) / 2;
      for (const f of fields) {
        if (m === f.target) continue;
        f.sides ??= new WeakMap();
        let side = f.sides.get(m);
        if (!side) {
          side = Math.hypot(px - f.x, py - f.y) < f.r ? 'in' : 'out';
          f.sides.set(m, side);
        }
        const dx = m.cx - f.x;
        const dy = m.cy - f.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const limit = side === 'out' ? f.r + br : f.r - br;
        if (side === 'out' ? d >= limit : (limit <= 0 || d <= limit)) continue;
        const nx = dx / d;
        const ny = dy / d;
        const vn = m.vx * nx + m.vy * ny;
        // 速度往邊界走的分量反射
        if ((side === 'out' && vn < 0) || (side === 'in' && vn > 0)) {
          m.vx -= 2 * vn * nx;
          m.vy -= 2 * vn * ny;
          if (m.isBullet) m.friendly = true; // 被玩家的反射場彈開的子彈變成我方的
          this.burst(f.x + nx * f.r, f.y + ny * f.r, '#ffb347', 4);
        }
        // 推回邊界的正確那一側；推不過去（會卡進牆）就回到移動前的位置
        const tx = f.x + nx * limit - m.w / 2;
        const ty = f.y + ny * limit - m.h / 2;
        const blocked = m.isBody && this.rectBlocked(tx, ty, m.w, m.h, m);
        if (!blocked) { m.x = tx; m.y = ty; } else { m.x = px - m.w / 2; m.y = py - m.h / 2; }
      }
    }
  },
};
