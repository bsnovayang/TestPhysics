import { cfg } from '../config.js';
import { Heavy, Jumper, Flyer, Turret, LaserEnemy } from '../enemies.js';
import { Presser, Balloon, CeilingWalker, ShieldSoldier, GravityBoss } from '../gravity-enemies.js';
import { heroSprites, HERO_ANIMS, enemySprites } from '../pixel/art.js';

// 角色與敵人的像素精靈、重力盾
// 這些方法會掛到 Renderer 上（Object.assign），裡面的 this 就是 renderer
export const ActorRenderer = {
  drawEnemy(world, e) {
    const ctx = this.ctx;
    const up = e.groundAxis === 'y' && e.groundSign < 0;
    const kind = e instanceof GravityBoss ? (e.phase === 2 ? 'boss2' : 'boss') : e instanceof Presser ? 'presser'
      : e instanceof Balloon ? 'balloon' : e instanceof CeilingWalker ? 'ceiling' : e instanceof ShieldSoldier ? 'shield'
      : e instanceof LaserEnemy ? 'laser' : e instanceof Heavy ? 'heavy' : e instanceof Jumper ? 'jumper'
      : e instanceof Flyer ? 'flyer' : e instanceof Turret ? 'turret' : 'walker';
    if (e.shieldR) this.drawShield(world, e);
    const frames = enemySprites(kind);
    const fr = frames[Math.floor(world.time * (kind === 'flyer' ? 10 : 5) + e.x * 0.01) % 2];
    const img = e.flashT > 0 ? fr.flash : fr.canvas;
    const dir = e.dir ?? (Math.sign(world.player.cx - e.cx) || 1);
    ctx.save();
    ctx.translate(Math.round(e.cx), Math.round(e.cy));
    ctx.scale(dir < 0 ? -1 : 1, up ? -1 : 1);
    ctx.drawImage(img, -Math.floor(img.width / 2), -Math.floor(img.height / 2));
    ctx.restore();

    if (e instanceof Turret) {
      const p = world.player;
      const a = Math.atan2(p.cy - e.cy, p.cx - e.cx);
      ctx.strokeStyle = '#3b4250';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.cx, e.cy);
      ctx.lineTo(e.cx + Math.cos(a) * 11, e.cy + Math.sin(a) * 11);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (e instanceof LaserEnemy) {
      // 眼睛：集氣時越來越亮
      const charge = e.state === 'charge' ? Math.min(1, e.timer / cfg.laserCharge) : e.state === 'fire' ? 1 : 0;
      if (charge > 0) {
        ctx.fillStyle = `rgba(255,${Math.round(220 - charge * 180)},${Math.round(240 - charge * 160)},1)`;
        const r = Math.round(1 + charge * 2);
        ctx.fillRect(Math.round(e.eye.x) - r, Math.round(e.eye.y) - r, r * 2, r * 2);
      }
    }

    // 被電到：黃色閃爍
    if (e.shocked && Math.floor(world.time * 20) % 2) {
      ctx.fillStyle = 'rgba(255,225,77,0.55)';
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h);
    }
    // 凍僵（在冷卻範圍裡）：淡藍色覆蓋
    if (e.chilled) {
      ctx.fillStyle = 'rgba(159,216,255,0.35)';
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h);
    }
    // 被附身：閃爍的粉紅色光圈，頭上一顆眼睛
    if (e.possessed) {
      ctx.strokeStyle = Math.floor(world.time * 8) % 2 ? '#ff7ad9' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(e.x) - 3, Math.round(e.y) - 3, e.w + 6, e.h + 6);
      ctx.lineWidth = 1;
      const hx = Math.round(e.cx);
      const hy = Math.round(e.y) - 10;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - 3, hy, 7, 3);
      ctx.fillStyle = '#ff7ad9';
      ctx.fillRect(hx - 1, hy, 3, 3);
    }
    // 自己人（被洗腦）：粉紅色外框，頭上一顆愛心，血量一直顯示
    if (e.ally) {
      ctx.strokeStyle = '#ff7ad9';
      ctx.strokeRect(Math.round(e.x) - 2.5, Math.round(e.y) - 2.5, e.w + 5, e.h + 5);
      const hx = Math.round(e.cx);
      const hy = Math.round(e.y) - 10;
      ctx.fillStyle = '#ff7ad9';
      for (const [x, y, w] of [[-3, 0, 2], [1, 0, 2], [-3, 1, 6], [-2, 2, 4], [-1, 3, 2]]) ctx.fillRect(hx + x, hy + y, w, 1);
    }
    // 血量
    if ((e.friendly || !e.armored) && !e.isBoss && e.hp < e.maxHp) {
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? '#ff6b6b' : '#444';
        ctx.fillRect(e.x + i * 4, e.y - 5, 3, 2);
      }
    }
    this.timeTint(e);
  },

  // 重力盾：紫色的虛線圈，被干擾時變暗
  drawShield(world, e) {
    const ctx = this.ctx;
    const on = !world.fields.jammedAt(e.cx, e.cy, 'gravity');
    const n = 28;
    const spin = world.time * 1.5;
    ctx.fillStyle = on ? 'rgba(201,168,255,0.85)' : 'rgba(120,120,140,0.5)';
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const a = (i / n) * Math.PI * 2 + spin;
      ctx.fillRect(Math.round(e.cx + Math.cos(a) * e.shieldR) - 1, Math.round(e.cy + Math.sin(a) * e.shieldR) - 1, 2, 2);
    }
  },

  drawPlayer(world) {
    const ctx = this.ctx;
    const p = world.player;
    if (p.invT > 0 && Math.floor(world.time * 20) % 2 === 0) return;

    // 精靈：腳朝向重力方向（重力反轉就倒過來、側向重力就轉 90 度）
    const axis = p.groundAxis ?? 'y';
    const sign = p.groundAxis ? p.groundSign : 1;
    const along = axis === 'y' ? p.vx : p.vy;
    const across = (axis === 'y' ? p.vy : p.vx) * sign;
    let anim = 'idle';
    if (!p.grounded && p.groundAxis) anim = across < 0 ? 'jump' : 'fall';
    else if (!p.groundAxis) anim = 'fall';
    else if (Math.abs(along) > 10) anim = 'run';
    const A = HERO_ANIMS[anim];
    const pose = A.frames[Math.floor(world.time * A.fps) % A.frames.length];
    const spr = heroSprites()[pose];
    const img = p.stunT > 0 ? spr.flash : spr.canvas;
    const rot = axis === 'y' ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    // 面向：畫面上的左右（倒立時精靈左右也會跟著反過來，所以要補回來）
    const face = axis === 'y' ? p.facing * sign : p.facing;
    ctx.save();
    ctx.translate(Math.round(p.cx), Math.round(p.cy));
    ctx.rotate(rot);
    ctx.scale(face < 0 ? -1 : 1, 1);
    ctx.drawImage(img, -9, -19);
    ctx.restore();

    // 指向游標的砲管：逐像素畫的短管，管口一點亮色
    const o = p.shoulder();
    const a = Math.atan2(world.mouse.y - o.y, world.mouse.x - o.x);
    for (let k = 2; k <= 10; k++) {
      const bx = Math.round(o.x + Math.cos(a) * k);
      const by = Math.round(o.y + Math.sin(a) * k);
      ctx.fillStyle = '#10131a';
      ctx.fillRect(bx - 2, by - 2, 4, 4);
    }
    for (let k = 2; k <= 10; k++) {
      const bx = Math.round(o.x + Math.cos(a) * k);
      const by = Math.round(o.y + Math.sin(a) * k);
      ctx.fillStyle = k >= 9 ? '#4ad0ff' : '#9aa7bd';
      ctx.fillRect(bx - 1, by - 1, 2, 2);
    }

    // 靜止回復中：身邊往上飄的藍色光點
    if (p.restBoost > 0) {
      ctx.fillStyle = '#9fd8ff';
      for (let i = 0; i < 6; i++) {
        const t = (world.time * 0.8 + i / 6) % 1;
        const x = Math.round(p.cx + Math.sin(i * 2.1 + world.time) * 9);
        const y = Math.round(p.y + p.h - t * 34);
        ctx.globalAlpha = p.restBoost * (1 - t);
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (p.timeScale !== 1) this.timeTint({ x: p.x, y: p.y, w: p.w, h: p.h, time: p.timeScale });
    if (p.hasteT > 0) {
      ctx.strokeStyle = 'rgba(74,168,255,0.8)';
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(p.x - 3.5, p.y - 3.5, p.w + 7, p.h + 7);
      ctx.setLineDash([]);
    }
  },
};
