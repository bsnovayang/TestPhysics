import { cfg } from '../config.js';
import { TREE_COLORS } from '../skills.js';
import { TEXT } from './common.js';

// 場域：範圍、外框、圖示、施放預覽
// 這些方法會掛到 Renderer 上（Object.assign），裡面的 this 就是 renderer
export const FieldRenderer = {
  // 畫出來的場域半徑：附著的時停只凍結目標本身，所以只畫一個貼著目標的小圈
  fieldDrawR(f) {
    if (f.target && f.skill.type === 'timeMult' && f.skill.value === 0) return Math.hypot(f.target.w, f.target.h) / 2 + 3;
    return f.r;
  },

  drawFieldFills(world) {
    const ctx = this.ctx;
    for (const f of world.fields.list) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = (f.skill.color ?? TREE_COLORS[f.skill.tree]);
      ctx.beginPath();
      ctx.arc(f.x, f.y, this.fieldDrawR(f), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  drawFieldOutlines(world) {
    const ctx = this.ctx;
    for (const f of world.fields.list) {
      const color = (f.skill.color ?? TREE_COLORS[f.skill.tree]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      // 附著的場域用虛線外框，和固定在原地的場域區分
      if (f.target) ctx.setLineDash([3, 3]);
      const r = this.fieldDrawR(f);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 剩餘時間；維持型場域沒有時間限制，改用閃爍的完整外圈表示
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (f.channel) {
        ctx.globalAlpha = 0.6 + Math.sin(world.time * 12) * 0.3;
        ctx.arc(f.x, f.y, r + 2, 0, Math.PI * 2);
      } else {
        ctx.globalAlpha = 0.95;
        ctx.arc(f.x, f.y, r + 2, -Math.PI / 2, -Math.PI / 2 + (f.life / f.maxLife) * Math.PI * 2);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      if (r === f.r) this.drawFieldIcon(f, color);
    }
  },

  drawFieldIcon(f, color) {
    const ctx = this.ctx;
    const s = f.skill;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (s.type === 'gravityMult') {
      if (s.value === 0) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        this.drawArrow(f.x, f.y, 0, Math.sign(s.value), 4 + Math.abs(s.value) * 6);
      }
    } else if (s.type === 'gravityDir') {
      this.drawArrow(f.x, f.y, f.dir.x, f.dir.y, 10);
    } else if (s.type === 'gravityPoint') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this.drawArrow(f.x + Math.cos(a) * 14, f.y + Math.sin(a) * 14, -Math.cos(a), -Math.sin(a), 6);
      }
    } else if (s.type === 'magnet') {
      // 馬蹄形磁鐵
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 1, 5, Math.PI, 0);
      ctx.moveTo(f.x - 5, f.y - 1); ctx.lineTo(f.x - 5, f.y + 5);
      ctx.moveTo(f.x + 5, f.y - 1); ctx.lineTo(f.x + 5, f.y + 5);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f.x - 6, f.y + 4, 3, 2);
      ctx.fillRect(f.x + 4, f.y + 4, 3, 2);
      ctx.fillStyle = color;
    } else if (s.type === 'reflectField') {
      // 反射場：邊界畫成一圈粗的橘色
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      this.drawArrow(f.x - 5, f.y, -1, 0, 6);
      this.drawArrow(f.x + 5, f.y, 1, 0, 6);
    } else if (s.type === 'wind') {
      // 風場：三條沿著風向流動的短線
      const t = (Date.now() / 300) % 1;
      for (let k = -1; k <= 1; k++) {
        const px = -f.dir.y * k * 8;
        const py = f.dir.x * k * 8;
        const off = ((t + k * 0.33 + 1) % 1) * 24 - 12;
        this.drawArrow(f.x + px + f.dir.x * off, f.y + py + f.dir.y * off, f.dir.x, f.dir.y, 8);
      }
    } else if (s.type === 'heat') {
      // 加熱：三道往上飄的熱浪
      for (let k = -1; k <= 1; k++) {
        const t = (Date.now() / 400 + k * 0.3) % 1;
        ctx.fillRect(Math.round(f.x + k * 6), Math.round(f.y + 6 - t * 12), 2, 4);
      }
    } else if (s.type === 'cool') {
      // 冷卻：雪花
      for (const [ax, ay] of [[1, 0], [0, 1], [0.7, 0.7], [0.7, -0.7]]) {
        ctx.beginPath();
        ctx.moveTo(f.x - ax * 6, f.y - ay * 6);
        ctx.lineTo(f.x + ax * 6, f.y + ay * 6);
        ctx.stroke();
      }
    } else if (s.type === 'timeMult') {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (s.value === 0) {
        ctx.fillRect(f.x - 3, f.y - 3, 2, 6);
        ctx.fillRect(f.x + 1, f.y - 3, 2, 6);
      } else {
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x, f.y - 4);
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + 3, f.y);
        ctx.stroke();
      }
    }
    ctx.font = TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(s.name, f.x, f.y + f.r - 4);
    ctx.textAlign = 'left';
  },

  drawArrow(x, y, dx, dy, len) {
    const ctx = this.ctx;
    const ex = x + dx * len / 2;
    const ey = y + dy * len / 2;
    ctx.beginPath();
    ctx.moveTo(x - dx * len / 2, y - dy * len / 2);
    ctx.lineTo(ex, ey);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - dx * 3 - dy * 3, ey - dy * 3 + dx * 3);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - dx * 3 + dy * 3, ey - dy * 3 - dx * 3);
    ctx.stroke();
  },

  drawPreview(world) {
    const ctx = this.ctx;
    const pv = world.previewWeb();
    ctx.save();
    ctx.setLineDash([4, 4]);
    if (pv.target !== world.player) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(pv.o.x, pv.o.y);
      ctx.lineTo(pv.x, pv.y);
      ctx.stroke();
    }
    ctx.strokeStyle = pv.target ? 'rgba(120,255,180,0.6)' : pv.blocked ? 'rgba(255,200,120,0.5)' : 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(pv.x, pv.y, cfg.fieldRadius, 0, Math.PI * 2);
    ctx.stroke();
    // 會附著的對象加上外框
    if (pv.target) {
      ctx.setLineDash([]);
      ctx.strokeRect(pv.target.x - 2.5, pv.target.y - 2.5, pv.target.w + 5, pv.target.h + 5);
      ctx.setLineDash([4, 4]);
    }
    // 射程
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(pv.o.x, pv.o.y, cfg.webRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
};
