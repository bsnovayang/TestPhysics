import { cfg } from '../config.js';

// 溫度場：在溫度系統裡就當成一台可以移動的火爐（加熱）或冷凍裝置（冷卻），
// 所以原本火爐、冷凍裝置的規則全部適用：煮水成蒸氣、融冰；水結冰、熔岩凝固成石頭、蒸氣凝結。
// 另外：敵人在冷卻的範圍裡會凍僵，動作變慢（Enemy.update）
// 這些方法會掛到 World 上（Object.assign），裡面的 this 就是 world
export const ThermalAbility = {
  // 熱源：點燃的火爐、加熱場（被溫度干擾器關掉的不算）。{ cx, cy, r }
  heatSources() {
    const list = this.entities.filter((e) => e.isHeater && e.on && e.alive).map((e) => ({ cx: e.cx, cy: e.cy, r: cfg.heatRadius }));
    for (const f of this.fields.list) {
      if (f.skill.type === 'heat' && !this.fields.jammedAt(f.x, f.y, 'thermal')) list.push({ cx: f.x, cy: f.y, r: f.r });
    }
    return list;
  },

  // 冷源：冷凍裝置、冷卻場。{ cx, cy, r }
  coldSources() {
    const list = this.entities.filter((e) => e.isCooler && e.alive).map((e) => ({ cx: e.cx, cy: e.cy, r: cfg.coldRadius }));
    for (const f of this.fields.list) {
      if (f.skill.type === 'cool' && !this.fields.jammedAt(f.x, f.y, 'thermal')) list.push({ cx: f.x, cy: f.y, r: f.r });
    }
    return list;
  },

  // 某個物體是不是在冷源的範圍裡（敵人會凍僵）
  inCold(e) {
    return this.coldSources().some((c) => Math.hypot(e.cx - c.cx, e.cy - c.cy) <= c.r);
  },
};
