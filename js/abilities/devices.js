import { cfg, TILE, COLS, ROWS } from '../config.js';

// 連動裝置（參考《不可思議的機器》：能量在裝置之間轉換、一個推動下一個）
//   渦輪發電機：被蒸氣或風吹動就旋轉，轉起來時對相連的導體供電（動能 → 電）
//   輸送帶（'>'、'<'）：通電時把站在上面的東西往那個方向送（電 → 動能）；本身算包覆導線，不會電人
//   繩子（'y'）：從天花板垂下來，吊著正下方的物體（真的繩子：可以擺動、不會超出繩長）；被熱源（火爐、加熱場）或熔岩燒斷，物體掉下來（熱 → 狀態）
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const DeviceAbility = {
  // 渦輪：附近有蒸氣，或在風場裡（沒被擋住）就加速；沒有東西推就慢慢停下來
  updateTurbines(dt) {
    const winds = this.windFields?.() ?? [];
    for (const t of this.entities) {
      if (!t.isTurbine || !t.alive) continue;
      const steam = this.water.steamInRect(t.x - TILE, t.y - TILE, TILE * 3, TILE * 3) > 0.05;
      const wind = winds.some((f) => Math.hypot(t.cx - f.x, t.cy - f.y) <= f.r && !this.sheltered(f, t));
      t.driven = steam || wind;
      t.spin = Math.max(0, Math.min(1, t.spin + (t.driven ? cfg.turbineSpinUp : -cfg.turbineSpinDown) * dt));
      t.angle += t.spin * 12 * dt;
      t.generating = t.spin >= 0.5;
    }
  },

  // 輸送帶：通電時，站在上面的物體往輸送帶的方向移動
  updateConveyors(dt) {
    const riders = [this.player, ...this.entities.filter((e) => e.isBody && e.alive && !e.held && !e.rewind && !e.hanging)];
    for (const b of riders) {
      if (!b.grounded || b.groundAxis !== 'y' || b.groundSign < 0) continue;
      const fy = Math.floor((b.y + b.h + 1) / TILE);
      let dir = 0;
      for (const fx of [Math.floor(b.x / TILE), Math.floor((b.x + b.w - 0.5) / TILE)]) { // 只要還有一點搭在輸送帶上就繼續送，送到完全離開才掉下去
        const c = this.map.get(fx, fy);
        if ((c === '>' || c === '<') && this.isPowered(fx, fy)) dir = c === '>' ? 1 : -1;
      }
      if (dir) b.moveAxis(this, 'x', dir * cfg.conveyorSpeed * dt * (b.mods?.time ?? 1));
    }
  },

  // 繩子：第一次更新時，把每一條直的繩子和它正下方的物體連起來。
  // 上端固定在最上面那一格的頂端，長度＝固定點到物體頂端中央的距離
  linkRopes() {
    this.ropes = [];
    const segs = this.entities.filter((e) => e.isRope);
    const byTile = new Map(segs.map((r) => [r.ty * COLS + r.tx, r]));
    for (const r of segs) {
      if (byTile.has((r.ty - 1) * COLS + r.tx)) continue; // 不是最上面那一段
      const group = [r];
      let ty = r.ty + 1;
      while (byTile.has(ty * COLS + r.tx)) { group.push(byTile.get(ty * COLS + r.tx)); ty++; }
      const below = { x: r.tx * TILE, y: ty * TILE, w: TILE, h: TILE };
      const load = this.entities.find((e) => e.isBody && e.alive && this.overlap(e, below));
      const anchor = { x: r.tx * TILE + TILE / 2, y: r.ty * TILE };
      const rope = { segs: group, load, anchor, length: load ? Math.hypot(load.cx - anchor.x, load.y - anchor.y) : group.length * TILE, burn: 0, broken: false };
      if (load) load.hanging = true;
      for (const sg of group) sg.rope = rope;
      this.ropes.push(rope);
    }
  },

  // 繩子目前的兩端：固定點 → 吊著的物體頂端中央（沒有吊東西時直直垂下）
  ropeEnd(rope) {
    const l = rope.load;
    if (l?.alive) return { x: l.cx, y: l.y };
    return { x: rope.anchor.x, y: rope.anchor.y + rope.length };
  },

  // 繩子：吊著的東西受重力、會被風吹、被推得擺動，但不會超出繩長（超出時拉回來，往外的速度歸零）；
  // 被熱源或熔岩燒滿 ropeBurnTime 秒就斷
  updateRopes(dt) {
    if (!this.ropes) this.linkRopes();
    const heats = this.heatSources();
    for (const rope of this.ropes) {
      if (rope.broken) continue;
      const a = rope.anchor;
      const l = rope.load;
      if (l?.alive) {
        const dx = l.cx - a.x;
        const dy = l.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d > rope.length) {
          const ux = dx / d;
          const uy = dy / d;
          const tx = a.x + ux * rope.length - l.w / 2;
          const ty = a.y + uy * rope.length;
          if (!this.rectBlocked(tx, ty, l.w, l.h, l)) { l.x = tx; l.y = ty; }
          const vr = l.vx * ux + l.vy * uy;
          if (vr > 0) { l.vx -= vr * ux; l.vy -= vr * uy; }
        }
        // 擺動慢慢停下來
        const damp = Math.exp(-0.6 * dt);
        l.vx *= damp;
      }
      // 沿著繩子取樣，看有沒有被燒到
      const e = this.ropeEnd(rope);
      let hot = false;
      for (let t = 0; t <= 1 && !hot; t += 0.1) {
        const px = a.x + (e.x - a.x) * t;
        const py = a.y + (e.y - a.y) * t;
        if (heats.some((h) => Math.hypot(px - h.cx, py - h.cy) <= h.r)) hot = true;
        else if (this.water.pointInLava(px, py)) hot = true;
      }
      rope.burn = hot ? rope.burn + dt : Math.max(0, rope.burn - dt * 0.5);
      for (const sg of rope.segs) sg.burn = rope.burn / cfg.ropeBurnTime;
      if (rope.burn < cfg.ropeBurnTime) continue;
      rope.broken = true;
      for (let t = 0; t <= 1; t += 0.25) this.burst(a.x + (e.x - a.x) * t, a.y + (e.y - a.y) * t, '#ff8a3d', 4);
      for (const sg of rope.segs) sg.alive = false;
      if (l) l.hanging = false;
      this.toast('繩子燒斷了');
    }
  },
};
