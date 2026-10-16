import { cfg, COLS, ROWS, SLOT_KEYS } from './config.js';
import { TileMap } from './tilemap.js';
import { Field, FieldSystem } from './fields.js';
import { SKILLS, DEFAULT_LOADOUT, isFieldSkill } from './skills.js';
import { PortalSystem } from './portals.js';
import { rectsOverlap, impactDamage } from './body.js';
import { Player } from './player.js';
import { Web } from './projectiles.js';
import { WaterSystem } from './water.js';
import { ROOMS } from './rooms.js';
import { LEGEND } from './legend.js';
import { DirAimAbility } from './abilities/dir-aim.js';
import { GrabAbility } from './abilities/grab.js';
import { ReflectFieldAbility } from './abilities/reflect-field.js';
import { ThermalAbility } from './abilities/thermal.js';
import { WindAbility } from './abilities/wind.js';
import { ElectricAbility } from './abilities/electric.js';
import { DeviceAbility } from './abilities/devices.js';
import { RailgunAbility } from './abilities/railgun.js';
import { RewindAbility } from './abilities/rewind.js';
import { BlinkAbility } from './abilities/blink.js';
import { CharmAbility } from './abilities/charm.js';
import { PossessAbility } from './abilities/possess.js';
import { makeRng } from './rng.js';

function parseRoom(def) {
  const rows = def.map.map((r) => r.padEnd(COLS, ' ').slice(0, COLS));
  while (rows.length < ROWS) rows.unshift('#'.padEnd(COLS - 1, ' ') + '#');
  const grid = rows.map((r) => r.split(''));
  const entities = [];
  const switches = [];
  const water = [];
  let spawn = { tx: 2, ty: ROWS - 2 };

  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const c = grid[ty][tx];
      const item = LEGEND[c];
      if (!item) {
        console.warn(`未知的地圖字元 "${c}"（${tx}, ${ty}）`);
        grid[ty][tx] = ' ';
        continue;
      }
      if (item.tile || c === ' ') continue;
      if (item.spawn) spawn = { tx, ty };
      if (item.water) water.push({ tx, ty });
      if (item.entity) entities.push(item.entity(tx, ty));
      if (item.switch) switches.push(item.switch(tx, ty));
      if (item.run) {
        // 連續的同一個字元合成一個物件
        let n = 0;
        while (grid[ty][tx + n] === c) { grid[ty][tx + n] = ' '; n++; }
        entities.push(item.run(tx, ty, n));
        continue;
      }
      grid[ty][tx] = item.replaceWith ?? ' ';
    }
  }
  return { rows: grid.map((r) => r.join('')), entities, switches, spawn, water };
}

export class World {
  // options.createWater：建立水系統的函式（實驗版本可以換成粒子水）
  constructor(input, options = {}) {
    this.createWater = options.createWater ?? ((map) => new WaterSystem(map));
    this.input = input;
    this.mouse = { x: 0, y: 0 };
    this.fields = new FieldSystem();
    this.portals = new PortalSystem();
    this.player = new Player();
    this.loadout = [...DEFAULT_LOADOUT];
    this.particles = [];
    this.popups = [];
    this.beams = [];
    this.toasts = [];
    this.bolts = [];     // 電磁加速的閃電特效：{ x1, y1, x2, y2, life }
    this.cooldowns = {}; // 技能冷卻：{ 技能 id: 剩餘秒數 }
    this.time = 0;
    this.loadRoom(0);
  }

  get room() { return ROOMS[this.roomIndex]; }
  get roomCount() { return ROOMS.length; }

  loadRoom(index) {
    this.roomIndex = ((index % ROOMS.length) + ROOMS.length) % ROOMS.length;
    // 會影響玩法的亂數（火山彈的角度、熔岩塊的速度）用固定種子，每次進入房間都一樣
    this.rng = makeRng(1000 + this.roomIndex);
    const parsed = parseRoom(this.room);
    this.map = new TileMap(parsed.rows);
    this.water = this.createWater(this.map);
    for (const c of parsed.water) this.water.add(c.tx, c.ty, 1);
    // 熔岩的基準量：噴發口只會把超過這個量的熔岩吸回去；上升的熔岩會提高基準量
    this.lavaBaseline = this.water.lava.reduce((a, b) => a + b, 0);
    this.riseT = 0;
    this.computeLiquidBudget();
    this.entities = parsed.entities;
    this.switches = parsed.switches;
    this.doorTiles = this.map.doorTiles();
    this.spawn = parsed.spawn;
    this.projectiles = [];
    this.fields.clear();
    this.dirAim = null;
    this.grab = null;
    this.allyOrder = null;
    this.possess = null;
    this.ropes = null; // 繩子在第一次更新時和吊著的物體連起來
    this.cooldowns = {};
    this.bolts = [];
    if (this.room.loadout) this.loadout = [...this.room.loadout]; // 測試房間可以指定裝備
    this.fields.base = { x: 0, y: 1 }; // 重力魔王轉過的重力，換房間或重來時恢復向下
    this.hasBoss = this.entities.some((e) => e.isBoss);
    this.portals.clear();
    this.player.respawn(this.spawn);
    this.pendingRoom = null;
    this.toast(this.room.name);
  }

  requestRoom(index) {
    this.pendingRoom = index;
  }

  resetRoom() {
    this.requestRoom(this.roomIndex);
  }

  // 液體的總量上限：熔岩源、噴發落下的熔岩、上升的熔岩、水源都不能讓房間裡的液體超過上限，
  // 否則熔岩源一直流、噴發口又被封住時，熔岩會無限增加（實測：放著不動 2 分鐘就從 21 增加到 39）
  computeLiquidBudget() {
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    // 上升的熔岩只會加一次：剛好填滿 topRow 以下的空間
    this.riseBudget = 0;
    this.riseAdded = 0;
    const rise = this.room.risingLava;
    if (rise) {
      for (let ty = rise.topRow; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) if (!this.map.isSolid(tx, ty)) this.riseBudget += 1 - this.water.lavaAt(tx, ty);
      }
    }
    this.lavaCap = sum(this.water.lava) + this.riseBudget + cfg.lavaMargin;
    this.waterCap = sum(this.water.amount) + cfg.waterMargin;
  }

  lavaTotal() {
    return this.water.lava.reduce((a, b) => a + b, 0);
  }

  waterTotal() {
    return this.water.amount.reduce((a, b) => a + b, 0);
  }

  // 加熔岩（會受總量上限限制）；回傳是否有加
  addLavaCapped(tx, ty, a) {
    if (this.lavaTotal() + a > this.lavaCap) return false;
    this.water.addLava(tx, ty, a);
    return true;
  }

  addWaterCapped(tx, ty, a) {
    if (this.waterTotal() + a > this.waterCap) return false;
    this.water.add(tx, ty, a);
    return true;
  }

  // 上升的熔岩（房間設定 risingLava：{ delay 秒後開始, rowsPerSec 每秒上升幾格, topRow 最高到第幾列 }）。
  // 只從已經有熔岩的地方往上、往旁邊長，不會憑空填滿封閉的空間
  updateRisingLava(dt) {
    const rise = this.room.risingLava;
    if (!rise) return;
    this.riseT += dt;
    if (this.riseT < rise.delay) return;
    const level = Math.max(rise.topRow, ROWS - 1 - Math.floor((this.riseT - rise.delay) * rise.rowsPerSec));
    const w = this.water;
    for (let ty = ROWS - 1; ty >= level; ty--) {
      for (let tx = 0; tx < COLS; tx++) {
        if (this.riseAdded >= this.riseBudget) return; // 只上升一次，加滿預算就停
        if (this.map.isSolid(tx, ty) || w.lavaAt(tx, ty) >= 0.95) continue;
        const near = w.lavaAt(tx, ty) > 0.05 || w.lavaAt(tx - 1, ty) > 0.5 || w.lavaAt(tx + 1, ty) > 0.5 || w.lavaAt(tx, ty + 1) > 0.5;
        if (!near) continue;
        const before = w.lavaAt(tx, ty);
        if (!this.addLavaCapped(tx, ty, 0.8 * dt)) return;
        const added = w.lavaAt(tx, ty) - before;
        this.lavaBaseline += added;
        this.riseAdded += added;
      }
    }
  }

  // 玩家與所有受物理影響的物體
  bodies() {
    const list = [this.player];
    for (const e of this.entities) if (e.isBody && e.alive) list.push(e);
    return list;
  }

  overlap(a, b) {
    return rectsOverlap(a, b);
  }

  // 會穿過傳送門的東西：所有物理物體與子彈
  portalTravelers() {
    const list = this.bodies();
    for (const e of this.entities) if (e.isBullet && e.alive) list.push(e);
    return list;
  }

  // 矩形是否碰到實心地形。傳送門所在的牆格，對塞得進門的物體視為空地，讓物體可以走進門裡
  solidTiles(x, y, w, h) {
    if (!this.map.rectSolid(x, y, w, h)) return false;
    if (!this.portals.active) return true;
    return this.map.anyTileInRect(x, y, w, h,
      (tx, ty) => this.map.isSolid(tx, ty) && !this.portals.coversTile(tx, ty, x, y, w, h));
  }

  // 碰撞查詢：回傳 'tile'、擋住的實心物件，或 null
  rectBlocked(x, y, w, h, self) {
    if (this.solidTiles(x, y, w, h)) return 'tile';
    // 怪物通道：只有敵人能通過
    if (self && !self.isEnemy && this.map.anyTileInRect(x, y, w, h, (tx, ty) => this.map.get(tx, ty) === 'E')) return 'tile';
    if (self?.restsOnSpikes && this.map.rectSpikes(x, y, w, h)) return 'tile';
    if (this.water?.frozenOverlap(x, y, w, h, self)) return 'tile'; // 被時停的水是實心的
    for (const e of this.entities) {
      if (e === self || !e.solid || !e.alive) continue;
      if (e.held && self === this.player) continue; // 自己抓著的東西不會擋住自己
      if (x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y) return e;
    }
    return null;
  }

  // 找出某一點附近可以被擊中的物件（箱子、敵人；includeBullets 時也包含子彈）
  hitTest(x, y, pad, includeBullets = false) {
    for (const e of this.entities) {
      if (!e.alive || !e.hittable) continue;
      if (e.isBullet && (!includeBullets || e.friendly)) continue;
      if (x > e.x - pad && x < e.x + e.w + pad && y > e.y - pad && y < e.y + e.h + pad) return e;
    }
    return null;
  }

  // 技能欄第 slot 格的按鍵代碼
  slotKey(slot) {
    return SLOT_KEYS[slot]?.code ?? null;
  }

  castSkill(slot, keyCode) {
    const id = this.loadout[slot];
    if (!id) return;
    const skill = SKILLS[id];
    const cost = cfg.mpMax * cfg.mpCostRatio;
    const p = this.player;
    if (this.cooldowns[id] > 0) {
      this.toast(`${skill.name}冷卻中（${this.cooldowns[id].toFixed(1)} 秒）`);
      return;
    }
    const selfCast = isFieldSkill(skill) && this.isSelfCast();
    if (selfCast && !cfg.selfAttachUnlocked) {
      this.toast('尚未解鎖自身附著');
      return;
    }
    if (p.mp < cost) {
      this.toast('MP 不足');
      return;
    }
    // 洗腦：游標不在敵人身上時是下指令（自己人走到游標的位置待命），不發射網、不耗 MP
    if (skill.type === 'charm') {
      const m = this.mouse;
      const onEnemy = this.entities.some((e) => e.isEnemy && e.alive && m.x > e.x - 4 && m.x < e.x + e.w + 4 && m.y > e.y - 4 && m.y < e.y + e.h + 4);
      if (!onEnemy) { this.commandAllies(m.x, m.y); return; }
    }
    if (skill.type === 'railgun') {
      if (p.mp < cfg.railCost) { this.toast('MP 不足'); return; }
      if (this.fireRail()) { p.mp -= cfg.railCost; this.cooldowns.railgun = cfg.railCd; }
      return;
    }
    // 重力抓取：先確認游標下有抓得起來的東西，沒有就不扣 MP
    if (skill.type === 'grab') {
      if (this.startGrab(keyCode)) p.mp -= cost;
      return;
    }
    p.mp -= cost;

    if (skill.self) {
      p.hasteT = cfg.fieldDuration;
      this.burst(p.cx, p.cy, '#4aa8ff', 14);
      return;
    }
    if (skill.type === 'blink') {
      this.blink();
      return;
    }

    const o = p.shoulder();
    let end = this.clampToRange(o, this.mouse);
    const dx = end.x - o.x;
    const dy = end.y - o.y;
    const d = Math.hypot(dx, dy);
    // 游標太靠近自己時（例如對自己施放定向重力），方向改用面向
    const dir = d > 8 ? { x: dx / d, y: dy / d } : { x: p.facing, y: 0 };
    // 傳送門：沿著瞄準方向飛到射程極限，直到撞到牆（不會停在游標位置）
    if (skill.type === 'portal') end = { x: o.x + dir.x * cfg.webRange, y: o.y + dir.y * cfg.webRange };

    if (selfCast) {
      this.fields.add(new Field(p.cx, p.cy, id, dir, p, keyCode));
      this.burst(p.cx, p.cy, '#ffffff', 10);
      return;
    }
    const web = new Web(o.x, o.y, end.x, end.y, id, dir);
    this.projectiles.push(web);
    // 定向重力（LOL 式施放）：網飛到游標的位置當起點；按住技能鍵時拖曳游標決定方向，放開時確定
    if (skill.type === 'gravityDir' || skill.type === 'wind') this.dirAim = { key: keyCode, web };
  }

  // 技能失敗時退回 MP
  refundSkill() {
    this.player.mp = Math.min(cfg.mpMax, this.player.mp + cfg.mpMax * cfg.mpCostRatio);
  }

  // 維持型場域：放開按鍵或 MP 耗盡時結束
  updateChannels(dt) {
    const p = this.player;
    for (const f of this.fields.list.filter((f) => f.channel)) {
      if (!this.input.isDown(f.channel)) {
        this.fields.remove(f);
        continue;
      }
      p.mp -= cfg.selfDrain * dt;
      if (p.mp <= 0) {
        p.mp = 0;
        this.fields.remove(f);
        this.toast('MP 耗盡');
      }
    }
  }

  // 對自己施放：游標指在自己身上，或按住 C
  isSelfCast() {
    const p = this.player;
    const m = this.mouse;
    const pad = 4;
    const onSelf = m.x > p.x - pad && m.x < p.x + p.w + pad && m.y > p.y - pad && m.y < p.y + p.h + pad;
    return onSelf || this.input.isDown('KeyC');
  }

  clampToRange(origin, target) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const d = Math.hypot(dx, dy);
    if (d <= cfg.webRange) return { x: target.x, y: target.y };
    return { x: origin.x + (dx / d) * cfg.webRange, y: origin.y + (dy / d) * cfg.webRange };
  }

  // 預覽：網實際會在哪裡展開（和 Web.update 使用相同的判定）
  // target：場域會附著的對象
  previewWeb() {
    const o = this.player.shoulder();
    if (this.isSelfCast()) return { o, x: this.player.cx, y: this.player.cy, blocked: false, target: this.player };
    const end = this.clampToRange(o, this.mouse);
    const dx = end.x - o.x;
    const dy = end.y - o.y;
    const d = Math.hypot(dx, dy);
    let x = o.x;
    let y = o.y;
    for (let t = 0; t < d; t += 4) {
      const step = Math.min(4, d - t);
      const nx = x + (dx / d) * step;
      const ny = y + (dy / d) * step;
      if (this.map.pointSolid(nx, ny)) return { o, x, y, blocked: true, target: null };
      const hit = this.hitTest(nx, ny, 2);
      if (hit) {
        if (hit.isBody) return { o, x: hit.cx, y: hit.cy, blocked: true, target: hit };
        return { o, x, y, blocked: true, target: null };
      }
      x = nx;
      y = ny;
    }
    return { o, x, y, blocked: false, target: null };
  }

  // 除錯：對某一點的敵人直接造成傷害（無視護甲與免疫）。回傳是否打到
  debugHit(x, y, amount) {
    const e = this.entities.find((e) => e.isEnemy && e.alive && x > e.x - 6 && x < e.x + e.w + 6 && y > e.y - 6 && y < e.y + e.h + 6);
    if (!e) return false;
    if (e.debugDamage) e.debugDamage(this, amount);
    else e.hurt(this, amount);
    return true;
  }

  // 除錯：魔王直接進入第二階段
  debugBossPhase2() {
    const boss = this.entities.find((e) => e.isBoss && e.alive);
    if (!boss) { this.toast('這個房間沒有魔王'); return; }
    if (boss.phase === 1) boss.debugDamage(this, boss.hp - Math.floor(boss.maxHp / 2));
  }

  hurtPlayer(amount, { respawn = false, fromX = null } = {}) {
    const p = this.player;
    if (this.pendingRoom !== null) return;
    if (cfg.godMode && !respawn) return;
    if (this.possess) return; // 附身中：本體被時間凍結，無敵
    if (!respawn && p.invT > 0) return;
    p.hp -= amount;
    if (p.hp <= 0) {
      p.hp = cfg.hp;
      p.mp = cfg.mpMax;
      this.toast('倒下了，房間重置');
      this.resetRoom();
      return;
    }
    if (respawn) {
      p.mp = cfg.mpMax; // 重生時 MP 回滿，避免回到入口後還要等 MP 回復
      this.toast(`-${amount} HP，回到入口`);
      this.resetRoom();
      return;
    }
    p.invT = cfg.invulnTime;
    p.restLockT = cfg.restHitLock; // 被打到後一段時間不會靜止回復
    p.stunT = cfg.hitStun;
    p.dashT = 0;
    const away = fromX === null ? -p.facing : Math.sign(p.cx - fromX) || 1;
    p.vx = away * cfg.knockback;
    if (p.groundAxis === 'y') p.vy = -p.groundSign * cfg.knockback;
    this.popup(p.cx, p.y, `-${amount}`, '#ff6b6b');
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.3, color });
    }
  }

  toast(text) {
    this.toasts.push({ text, life: 2 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  update(dt) {
    this.time += dt;
    this.dtReal = dt; // 真實時間（蓄力等不受時間場域影響的計時用）
    // 干擾裝置的位置每幀更新（可移動的干擾器會跟著移動）
    const jammers = this.entities.filter((e) => e.isJammer && e.alive).map((e) => ({ x: e.cx, y: e.cy, r: e.r, kind: e.kind }));
    this.fields.jammers = jammers;
    this.portals.jammers = jammers;
    // 敵人自帶的重力盾
    this.fields.innate = this.entities.filter((e) => e.shieldR && e.alive)
      .map((e) => ({ x: e.cx, y: e.cy, r: e.shieldR, value: e.shieldValue, owner: e, ally: e.ally }));
    // 光線每幀重新計算：先清掉上一幀的光線與接收器狀態
    this.beams = [];
    for (const s of this.switches) s.lit = false;
    this.fields.update(dt);
    this.updateRisingLava(dt);
    this.water.update(this, dt);
    this.portals.update(dt, this);
    const before = this.reflectMovers().map((m) => [m, m.cx, m.cy]);
    this.player.update(this, dt);
    this.updateChannels(dt);
    this.updateDirAim();
    this.updateCharm(dt);
    this.updatePossess(dt);

    if (this.pendingRoom === null) {
      this.updateGrab(dt);
      this.updateWind(dt);
      this.stepRewinds();
      for (const e of this.entities) if (e.alive && !e.rewind) e.update(this, dt);
      for (const p of this.projectiles) if (p.alive) p.update(this, dt);
      for (const b of this.portalTravelers()) this.portals.tryTeleport(this, b);
      this.resolveReflectFields(before);
      this.updateTurbines(dt);
      this.updateElectric(dt);
      this.updateConveyors(dt);
      this.updateRopes(dt);
      this.resolveImpacts();
      this.updateSwitches();
      this.recordHistory();
      this.updateRails(dt);
    }

    this.fields.followTargets();
    this.entities = this.entities.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const pp of this.popups) {
      pp.y -= 20 * dt;
      pp.life -= dt;
    }
    this.popups = this.popups.filter((pp) => pp.life > 0);
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);

    if (this.pendingRoom !== null) this.loadRoom(this.pendingRoom);
  }

  // 物體互撞（箱子或敵人撞上敵人）：相對速度超過門檻時，被撞的一方依撞過來那一方的質量受傷；
  // 撞過來的若也是敵人，同樣依對方的質量受傷。之後依質量交換動量（部分反彈）
  resolveImpacts() {
    const movers = this.entities.filter((e) => e.isBody && e.alive);
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i];
        const b = movers[j];
        if (!a.isEnemy && !b.isEnemy) continue; // 箱子互撞不算
        if (!rectsOverlap(a, b)) continue;
        if ((a.isEnemy && a.impactCd > 0) || (b.isEnemy && b.impactCd > 0)) continue;
        const rvx = a.vx - b.vx;
        const rvy = a.vy - b.vy;
        const rel = Math.hypot(rvx, rvy);
        if (rel <= cfg.impactThreshold) continue;

        if (b.isEnemy) b.takeImpact(this, impactDamage(rel, a.mass), rel);
        if (a.isEnemy) a.takeImpact(this, impactDamage(rel, b.mass), rel);
        // 鐵塊撞到敵人造成傷害後就碎掉（彈藥用一次）
        for (const e of [a, b]) if (e.isIron) e.shatter(this);
        // 魔王丟出的小兵被甩去撞魔王時也碎掉
        if (a.isBoss && b.isMinion) b.die(this);
        if (b.isBoss && a.isMinion) a.die(this);
        for (const e of [a, b]) if (e.isEnemy) { e.impactCd = 0.3; e.stunT = 0.3; }

        // 沿相對速度方向交換動量
        const nx = rvx / rel;
        const ny = rvy / rel;
        const k = ((1 + cfg.impactRestitution) * rel) / (a.mass + b.mass);
        a.vx -= nx * k * b.mass;
        a.vy -= ny * k * b.mass;
        b.vx += nx * k * a.mass;
        b.vy += ny * k * a.mass;
        this.burst((a.cx + b.cx) / 2, (a.cy + b.cy) / 2, '#ffd34d', 10);
      }
    }
  }

  popup(x, y, text, color) {
    this.popups.push({ x, y, text, color, life: 0.8 });
  }

  updateSwitches() {
    for (const s of this.switches) s.update(this);
    if (!this.doorTiles.length) return;
    // 魔王房間：打倒魔王才開門；房間設定 openWhen: 'enemies'：打倒所有敵人才開門；其他房間：所有開關都啟動才開門
    const open = this.hasBoss
      ? !this.entities.some((e) => e.isBoss && e.alive)
      : this.room.openWhen === 'enemies'
        ? !this.entities.some((e) => e.isEnemy && e.alive && !e.ally)
        : this.switches.length > 0 && this.switches.every((s) => s.pressed);
    if (open === this.map.doorOpen) return;
    if (!open) {
      // 有東西卡在門的位置時先不要關門
      const blocked = this.doorTiles.some(({ tx, ty }) =>
        this.bodies().some((b) => rectsOverlap(b, { x: tx * 16, y: ty * 16, w: 16, h: 16 })),
      );
      if (blocked) return;
    }
    this.map.doorOpen = open;
    this.toast(open ? '門打開了' : '門關上了');
  }
}

// 各種能力的邏輯放在 js/abilities/，掛到 World 上
Object.assign(World.prototype, DirAimAbility, GrabAbility, ReflectFieldAbility, ThermalAbility, WindAbility, ElectricAbility, DeviceAbility, RailgunAbility, RewindAbility, BlinkAbility, CharmAbility, PossessAbility);
