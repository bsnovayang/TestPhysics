import { cfg } from '../config.js';

// 能力的特效：時停累積的箭頭、向量反射、電磁加速的閃電、重力抓取、時間倒轉、定向重力的瞄準
// 這些方法會掛到 Renderer 上（Object.assign），裡面的 this 就是 renderer
export const EffectRenderer = {
  // 時停中累積的力：從物體中心畫出箭頭，力道越大越長、越粗、越亮（時間系的藍色；紅色保留給「加熱」）
  drawStasisArrows(world) {
    const ctx = this.ctx;
    for (const e of world.entities) {
      if (!e.isBody || !e.alive || e.mods.time >= 0.05) continue;
      const v = Math.hypot(e.vx, e.vy);
      if (v < 20) continue;
      const k = Math.min(1, v / 900);
      const len = Math.round(10 + k * 30);
      const ux = e.vx / v;
      const uy = e.vy / v;
      const c = Math.round(120 + k * 135);
      ctx.strokeStyle = `rgb(${Math.round(74 + k * 181)},${Math.round(168 + k * 87)},255)`;
      ctx.lineWidth = k > 0.6 ? 3 : 2;
      this.drawArrow(e.cx + (ux * len) / 2, e.cy + (uy * len) / 2, ux, uy, len);
      ctx.lineWidth = 1;
      if (c > 250 && Math.floor(world.time * 8) % 2) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(e.cx + ux * len) - 1, Math.round(e.cy + uy * len) - 1, 3, 3);
      }
    }
  },

  // 向量反射場：角色周圍一圈轉動的橘色六角形，反射成功時閃白
  drawReflect(world) {
    const rf = world.reflect;
    if (!rf) return;
    const ctx = this.ctx;
    const p = world.player;
    const R = cfg.reflectRadius;
    const spin = world.time * 2;
    ctx.strokeStyle = rf.flash > 0 ? '#ffffff' : 'rgba(255,179,71,0.85)';
    ctx.lineWidth = rf.flash > 0 ? 2 : 1;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = spin + (i / 6) * Math.PI * 2;
      const x = Math.round(p.cx + Math.cos(a) * R) + 0.5;
      const y = Math.round(p.cy + Math.sin(a) * R) + 0.5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffb347';
    ctx.fill();
    ctx.globalAlpha = 1;
  },

  // 電磁加速的閃電：鋸齒狀的青白色線，外層粗、內層白色細線，逐漸淡出
  drawBolts(world) {
    const ctx = this.ctx;
    for (const b of world.bolts) {
      const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
      const n = Math.max(2, Math.round(len / 6));
      const nx = -(b.y2 - b.y1) / (len || 1);
      const ny = (b.x2 - b.x1) / (len || 1);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 8;
        pts.push({ x: b.x1 + (b.x2 - b.x1) * t + nx * j, y: b.y1 + (b.y2 - b.y1) * t + ny * j });
      }
      ctx.globalAlpha = Math.min(1, b.life * 4);
      for (const [color, width] of [['#5fd8ff', 3], ['#ffffff', 1]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
  },

  // 重力抓取：從肩膀到被抓的物體一串紫色光點，物體外圍一圈
  drawGrab(world) {
    const g = world.grab;
    if (!g) return;
    const ctx = this.ctx;
    const o = world.player.shoulder();
    const t = g.target;
    const d = Math.hypot(t.cx - o.x, t.cy - o.y);
    ctx.fillStyle = '#c9a8ff';
    for (let k = 6; k < d; k += 6) {
      const wob = Math.sin(world.time * 20 + k * 0.3) * 1.5;
      ctx.fillRect(Math.round(o.x + ((t.cx - o.x) / d) * k + wob) - 1, Math.round(o.y + ((t.cy - o.y) / d) * k) - 1, 2, 2);
    }
    ctx.strokeStyle = '#c9a8ff';
    ctx.strokeRect(Math.round(t.x) - 2.5, Math.round(t.y) - 2.5, t.w + 5, t.h + 5);
  },

  // 時間倒轉中：剩下要走的路徑畫成淡藍色的點，物體本身染成藍色
  drawRewinds(world) {
    const ctx = this.ctx;
    for (const e of world.entities) {
      const r = e.rewind;
      if (!r || !e.alive) continue;
      ctx.fillStyle = 'rgba(159,216,255,0.7)';
      for (let k = Math.ceil(r.i); k < r.frames.length; k += 6) {
        const p = r.frames[k];
        ctx.fillRect(Math.round(p.x + e.w / 2) - 1, Math.round(p.y + e.h / 2) - 1, 2, 2);
      }
      ctx.fillStyle = 'rgba(74,168,255,0.35)';
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h);
    }
  },

  // 定向重力施放中：從起點到游標的方向箭頭
  drawDirAim(world) {
    const anchor = world.dirAimAnchor?.();
    if (!anchor) return;
    const ctx = this.ctx;
    const dir = world.dirAim.web.dir;
    ctx.strokeStyle = '#d0b0ff';
    ctx.lineWidth = 2;
    this.drawArrow(anchor.x + dir.x * 20, anchor.y + dir.y * 20, dir.x, dir.y, 28);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#d0b0ff';
    ctx.fillRect(Math.round(anchor.x) - 1, Math.round(anchor.y) - 1, 3, 3);
  },
};
