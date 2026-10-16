import { cfg, TILE, COLS, ROWS } from '../config.js';

// 連動裝置（參考《不可思議的機器》：能量在裝置之間轉換、一個推動下一個）
//   渦輪發電機：被蒸氣或風吹動就旋轉，轉起來時對相連的導體供電（動能 → 電）
//   輸送帶（'>'、'<'）：通電時把站在上面的東西往那個方向送（電 → 動能）；本身算包覆導線，不會電人
//   繩子（'y'）：從天花板垂下來，吊著正下方的物體；被熱源（火爐、加熱場）或熔岩燒斷，物體掉下來（熱 → 狀態）
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

  // 繩子：第一次更新時，把每一條直的繩子和它正下方的物體連起來
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
      if (load) load.hanging = true;
      const rope = { segs: group, load, burn: 0, broken: false };
      for (const s of group) s.rope = rope;
      this.ropes.push(rope);
    }
  },

  // 繩子被熱源或熔岩燒：燒滿 ropeBurnTime 秒就斷，吊著的東西掉下來
  updateRopes(dt) {
    if (!this.ropes) this.linkRopes();
    const heats = this.heatSources();
    for (const rope of this.ropes) {
      if (rope.broken) continue;
      const hot = rope.segs.some((s) => heats.some((h) => Math.hypot(s.cx - h.cx, s.cy - h.cy) <= h.r) || this.water.lavaAt(s.tx, s.ty) > 0.1);
      rope.burn = hot ? rope.burn + dt : Math.max(0, rope.burn - dt * 0.5);
      for (const s of rope.segs) s.burn = rope.burn / cfg.ropeBurnTime;
      if (rope.burn < cfg.ropeBurnTime) {
        // 吊著的東西固定在原地（不受重力、速度歸零）
        if (rope.load?.alive) { rope.load.vx = 0; rope.load.vy = 0; }
        continue;
      }
      rope.broken = true;
      for (const s of rope.segs) { s.alive = false; this.burst(s.cx, s.cy, '#ff8a3d', 4); }
      if (rope.load) rope.load.hanging = false;
      this.toast('繩子燒斷了');
    }
  },
};
