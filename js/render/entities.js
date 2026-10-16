import { cfg, VIEW_H } from '../config.js';
import { SKILLS, TREE_COLORS } from '../skills.js';
import { Box, BoxSpawner, MovingPlatform, Blade, Crusher } from '../objects.js';
import { Emitter, MirrorBox } from '../light.js';
import { crateSprite } from '../pixel/art.js';
import { TEXT, C, JAMMER_COLORS } from './common.js';

// 物件：箱子、機關、裝置、子彈、粒子與傷害數字
// 這些方法會掛到 Renderer 上（Object.assign），裡面的 this 就是 renderer
export const EntityRenderer = {
  // 被時間場域影響的物件畫上淡藍色外框，讓玩家看出它變慢了
  timeTint(obj) {
    const t = obj.time ?? obj.mods?.time ?? 1;
    if (t === 1) return;
    const ctx = this.ctx;
    ctx.strokeStyle = t === 0 ? 'rgba(120,200,255,0.95)' : 'rgba(74,168,255,0.6)';
    ctx.strokeRect(obj.x - 1.5, obj.y - 1.5, obj.w + 3, obj.h + 3);
  },

  drawEntity(world, e) {
    const ctx = this.ctx;
    if (e.isLavaBlob) {
      // 飛行中的熔岩塊；被時停時畫成暗紅色並加框（可以站、不燙）
      // 用 2 px 的小方塊組成（和熔岩池同樣的像素質感與顏色），四個角挖掉，看起來像一團熔岩
      const frozen = e.time < 0.05;
      const seed = Math.floor(e.x * 7 + e.y * 13);
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          if ((px === 0 || px === 3) && (py === 0 || py === 3)) continue;
          const n = (seed + px * 31 + py * 17) % 7;
          ctx.fillStyle = frozen ? (n < 3 ? '#6b2a1c' : '#7a3322') : py === 0 ? '#ff9640' : n < 2 ? '#ffb347' : n < 5 ? '#d8441c' : '#c4361b';
          ctx.fillRect(Math.round(e.x) + px * 2, Math.round(e.y) + py * 2, 2, 2);
        }
      }
      if (frozen) {
        ctx.strokeStyle = 'rgba(200,240,255,0.7)';
        ctx.strokeRect(e.x - 0.5, e.y - 0.5, e.w + 1, e.h + 1);
      }
      return;
    }
    if (e.isBomb) {
      // 火山彈：黑色石塊帶橘色裂紋
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.rotate(e.spin);
      ctx.fillStyle = '#2b2426';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.moveTo(-3, -1); ctx.lineTo(1, 1); ctx.lineTo(3, -2);
      ctx.stroke();
      ctx.restore();
      if (e.time < 0.05) this.timeTint(e);
      return;
    }
    if (e.isVent) {
      // 噴發口：火山口的形狀，預兆時越來越亮
      const glow = e.state === 'warn' ? 1 - e.timer / cfg.ventWarn : e.state === 'erupt' ? 1 : 0.15;
      ctx.fillStyle = '#3a2a26';
      ctx.beginPath();
      ctx.moveTo(e.x - 2, e.y + e.h);
      ctx.lineTo(e.x + 4, e.y + 4);
      ctx.lineTo(e.x + e.w - 4, e.y + 4);
      ctx.lineTo(e.x + e.w + 2, e.y + e.h);
      ctx.fill();
      ctx.fillStyle = `rgba(255,${Math.round(90 + glow * 120)},40,${0.4 + glow * 0.6})`;
      ctx.fillRect(e.x + 5, e.y + 3, e.w - 10, 3);
      if (e.blocked) {
        ctx.fillStyle = '#7d869a';
        ctx.font = TEXT;
        ctx.textAlign = 'center';
        ctx.fillText('封住', e.cx, e.y - 2);
        ctx.textAlign = 'left';
      }
      return;
    }
    if (e.isSource) {
      // 液體源：牆上的出水口，開啟時有液體流出的顏色
      ctx.fillStyle = '#3b4250';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      const color = e.liquid === 'lava' ? '#ff6a2a' : '#4aa8ff';
      ctx.fillStyle = e.on ? color : '#5a5f6b';
      const d = e.dir ?? { x: 0, y: 1 };
      ctx.fillRect(e.cx + d.x * 5 - 3, e.cy + d.y * 5 - 3, 6, 6);
      // 開啟時畫出流出去的液柱：從出口往下，直到碰到地面或液面；關閉時就沒有，一眼看得出狀態
      if (e.on && !e.full) {
        const sx = e.cx + d.x * 10;
        let sy = e.cy + d.y * 10;
        const y0 = sy;
        while (sy < VIEW_H && !world.map.pointSolid(sx, sy) && !world.water.pointInWater(sx, sy) && !world.water.pointInLava(sx, sy)) sy += 2;
        ctx.fillStyle = e.liquid === 'lava' ? 'rgba(255,120,40,0.85)' : 'rgba(90,160,255,0.7)';
        for (let y = y0; y < sy; y += 2) ctx.fillRect(sx - 1 + (Math.floor(world.time * 20 + y / 2) % 3 === 0 ? 1 : 0), y, 2, 2);
      }
      ctx.strokeStyle = color;
      ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      return;
    }
    if (e.isGenerator) {
      // 發電機：線圈加上閃爍的指示燈
      ctx.fillStyle = '#3b4250';
      ctx.fillRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
      ctx.fillStyle = '#b0753a';
      for (let k = 0; k < 4; k++) ctx.fillRect(e.x + 3, e.y + 3 + k * 3, e.w - 6, 2);
      ctx.fillStyle = e.on ? (Math.floor(world.time * 6) % 2 ? '#ffe14d' : '#fff6b0') : '#555';
      ctx.fillRect(e.x + 6, e.y + 6, 4, 4);
      return;
    }
    if (e.isElectromagnet) {
      // 電磁鐵：線圈，通電時發光並畫出吸引範圍
      ctx.fillStyle = '#3b4250';
      ctx.fillRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
      ctx.fillStyle = e.powered ? '#ffe14d' : '#b0753a';
      for (let k = 0; k < 4; k++) ctx.fillRect(e.x + 3 + k * 3, e.y + 3, 2, e.h - 6);
      if (e.powered) {
        ctx.strokeStyle = 'rgba(255,225,77,0.35)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(e.cx, e.cy, cfg.magnetRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      return;
    }
    if (e.isHeater) {
      // 火爐：點燃時顯示範圍和發紅的爐口；熄滅時爐口是暗灰色
      if (e.on) {
        ctx.strokeStyle = 'rgba(255,140,60,0.35)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(e.cx, e.cy, cfg.heatRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#3b2a24';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = e.on ? `rgba(255,${Math.round(110 + Math.sin(world.time * 6) * 30)},40,1)` : '#5a5f6b';
      ctx.fillRect(e.x + 3, e.y + 4, e.w - 6, 3);
      ctx.fillRect(e.x + 3, e.y + 9, e.w - 6, 3);
      return;
    }
    if (e.isSteamPlatform) {
      ctx.fillStyle = '#7d8799';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#2a2f3c';
      for (let x = e.x + 4; x < e.x + e.w - 2; x += 8) ctx.fillRect(x, e.y + 3, 4, 2);
      ctx.fillStyle = '#c9d2e0';
      ctx.fillRect(e.x, e.y, e.w, 1);
      this.timeTint(e);
      return;
    }
    if (e.isCooler) {
      // 冷凍裝置：雪花＋範圍
      ctx.strokeStyle = 'rgba(200,240,255,0.35)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(e.cx, e.cy, cfg.coldRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2a2f3c';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = '#e0f6ff';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI + world.time * 0.5;
        ctx.moveTo(e.cx - Math.cos(a) * 5, e.cy - Math.sin(a) * 5);
        ctx.lineTo(e.cx + Math.cos(a) * 5, e.cy + Math.sin(a) * 5);
      }
      ctx.stroke();
      return;
    }
    if (e.isIce) {
      const heat = Math.min(1, e.heat / cfg.meltTime);
      ctx.fillStyle = heat > 0 ? `rgba(${Math.round(200 + heat * 55)},${Math.round(235 - heat * 60)},255,0.9)` : 'rgba(200,235,255,0.85)';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(e.x + 2, e.y + 2, 6, 2);
      ctx.strokeStyle = '#8cc8e8';
      ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      this.timeTint(e);
      return;
    }
    if (e.isJammer) {
      const color = JAMMER_COLORS[e.kind];
      ctx.fillStyle = '#2a2f3c';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
      // 禁止符號
      ctx.beginPath();
      ctx.arc(e.cx, e.cy, 4.5, 0, Math.PI * 2);
      ctx.moveTo(e.cx - 3.2, e.cy + 3.2);
      ctx.lineTo(e.cx + 3.2, e.cy - 3.2);
      ctx.stroke();
      ctx.lineWidth = 1;
      // 可移動的干擾器底部畫兩條線，和固定的區分
      if (e instanceof Box) {
        ctx.fillStyle = color;
        ctx.fillRect(e.x + 2, e.y + e.h - 3, e.w - 4, 1);
      }
      this.timeTint(e);
      return;
    }
    if (e instanceof Emitter) {
      ctx.fillStyle = '#3b4250';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#7ff3ff';
      const d = e.dir ?? { x: 1, y: 0 };
      ctx.fillRect(e.cx + d.x * 5 - 2, e.cy + d.y * 5 - 2, 4, 4);
      return;
    }
    if (e instanceof MirrorBox) {
      ctx.fillStyle = '#4b5a6b';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = '#d8f6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (e.orient === '/') { ctx.moveTo(e.x + 2, e.y + e.h - 2); ctx.lineTo(e.x + e.w - 2, e.y + 2); }
      else { ctx.moveTo(e.x + 2, e.y + 2); ctx.lineTo(e.x + e.w - 2, e.y + e.h - 2); }
      ctx.stroke();
      ctx.lineWidth = 1;
      this.timeTint(e);
      return;
    }
    if (e instanceof BoxSpawner) {
      // 生成器：外框＋補充進度條
      ctx.strokeStyle = '#8a6435';
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8a6435';
      ctx.fillRect(e.x - 2, e.y - 4, e.w + 4, 2);
      if (e.progress < 1) {
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(e.x - 2, e.y - 4, (e.w + 4) * e.progress, 2);
      }
      return;
    }
    if (e instanceof Box) {
      const crate = crateSprite(e.isIron ? 'iron' : 'box');
      if (e.w === 16 && e.h === 16) ctx.drawImage(crate, Math.round(e.x), Math.round(e.y));
      else ctx.drawImage(crate, Math.round(e.x), Math.round(e.y), e.w, e.h);
      if (e.key) this.drawKey(Math.round(e.cx), Math.round(e.cy), C.key);
      this.timeTint(e);
    } else if (e instanceof MovingPlatform) {
      ctx.fillStyle = C.platform;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#8fb8d4';
      ctx.fillRect(e.x, e.y, e.w, 2);
      this.timeTint(e);
    } else if (e instanceof Blade) {
      const c = Math.cos(e.angle) * e.len;
      const s = Math.sin(e.angle) * e.len;
      ctx.strokeStyle = e.time === 1 ? '#d0d6e2' : '#7cc4ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.x - c, e.y - s);
      ctx.lineTo(e.x + c, e.y + s);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (e instanceof Crusher) {
      ctx.fillStyle = '#6b7385';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = C.spike;
      for (let x = e.x; x < e.x + e.w; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, e.y + e.h);
        ctx.lineTo(x + 8, e.y + e.h);
        ctx.lineTo(x + 4, e.y + e.h + 5);
        ctx.fill();
      }
      ctx.strokeStyle = '#444b5a';
      ctx.beginPath();
      ctx.moveTo(e.cx, 0);
      ctx.lineTo(e.cx, e.y);
      ctx.stroke();
      this.timeTint(e);
    } else if (e.isBullet) {
      ctx.fillStyle = e.friendly ? C.shot : e.gravityBullet ? '#c070ff' : C.bullet;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      if (e.solid) {
        ctx.strokeStyle = '#9fdcff';
        ctx.strokeRect(e.x - 1.5, e.y - 1.5, e.w + 3, e.h + 3);
      }
    } else if (e.isEnemy) {
      this.drawEnemy(world, e);
    }
  },

  drawProjectiles(world) {
    const ctx = this.ctx;
    for (const pr of world.projectiles) {
      if (pr.skillId) {
        const color = SKILLS[pr.skillId].color ?? TREE_COLORS[SKILLS[pr.skillId].tree];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + world.time * 10;
          ctx.moveTo(pr.x, pr.y);
          ctx.lineTo(pr.x + Math.cos(a) * 5, pr.y + Math.sin(a) * 5);
        }
        ctx.stroke();
        ctx.fillStyle = C.web;
        ctx.fillRect(pr.x - 1.5, pr.y - 1.5, 3, 3);
      } else {
        // 蓄力砲：比較大、外圈白色
        const big = (pr.power ?? 1) > 1;
        ctx.fillStyle = big ? '#ffffff' : C.shot;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, big ? 5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (big) {
          ctx.fillStyle = C.shot;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  },

  drawParticles(world) {
    const ctx = this.ctx;
    for (const pt of world.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 3));
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 1, pt.y - 1, 2, 2);
    }
    // 傷害數字
    ctx.font = TEXT;
    ctx.textAlign = 'center';
    for (const pp of world.popups) {
      ctx.globalAlpha = Math.min(1, pp.life * 3);
      ctx.fillStyle = '#000';
      ctx.fillText(pp.text, pp.x + 1, pp.y + 1);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  },
};
