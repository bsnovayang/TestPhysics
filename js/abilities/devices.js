import { cfg, TILE, COLS, ROWS } from '../config.js';

// 連動裝置（參考《不可思議的機器》：能量在裝置之間轉換、一個推動下一個）
//   渦輪發電機：被蒸氣或風吹動就旋轉，轉起來時對相連的導體供電（動能 → 電）
//   輸送帶（'>'、'<'）：通電時把站在上面的東西往那個方向送（電 → 動能）；本身算包覆導線，不會電人
//   繩子（'y'）：從天花板垂下來，吊著正下方的物體（真的繩子：可以擺動、不會超出繩長）；被熱源（火爐、加熱場）或熔岩燒斷，物體掉下來（熱 → 狀態）；
//     一瞬間被扯得太猛（衝量超過 ropeSnap）或長時間吊太重（超過 ropeMaxLoad）也會斷
//   彈性繩（'e'）：超過原本長度時像彈簧一樣往回拉，拉到 elasticMax 倍就斷；被冷卻時變硬，長度固定在當下（變成普通繩子），
//     和結冰一樣會一直維持到被加熱為止
//   彈床（'t'）：掉上去的東西被壓下去再彈起來（玩家在上面按跳可以越彈越高）；冷卻時變硬成為平台（加熱才恢復）；被燒或壓太深會斷
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

  // 繩子：第一次更新時，把每一條直的繩子和它正下方的物體連起來（普通繩子和彈性繩分開算）。
  // 上端固定在最上面那一格的頂端，長度＝固定點到物體頂端中央的距離
  linkRopes() {
    this.ropes = [];
    const segs = this.entities.filter((e) => e.isRope);
    const byTile = new Map(segs.map((r) => [r.ty * COLS + r.tx, r]));
    const same = (r, ty) => byTile.get(ty * COLS + r.tx)?.elastic === r.elastic;
    for (const r of segs) {
      if (same(r, r.ty - 1)) continue; // 不是最上面那一段
      const group = [r];
      let ty = r.ty + 1;
      while (same(r, ty)) { group.push(byTile.get(ty * COLS + r.tx)); ty++; }
      const below = { x: r.tx * TILE, y: ty * TILE, w: TILE, h: TILE };
      const load = this.entities.find((e) => e.isBody && e.alive && this.overlap(e, below));
      const anchor = { x: r.tx * TILE + TILE / 2, y: r.ty * TILE };
      const length = load ? Math.hypot(load.cx - anchor.x, load.y - anchor.y) : group.length * TILE;
      const rope = { segs: group, load, anchor, length, elastic: r.elastic, stiff: false, lockLen: length, tension: 0, burn: 0, broken: false };
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

  // 沿著一條線段取樣，看有沒有點落在某個範圍（熱源、冷源）裡
  lineTouches(ax, ay, bx, by, sources) {
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      if (sources.some((h) => Math.hypot(px - h.cx, py - h.cy) <= h.r)) return true;
    }
    return false;
  },

  lineInLava(ax, ay, bx, by) {
    for (let t = 0; t <= 1.0001; t += 0.1) if (this.water.pointInLava(ax + (bx - ax) * t, ay + (by - ay) * t)) return true;
    return false;
  },

  // 繩子斷掉：沿著繩子冒火花，吊著的東西保留當下的速度飛出去
  snapRope(rope, color, text) {
    const a = rope.anchor;
    const e = this.ropeEnd(rope);
    rope.broken = true;
    for (let t = 0; t <= 1; t += 0.25) this.burst(a.x + (e.x - a.x) * t, a.y + (e.y - a.y) * t, color, 4);
    for (const sg of rope.segs) sg.alive = false;
    if (rope.load) rope.load.hanging = false;
    this.toast(text);
  },

  // 繩子：吊著的東西受重力、會被風吹、被推得擺動，但不會超出繩長（超出時拉回來，往外的速度歸零）。
  // 拉回來時抵消掉的速度 × 質量就是這一下的衝量：太大（被猛扯）或平均起來太大（吊太重）就斷。
  // 彈性繩：超過原本長度時往回拉（彈簧），拉太長就斷；被冷卻時變硬，長度固定在變硬的那一刻，被加熱才恢復彈性。
  // 吊著的東西被時停凍住時不處理（讓時停累積的力保留下來，解凍時一次扯在繩子上）
  updateRopes(dt) {
    if (!this.ropes) this.linkRopes();
    const heats = this.heatSources();
    const colds = this.coldSources();
    for (const rope of this.ropes) {
      if (rope.broken) continue;
      const a = rope.anchor;
      const l = rope.load;
      const end = this.ropeEnd(rope);
      const hot = this.lineTouches(a.x, a.y, end.x, end.y, heats) || this.lineInLava(a.x, a.y, end.x, end.y);
      if (rope.elastic) {
        if (hot) rope.stiff = false;
        else if (!rope.stiff && this.lineTouches(a.x, a.y, end.x, end.y, colds)) {
          rope.stiff = true;
          rope.lockLen = Math.max(rope.length, Math.hypot(end.x - a.x, end.y - a.y));
        }
      }
      if (l?.alive && l.mods.time >= 0.05) {
        const ldt = dt * l.mods.time;
        const dx = l.cx - a.x;
        const dy = l.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const ux = dx / d;
        const uy = dy / d;
        if (rope.elastic && !rope.stiff) {
          if (d > rope.length * cfg.elasticMax) { this.snapRope(rope, '#e0679a', '彈性繩被拉斷了'); continue; }
          if (d > rope.length) {
            const acc = ((cfg.gravity / cfg.elasticSag) * (d - rope.length)) / l.mass;
            l.vx -= ux * acc * ldt;
            l.vy -= uy * acc * ldt;
            const vr = l.vx * ux + l.vy * uy;
            const c = 1 - Math.exp(-cfg.elasticDamp * ldt);
            l.vx -= ux * vr * c;
            l.vy -= uy * vr * c;
          }
          rope.tension = 0;
        } else {
          const len = rope.elastic ? rope.lockLen : rope.length;
          let impulse = 0;
          if (d > len) {
            const tx = a.x + ux * len - l.w / 2;
            const ty = a.y + uy * len;
            if (!this.rectBlocked(tx, ty, l.w, l.h, l)) { l.x = tx; l.y = ty; }
            const vr = l.vx * ux + l.vy * uy;
            if (vr > 0) { l.vx -= vr * ux; l.vy -= vr * uy; impulse = vr * l.mass; }
          }
          rope.tension += (impulse / ldt - rope.tension) * Math.min(1, dt * 8);
          if (impulse > cfg.ropeSnap) { this.snapRope(rope, '#d9b27a', '繩子被扯斷了'); continue; }
          rope.overT = rope.tension > cfg.ropeMaxLoad * cfg.gravity ? (rope.overT ?? 0) + dt : 0;
          if (rope.overT > cfg.ropeOverTime) { this.snapRope(rope, '#d9b27a', '繩子吊不住，斷了'); continue; }
        }
        // 擺動慢慢停下來
        l.vx *= Math.exp(-0.6 * ldt);
      }
      // 被燒到
      rope.burn = hot ? rope.burn + dt : Math.max(0, rope.burn - dt * 0.5);
      for (const sg of rope.segs) sg.burn = rope.burn / cfg.ropeBurnTime;
      if (rope.burn >= cfg.ropeBurnTime) this.snapRope(rope, '#ff8a3d', '繩子燒斷了');
    }
  },

  // 彈床：從上面掉進來的東西（重力朝下時）被往上推，壓得越深推得越用力（質量越大陷得越深）。
  // 冷卻時變硬（加熱才恢復），上面沒有東西壓著時變成實心的平台；被燒或壓太深就斷
  updateBands(dt) {
    const bands = this.entities.filter((e) => e.isBand && e.alive);
    this.player.onBand = false;
    if (!bands.length) return;
    const heats = this.heatSources();
    const colds = this.coldSources();
    const bodies = [this.player, ...this.entities.filter((e) => e.isBody && e.alive && !e.held && !e.rewind)];
    for (const band of bands) {
      const x0 = band.x;
      const x1 = band.x + band.w;
      const y = band.y;
      const hot = this.lineTouches(x0, y, x1, y, heats) || this.lineInLava(x0, y, x1, y);
      band.burn = hot ? band.burn + dt : Math.max(0, band.burn - dt * 0.5);
      if (band.burn >= cfg.ropeBurnTime) { this.snapBand(band, '#ff8a3d', '彈床燒斷了'); continue; }
      band.stiff = hot ? false : band.stiff || this.lineTouches(x0, y, x1, y, colds);
      band.solid = band.stiff && band.contacts.size === 0;
      band.sag = null;
      if (band.solid) continue;
      for (const b of bodies) {
        const depth = b.y + b.h - y;
        const over = b.cx > x0 && b.cx < x1 && b.groundAxis === 'y' && b.groundSign > 0;
        if (!band.contacts.has(b)) {
          // 這一幀才從上面穿過彈床：開始接觸
          if (!over || depth <= 0 || b.vy < 0 || depth > b.vy * dt + 3) continue;
          band.contacts.add(b);
        }
        if (!over || depth <= 0 || !b.alive) {
          band.contacts.delete(b);
          if (b.bandPump && b.vy < 0) b.vy -= b.bandPump; // 玩家在彈床上按了跳：彈起來時多一股力
          b.bandPump = 0;
          continue;
        }
        if (depth > cfg.bandMaxDepth) { this.snapBand(band, '#e0679a', '彈床被壓斷了'); break; }
        if (!band.sag || depth > band.sag.depth) band.sag = { x: b.cx, depth };
        if (b === this.player) this.player.onBand = true;
        const ldt = dt * (b.mods?.time ?? 1);
        if (ldt <= 0) continue;
        b.vy -= (((cfg.gravity / cfg.bandSag) * depth) / b.mass) * ldt;
        b.vy *= Math.exp(-cfg.bandDamp * ldt);
      }
    }
  },

  snapBand(band, color, text) {
    band.alive = false;
    band.solid = false;
    for (let x = band.x; x <= band.x + band.w; x += 16) this.burst(x, band.y, color, 3);
    this.toast(text);
  },
};
