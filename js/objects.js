import { cfg, TILE } from './config.js';
import { Body, rectsOverlap, approach } from './body.js';

// 可以推的箱子。key = true 時是鑰匙箱，只有它能啟動鎖開關。
export class Box extends Body {
  constructor(tx, ty, key = false) {
    super(tx * TILE, ty * TILE, TILE, TILE);
    this.key = key;
    this.solid = true;
    this.pushable = true;
    this.hittable = true;
    this.restsOnSpikes = true; // 尖刺對箱子是實心的：箱子可以壓在尖刺上，把尖刺蓋住
    this.density = 0.5;        // 木箱會浮在水上
    this.pushV = 0;
  }

  update(world, dt) {
    this.sample(world);
    const ldt = dt * this.mods.time;
    if (ldt > 0) {
      this.applyGravity(ldt);
      this.applyWater(world, ldt);
      const pushed = this.pushV && this.groundAxis !== 'x';
      const slippery = this.isIce || this.onIce(world);
      if (pushed) this.vx = this.pushV;
      else this.applyFriction(cfg.boxFriction * ldt * (slippery ? cfg.iceFriction : 1));
      this.clampVelocity();
      const { bx } = this.moveByVelocity(world, ldt);
      // 推動排在一起的箱子
      if (pushed && bx && bx.pushable) bx.pushV = this.pushV;
    }
    this.pushV = 0;
    this.checkGrounded(world);
    if (this.isOutOfBounds()) this.alive = false;
    // 掉進熔岩：冰塊融化成水，其他箱子燒毀
    if (this.alive && this.touchingLava(world)) {
      this.alive = false;
      if (this.isIce) world.water.add(Math.floor(this.cx / TILE), Math.floor(this.y / TILE), 1);
      world.burst(this.cx, this.cy, this.isIce ? '#9fd8ff' : '#ff8a3d', 14);
    }
  }

  // 時停中被打到時，速度會先累積，時間恢復後才一次釋放
  onAirShot(world, dir) {
    this.vx += (dir.x * cfg.cannonImpulse) / this.mass;
    this.vy += (dir.y * cfg.cannonImpulse) / this.mass;
  }
}

// 左右移動的平台（實心），會載著站在上面的物體一起移動。碰到牆或 '|' 標記時折返。
export class MovingPlatform {
  constructor(tx, ty, widthTiles) {
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = widthTiles * TILE;
    this.h = 8;
    this.dir = 1;
    this.speed = 80;
    this.solid = true;
    this.alive = true;
    this.time = 1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    this.time = world.fields.sample(this.cx, this.cy).time;
    const dx = this.dir * this.speed * dt * this.time;
    if (dx === 0) return;
    if (world.map.rectPlatformStop(this.x + dx, this.y, this.w, this.h)) {
      this.dir *= -1;
      return;
    }
    const riders = world.bodies().filter(
      (b) => b !== this && Math.abs(b.y + b.h - this.y) < 1 && b.x < this.x + this.w && b.x + b.w > this.x,
    );
    this.x += dx;
    for (const r of riders) r.moveAxis(world, 'x', dx);
  }
}

// 旋轉刀片：以中心旋轉的長棒，碰到會受傷
export class Blade {
  constructor(tx, ty) {
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
    this.len = 40;
    this.angle = 0;
    this.speed = 2.2;
    this.alive = true;
    this.time = 1;
  }

  get cx() { return this.x; }
  get cy() { return this.y; }

  update(world, dt) {
    this.time = world.fields.sample(this.x, this.y).time;
    this.angle += this.speed * dt * this.time;
    const p = world.player;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    for (let k = -this.len; k <= this.len; k += 4) {
      const px = this.x + c * k;
      const py = this.y + s * k;
      if (px > p.x - 2 && px < p.x + p.w + 2 && py > p.y - 2 && py < p.y + p.h + 2) {
        world.hurtPlayer(2, { fromX: this.x });
        break;
      }
    }
  }
}

// 壓碎機關：在上方等待 → 快速落下 → 停一下 → 升回原位
export class Crusher {
  constructor(tx, ty, widthTiles) {
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.homeY = this.y;
    this.w = widthTiles * TILE;
    this.h = TILE;
    this.state = 'wait';
    this.timer = 1;
    this.vy = 0;
    this.alive = true;
    this.time = 1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    this.time = world.fields.sample(this.cx, this.cy).time;
    const ldt = dt * this.time;
    switch (this.state) {
      case 'wait':
        this.timer -= ldt;
        if (this.timer <= 0) { this.state = 'fall'; this.vy = 0; }
        break;
      case 'fall':
        this.vy = Math.min(this.vy + 1400 * ldt, 520);
        this.y += this.vy * ldt;
        if (world.map.rectSolid(this.x, this.y, this.w, this.h)) {
          this.y = Math.floor((this.y + this.h) / TILE) * TILE - this.h;
          this.state = 'bottom';
          this.timer = 0.6;
          world.burst(this.cx, this.y + this.h, '#999999', 8);
        }
        break;
      case 'bottom':
        this.timer -= ldt;
        if (this.timer <= 0) this.state = 'rise';
        break;
      case 'rise':
        this.y -= 160 * ldt;
        if (this.y <= this.homeY) { this.y = this.homeY; this.state = 'wait'; this.timer = 0.8; }
        break;
    }
    if (world.overlap(this, world.player)) world.hurtPlayer(2, { fromX: this.cx });
  }
}

// 干擾裝置：範圍內，指定顏色（技能樹）的場域失效；空間干擾器讓範圍內的傳送門停止運作、閃現不能進出。
// kind：'gravity'、'time'、'space'、'all'。無法破壞
export class FixedJammer {
  constructor(tx, ty, kind) {
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = TILE;
    this.h = TILE;
    this.kind = kind;
    this.isJammer = true;
    this.solid = true;
    this.alive = true;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get r() { return cfg.jammerRadius; }

  update() {}
}

// 冰塊：可以推、很滑、大部分沉在水下；被光照射約 1 秒後融化成水
export class IceBlock extends Box {
  constructor(tx, ty) {
    super(tx, ty);
    this.isIce = true;
    this.density = 0.9;
    this.heat = 0;
  }

  update(world, dt) {
    super.update(world, dt);
    this.heat = Math.max(0, this.heat - dt * 0.5);
  }

  heatUp(world, dt) {
    this.heat += dt * 1.5; // 扣掉自然降溫後，淨速率約每秒 1
    if (this.heat < cfg.meltTime) return;
    this.alive = false;
    world.water.add(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE), 1);
    world.burst(this.cx, this.cy, '#9fd8ff', 12);
  }
}

// 冷凍裝置：範圍內的水會結成冰牆格
export class Cooler {
  constructor(tx, ty) {
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = TILE;
    this.h = TILE;
    this.isCooler = true;
    this.alive = true;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update() {}
}

// 火爐：範圍內的水沸騰成蒸氣、冰融化。固定、實心
export class Heater {
  constructor(tx, ty) {
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = TILE;
    this.h = TILE;
    this.isHeater = true;
    this.solid = true;
    this.alive = true;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update() {}
}

// 蒸氣浮台：自己和下方一格有蒸氣時被推上去，沒有蒸氣時落下；會載著站在上面的東西一起移動。
// 一般的物體和玩家都不會被蒸氣推動，只有這種平台會
export class SteamPlatform {
  constructor(tx, ty, widthTiles) {
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = widthTiles * TILE;
    this.h = 8;
    this.vy = 0;
    this.solid = true;
    this.alive = true;
    this.isSteamPlatform = true;
    this.time = 1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(world, dt) {
    this.time = world.fields.sample(this.cx, this.cy).time;
    const ldt = dt * this.time;
    if (ldt <= 0) return;
    this.steam = world.water.steamInRect(this.x, this.y, this.w, this.h + TILE);
    if (this.steam > 0.15) {
      const target = -cfg.steamLift * Math.min(1, this.steam / 0.5);
      this.vy = approach(this.vy, target, 300 * ldt);
    } else {
      this.vy = Math.min(this.vy + cfg.gravity * 0.5 * ldt, 240);
    }

    const riders = world.bodies().filter(
      (b) => Math.abs(b.y + b.h - this.y) < 1.5 && b.x < this.x + this.w && b.x + b.w > this.x,
    );
    let dy = this.vy * ldt;
    // 往上時先移動上面的東西；有東西被天花板擋住時，平台也跟著停下，不會把它擠進天花板
    if (dy < 0) {
      for (const r of riders) {
        const y0 = r.y;
        r.moveAxis(world, 'y', dy);
        dy = Math.max(dy, r.y - y0);
      }
      if (dy > -0.01) { dy = 0; this.vy = 0; }
    }
    const before = this.y;
    const step = Math.sign(dy);
    for (let rem = Math.abs(dy); rem > 0; rem -= 1) {
      const d = step * Math.min(1, rem);
      if (world.map.rectSolid(this.x, this.y + d, this.w, this.h)) { this.vy = 0; break; }
      this.y += d;
    }
    const moved = this.y - before;
    if (dy > 0) for (const r of riders) r.moveAxis(world, 'y', moved);
  }
}

// 可移動的干擾裝置：和箱子一樣可以推、會被空氣砲推動，也會受其他顏色的場域影響
// （例如重力干擾器可以被時停，但重力場域在它身邊沒有作用）
export class MovableJammer extends Box {
  constructor(tx, ty, kind) {
    super(tx, ty);
    this.kind = kind;
    this.isJammer = true;
    this.density = 2; // 金屬，會沉
  }

  get r() { return cfg.jammerRadius; }
}

// 箱子生成器：箱子被拿走（離開生成點）或消失後，過一段時間補一個新的。
// 同一個生成器產生的箱子超過上限時，最舊的那個會消失
export class BoxSpawner {
  constructor(tx, ty) {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.w = TILE;
    this.h = TILE;
    this.alive = true;
    this.boxes = [];
    this.current = null;
    this.delay = 1;
    this.timer = this.delay; // 房間載入時立刻生成第一個
    this.maxBoxes = 4;
  }

  update(world, dt) {
    this.boxes = this.boxes.filter((b) => b.alive);
    const taken = !this.current || !this.current.alive
      || Math.hypot(this.current.x - this.x, this.current.y - this.y) > TILE * 1.5;
    if (!taken) return;
    this.current = null;
    this.timer += dt;
    if (this.timer < this.delay) return;
    // 生成點被擋住（包括玩家站在上面）時先等，避免箱子生成在別的東西裡面
    if (world.rectBlocked(this.x, this.y, this.w, this.h, null)) return;
    if (world.bodies().some((b) => rectsOverlap(b, this))) return;
    this.timer = 0;
    const box = new Box(this.tx, this.ty);
    world.entities.push(box);
    this.boxes.push(box);
    this.current = box;
    world.burst(box.cx, box.cy, '#b98a4f', 10);
    while (this.boxes.length > this.maxBoxes) {
      const old = this.boxes.shift();
      old.alive = false;
      world.burst(old.cx, old.cy, '#b98a4f', 12);
    }
  }

  // 補充進度（0～1），畫面用
  get progress() {
    return this.current ? 1 : Math.min(1, this.timer / this.delay);
  }
}

// 開關。kind = 'lock'：只對鑰匙箱有反應；kind = 'plate'：任何有重量的物體都可以；
// kind = 'light'：光線接收器，被光照到時啟動
export class Switch {
  constructor(tx, ty, kind) {
    this.tx = tx;
    this.ty = ty;
    this.kind = kind;
    this.pressed = false;
    this.lit = false;
    if (kind === 'light' || kind === 'steam') {
      this.x = tx * TILE;
      this.y = ty * TILE;
      this.w = TILE;
      this.h = TILE;
      this.spin = 0;
      this.holdT = 0;
      return;
    }
    this.x = tx * TILE + 1;
    this.y = ty * TILE + 12;
    this.w = TILE - 2;
    this.h = 4;
  }

  update(world, dt = 1 / 60) {
    if (this.kind === 'steam') {
      // 蒸氣渦輪：有蒸氣時轉動；啟動過一次就保持啟動（和光線接收器一樣，避免蒸氣散掉後門又關上）
      // 只計算自己這一列和下方一列（左右各多一格）：從下方冒上來的蒸氣才算，上方飄過來的不算
      const s = world.water.steamInRect(this.x - TILE, this.y, TILE * 3, TILE * 2);
      this.spin += (s + (this.pressed ? 0.1 : 0)) * dt * 20;
      if (s > 0.1) this.pressed = true;
      return;
    }
    if (this.kind === 'light') {
      // 被照亮過一次就保持啟動，避免玩家走過去時不小心推開鏡子，門又關上
      if (this.lit) this.pressed = true;
      return;
    }
    const candidates = this.kind === 'lock'
      ? world.entities.filter((e) => e instanceof Box && e.key && e.alive)
      : world.bodies();
    this.pressed = candidates.some((b) => rectsOverlap(this, b));
  }
}
