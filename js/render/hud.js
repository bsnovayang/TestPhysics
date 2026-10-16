import { cfg, VIEW_W, VIEW_H, SLOT_KEYS } from '../config.js';
import { SKILLS, TREE_COLORS } from '../skills.js';
import { TEXT, C } from './common.js';

// 介面：HP／MP、技能欄、房間名稱、魔王的血條與重力時鐘、游標與提示、碰撞框
// 這些方法會掛到 Renderer 上（Object.assign），裡面的 this 就是 renderer
export const HudRenderer = {
  drawHud(world) {
    const ctx = this.ctx;
    const p = world.player;
    ctx.font = TEXT;
    ctx.textBaseline = 'middle';

    // HP / MP
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(4, 4, 134, 30);
    ctx.fillStyle = C.hud;
    ctx.fillText('HP', 8, 11);
    for (let i = 0; i < cfg.hp; i++) {
      ctx.fillStyle = i < p.hp ? '#ff6b6b' : '#3a3f4b';
      ctx.fillRect(28 + i * 10, 7, 8, 8);
      if (i < p.hp) { ctx.fillStyle = '#ffb0b0'; ctx.fillRect(28 + i * 10, 7, 3, 2); }
    }
    ctx.fillStyle = C.hud;
    ctx.fillText('MP', 8, 26);
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(28, 22, 104, 8);
    // 維持自身附著時，MP 條改成閃爍的黃色，提醒正在持續消耗
    ctx.fillStyle = world.fields.channeling && Math.floor(world.time * 8) % 2 ? '#ffd34d' : '#4aa8ff';
    ctx.fillRect(28, 22, Math.round((p.mp / cfg.mpMax) * 104), 8);
    const cost = cfg.mpMax * cfg.mpCostRatio;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let x = cost; x < cfg.mpMax; x += cost) ctx.fillRect(28 + Math.round((x / cfg.mpMax) * 104), 22, 1, 8);

    // 房間名稱與提示
    ctx.textAlign = 'center';
    ctx.fillStyle = C.hud;
    ctx.fillText(`${world.room.name}（${world.roomIndex + 1}/${world.roomCount}）`, VIEW_W / 2, 10);
    ctx.fillStyle = C.dim;
    ctx.fillText(cfg.showHints ? world.room.hint : '卡關時按 / 顯示提示', VIEW_W / 2, 25);

    // 訊息
    world.toasts.forEach((t, i) => {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(t.text, VIEW_W / 2, 44 + i * 14);
    });
    ctx.globalAlpha = 1;

    // 技能欄（右上角直排，避免擋住地板與尖刺）
    const slotW = 84;
    const x = VIEW_W - slotW - 4;
    ctx.textAlign = 'left';
    SLOT_KEYS.forEach((slot, i) => {
      const id = world.loadout[i];
      const sk = id ? SKILLS[id] : null;
      const y = 36 + i * 16;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, slotW, 15);
      if (sk) {
        ctx.fillStyle = TREE_COLORS[sk.tree];
        ctx.fillRect(x, y, 3, 15);
      }
      ctx.fillStyle = C.dim;
      ctx.fillText(slot.label, x + 6, y + 8);
      const cd = id ? world.cooldowns[id] ?? 0 : 0;
      ctx.fillStyle = sk && p.mp >= cost && cd <= 0 ? C.hud : C.dim;
      ctx.fillText(sk ? sk.name : '—', x + 32, y + 8);
      // 冷卻中：暗色進度條加剩餘秒數；維持中的向量反射：橘色外框
      if (cd > 0) {
        const total = id === 'reflect' ? cfg.reflectCdEmpty : id === 'railgun' ? cfg.railCd : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x + 3, y, Math.round((slotW - 3) * Math.min(1, cd / total)), 15);
        ctx.fillStyle = '#ffd34d';
        ctx.textAlign = 'right';
        ctx.fillText(cd.toFixed(1), x + slotW - 3, y + 8);
        ctx.textAlign = 'left';
      }
      if (id === 'reflect' && world.reflect) {
        ctx.strokeStyle = '#ffb347';
        ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, 14);
      }
    });

    ctx.fillStyle = C.dim;
    ctx.fillText('H 說明　Tab 裝備', 6, 44);
    if (this.versionLabel) ctx.fillText('水：' + this.versionLabel, 6, 58);
    ctx.textBaseline = 'alphabetic';
  },

  // 魔王房間：畫面下方顯示重力時鐘與魔王的血條；王身上顯示目前的重力方向與倒數
  drawBossHud(world) {
    const boss = world.entities.find((e) => e.isBoss && e.alive);
    if (!boss) return;
    const ctx = this.ctx;
    const blink = Math.floor(world.time * 6) % 2 === 0;
    const warn = !!boss.warnDir && boss.moveT <= 0;

    // 王身上：外圈轉動的光點（預告時越轉越快），箭頭指向目前的重力方向，預告時改指下一個方向並閃爍
    const spin = world.time * (warn ? 6 : 1.5);
    ctx.fillStyle = warn ? '#ffd34d' : 'rgba(201,168,255,0.8)';
    for (let i = 0; i < 6; i++) {
      const a = spin + (i / 6) * Math.PI * 2;
      ctx.fillRect(Math.round(boss.cx + Math.cos(a) * 21) - 1, Math.round(boss.cy + Math.sin(a) * 21) - 1, 2, 2);
    }
    const g = world.fields.base;
    const d = warn ? boss.warnDir : g;
    if (!warn || blink) {
      ctx.strokeStyle = warn ? '#ffd34d' : '#ffffff';
      ctx.lineWidth = 2;
      this.drawArrow(boss.cx + d.x * 30, boss.cy + d.y * 30, d.x, d.y, 14);
      ctx.lineWidth = 1;
    }
    ctx.font = TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (warn) {
      // 倒數 3、2、1（顯示在王的另一側，避免被箭頭擋住）
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(String(Math.ceil(boss.timer)), Math.round(boss.cx - d.x * 32), Math.round(boss.cy - d.y * 32));
    }

    // 重力時鐘（畫在最下面那排地板上，不會擋住玩家）：整個循環排成一排，框起目前的方向；
    // 下一格在預告時閃爍；下面的條是距離下次轉向的時間
    const c = boss.clock(world);
    const cell = 16;
    const n = c.cycle.length;
    const x0 = Math.round(VIEW_W / 2 - (n * cell) / 2);
    const y0 = 339;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x0 - 3, y0 - 2, n * cell + 6, cell + 3);
    c.cycle.forEach((dir, i) => {
      const cx = x0 + i * cell + cell / 2;
      const cy = y0 + cell / 2;
      const cur = i === c.index;
      const next = i === (c.index + 1) % n;
      if (cur) {
        ctx.fillStyle = '#a070ff';
        ctx.fillRect(x0 + i * cell + 1, y0, cell - 2, cell);
      }
      ctx.strokeStyle = cur ? '#ffffff' : next && warn ? (blink ? '#ffd34d' : '#7d869a') : next ? '#ffd34d' : '#7d869a';
      ctx.lineWidth = 2;
      this.drawArrow(cx, cy, dir.x, dir.y, 9);
      ctx.lineWidth = 1;
    });
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(x0, y0 + cell - 1, n * cell, 2);
    ctx.fillStyle = warn ? '#ffd34d' : '#c9a8ff';
    ctx.fillRect(x0, y0 + cell - 1, Math.round((1 - Math.max(0, c.timer) / c.period) * n * cell), 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 血條（中間的白線：進入第二階段的位置）
    const w = 140;
    const x = x0 + n * cell + 12;
    const y = 344;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 2, y - 2, w + 4, 10);
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = boss.phase === 2 ? '#d060c0' : '#a070ff';
    ctx.fillRect(x, y, Math.round((boss.hp / boss.maxHp) * w), 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + w / 2, y, 1, 6);
  },

  // 游標旁的施放方式提示
  drawCastHint(world, x, y) {
    const ctx = this.ctx;
    let text = null;
    let color = '#e8edf5';
    if (world.fields.channeling) {
      text = '維持中：放開按鍵結束';
      color = '#ffd34d';
    } else if (world.dirAim) {
      text = '移動游標決定方向，放開確定';
      color = '#d0b0ff';
    } else if (world.grab) {
      text = '移動游標搬運，放開丟出';
      color = '#d0b0ff';
    } else if (world.isSelfCast()) {
      if (cfg.selfAttachUnlocked) {
        text = '長按：附著自己（持續耗 MP）';
        color = '#78ffb4';
      } else {
        text = '自身附著尚未解鎖';
        color = '#7d869a';
      }
    } else {
      const pv = world.previewWeb();
      if (pv.target) {
        text = '按一下：附著在目標上';
        color = '#78ffb4';
      }
    }
    if (!text) return;
    ctx.font = TEXT;
    const w = ctx.measureText(text).width;
    // 靠近右邊緣時改顯示在游標左側
    const tx = x + 10 + w > VIEW_W - 4 ? x - 10 - w : x + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(Math.round(tx) - 3, y + 6, Math.ceil(w) + 6, 15);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, Math.round(tx), y + 14);
    ctx.textBaseline = 'alphabetic';
  },

  drawCursor(world) {
    const ctx = this.ctx;
    const { x, y } = world.mouse;
    this.drawCastHint(world, x, y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 6, y); ctx.lineTo(x - 2, y);
    ctx.moveTo(x + 2, y); ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 2);
    ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 6);
    ctx.stroke();
  },

  drawHitboxes(world) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#00ff88';
    for (const b of [world.player, ...world.entities]) {
      if (b.w) ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    }
    for (const s of world.switches) {
      ctx.strokeStyle = '#ffff00';
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    }
    const p = world.player;
    const m = p.mods;
    ctx.fillStyle = '#00ff88';
    ctx.font = `8px monospace`;
    ctx.fillText(
      `g=(${m.gx.toFixed(0)},${m.gy.toFixed(0)}) t=${p.timeScale.toFixed(2)} v=(${p.vx.toFixed(0)},${p.vy.toFixed(0)}) ${p.grounded ? 'ground' : 'air'}`,
      4, VIEW_H - 40,
    );
  },
};
