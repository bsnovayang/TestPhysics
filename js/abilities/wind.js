import { cfg, TILE, COLS, ROWS } from '../config.js';

// 風場：把範圍內的東西的速度拉向風速（最多被吹到和風一樣快，順風移動的東西就不再受力）。
// 效果 = windAccel × 受風面積 ÷ 質量²：木箱（1）吹得動、鐵塊（2）只剩四分之一、重裝兵（5）幾乎不動；
// 氣球兵、飛行兵受風面積大，很容易被吹走。地上的東西靠原本的地面摩擦抵抗（木箱 1320 大於摩擦 900，吹得動；鐵塊 330 吹不動）；
// 玩家站在地上時風力打折（windGround），跳起來才會被明顯吹走。
// 上風處有牆或實心物體擋住時，後面是避風處。疊加在原本的重力上，不改變地面方向。
// 附著時連附著的對象一起吹（附著在箱子上＝一直推著它走；附著在自己身上＝乘風飛行）。
// 子彈也會被吹偏；空氣砲、網、雷射不受影響。蒸氣在 pixel-water.js 裡被吹動
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const WindAbility = {
  windFields() {
    return this.fields.list.filter((f) => f.skill.type === 'wind' && !this.fields.jammedAt(f.x, f.y, 'air'));
  },

  // 這個物體是不是在避風處：往上風方向看，中間有牆或實心物體擋住，而且**擋住的東西後面還有風**（場域範圍內還有空氣）。
  // 地板、場域嵌進去的牆後面都是實心的、沒有風可以擋，就不算遮蔽（否則往上吹的風永遠抬不起地上的東西）
  sheltered(f, m) {
    const ux = -f.dir.x;
    const uy = -f.dir.y;
    const start = Math.abs(ux) * (m.w / 2) + Math.abs(uy) * (m.h / 2) + 2;
    let blocked = false;
    for (let t = start; t < f.r * 2; t += 4) {
      const px = m.cx + ux * t;
      const py = m.cy + uy * t;
      if (Math.hypot(px - f.x, py - f.y) > f.r) break; // 走出場域
      // 地圖外面當成實心（地板下面沒有風）
      let solid = px < 0 || py < 0 || px >= COLS * TILE || py >= ROWS * TILE || this.map.pointSolid(px, py);
      if (!solid) {
        for (const e of this.entities) {
          if (e === m || !e.solid || !e.alive) continue;
          if (px > e.x && px < e.x + e.w && py > e.y && py < e.y + e.h) { solid = true; break; }
        }
      }
      if (solid) blocked = true;
      else if (blocked) return true; // 障礙物後面還有風：被擋住了
    }
    return false;
  },

  updateWind(dt) {
    const fields = this.windFields();
    if (!fields.length) return;
    const movers = [this.player];
    for (const e of this.entities) if (e.alive && (e.isBody || e.isBullet || e.isLavaBlob) && !e.held && !e.rewind) movers.push(e);
    for (const f of fields) {
      const wx = f.dir.x * cfg.windSpeed;
      const wy = f.dir.y * cfg.windSpeed;
      for (const m of movers) {
        if (Math.hypot(m.cx - f.x, m.cy - f.y) > f.r) continue;
        if (this.sheltered(f, m)) continue;
        const mass = m.isBullet ? 1 : m.isLavaBlob ? 3 : m.mass ?? 1;
        const area = m.windArea ?? (m.isBullet ? 0.5 : 1);
        const time = m.mods?.time ?? m.time ?? 1;
        let k = (cfg.windAccel * area) / (mass * mass);
        if (m.isPlayer && m.grounded) k *= cfg.windGround; // 玩家站在地上踩得住；箱子和敵人靠原本的地面摩擦抵抗（木箱吹得動、鐵塊吹不動）
        const a = Math.min(1, k * dt * time); // 一幀內最多直接追上風速，不會超過
        m.vx += (wx - m.vx) * a;
        m.vy += (wy - m.vy) * a;
      }
    }
  },
};
