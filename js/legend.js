// 地圖圖例：房間的 ASCII 地圖裡，每個字元代表什麼、怎麼建立。
// 新增物件時只要在這裡登記一個字元，不用改 world.js 的載入程式。
//
// 每個字元的設定（可以組合）：
//   name        說明（給人看的，也是圖例）
//   tile        留在地圖裡的圖塊（地形）
//   spawn       玩家的起點
//   water       這一格一開始裝滿水
//   entity      (tx, ty) => 物件
//   switch      (tx, ty) => 開關（全部啟動時門會打開）
//   run         (tx, ty, 長度) => 物件：連續的同一個字元合成一個物件
//   replaceWith 處理完之後地圖上留下的圖塊（預設是空地）
import { IronBlock, Box, BoxSpawner, MovingPlatform, Blade, Crusher, Switch, FixedJammer, MovableJammer, IceBlock, Cooler, Heater, SteamPlatform } from './objects.js';
import { Walker, Heavy, Jumper, Flyer, Turret, LaserEnemy } from './enemies.js';
import { Presser, Balloon, CeilingWalker, ShieldSoldier, GravityBoss } from './gravity-enemies.js';
import { Emitter, MirrorBox } from './light.js';
import { Vent, LiquidSource } from './volcano.js';

// 干擾裝置的種類：1～4 固定、5～8 可移動，依序為 重力、時間、空間、全部
const JAMMER_KINDS = ['gravity', 'time', 'space', 'all'];
const JAMMER_NAMES = ['重力', '時間', '空間', '全部'];

export const LEGEND = {
  // 地形（留在地圖裡）
  ' ': { name: '空地' },
  '#': { name: '地面／牆', tile: true },
  '^': { name: '尖刺', tile: true },
  'D': { name: '門', tile: true },
  '|': { name: '移動平台的折返標記', tile: true },
  'I': { name: '冰牆格（會融化）', tile: true },
  'Z': { name: '熔岩', tile: true },
  'E': { name: '怪物通道（只有敵人能通過，玩家和箱子過不去）', tile: true },

  // 玩家與液體
  'P': { name: '起點', spawn: true },
  '~': { name: '水', water: true },
  '%': { name: '泡在水裡的尖刺', water: true, replaceWith: '^' },

  // 箱子與道具
  'B': { name: '箱子', entity: (tx, ty) => new Box(tx, ty) },
  'K': { name: '鑰匙箱', entity: (tx, ty) => new Box(tx, ty, true) },
  'n': { name: '鐵塊', entity: (tx, ty) => new IronBlock(tx, ty) },
  '@': { name: '箱子生成器（箱子被拿走或消失後會補一個）', entity: (tx, ty) => new BoxSpawner(tx, ty) },
  'N': { name: '鐵塊生成器', entity: (tx, ty) => new BoxSpawner(tx, ty, 'iron') },
  'M': { name: '鏡子箱', entity: (tx, ty) => new MirrorBox(tx, ty) },
  'Y': { name: '冰塊（可推）', entity: (tx, ty) => new IceBlock(tx, ty) },

  // 開關
  'L': { name: '鎖開關（只認鑰匙箱）', switch: (tx, ty) => new Switch(tx, ty, 'lock') },
  'S': { name: '壓板', switch: (tx, ty) => new Switch(tx, ty, 'plate') },
  'R': { name: '光線接收器', switch: (tx, ty) => new Switch(tx, ty, 'light') },
  'W': { name: '蒸氣渦輪', switch: (tx, ty) => new Switch(tx, ty, 'steam') },
  'F': { name: '按鈕（踩過一次就鎖住）', switch: (tx, ty) => new Switch(tx, ty, 'button') },

  // 機關與裝置
  'O': { name: '旋轉刀片', entity: (tx, ty) => new Blade(tx, ty) },
  'V': { name: '壓碎機關（連續的 V 合成一個）', run: (tx, ty, n) => new Crusher(tx, ty, n) },
  '=': { name: '移動平台（連續的 = 合成一個）', run: (tx, ty, n) => new MovingPlatform(tx, ty, n) },
  'U': { name: '蒸氣浮台（連續的 U 合成一個）', run: (tx, ty, n) => new SteamPlatform(tx, ty, n) },
  'X': { name: '雷射發射器（背對相鄰的牆發光）', entity: (tx, ty) => new Emitter(tx, ty) },
  'C': { name: '冷凍裝置', entity: (tx, ty) => new Cooler(tx, ty) },
  // 火爐嵌在牆裡，水不會從它的位置漏出去
  'H': { name: '點燃的火爐', entity: (tx, ty) => new Heater(tx, ty, true), replaceWith: '#' },
  'G': { name: '熄滅的火爐（空氣砲可以切換）', entity: (tx, ty) => new Heater(tx, ty, false), replaceWith: '#' },
  '!': { name: '間歇噴發口', entity: (tx, ty) => new Vent(tx, ty) },
  '&': { name: '熔岩源', entity: (tx, ty) => new LiquidSource(tx, ty, 'lava', true) },
  '$': { name: '水源（空氣砲開關）', entity: (tx, ty) => new LiquidSource(tx, ty, 'water', false) },

  // 敵人
  'w': { name: '步行兵', entity: (tx, ty) => new Walker(tx, ty) },
  'j': { name: '跳躍兵', entity: (tx, ty) => new Jumper(tx, ty) },
  'f': { name: '飛行兵', entity: (tx, ty) => new Flyer(tx, ty) },
  'h': { name: '重裝兵', entity: (tx, ty) => new Heavy(tx, ty) },
  'T': { name: '砲台', entity: (tx, ty) => new Turret(tx, ty) },
  'l': { name: '雷射兵', entity: (tx, ty) => new LaserEnemy(tx, ty) },
  'p': { name: '重壓兵', entity: (tx, ty) => new Presser(tx, ty) },
  'b': { name: '氣球兵', entity: (tx, ty) => new Balloon(tx, ty) },
  'u': { name: '倒吊兵（放在天花板下）', entity: (tx, ty) => new CeilingWalker(tx, ty) },
  'g': { name: '重力盾兵', entity: (tx, ty) => new ShieldSoldier(tx, ty) },
  'm': { name: '重力魔王', entity: (tx, ty) => new GravityBoss(tx, ty) },
};

// 干擾裝置
JAMMER_KINDS.forEach((kind, i) => {
  LEGEND[String(i + 1)] = { name: `固定干擾器（${JAMMER_NAMES[i]}）`, entity: (tx, ty) => new FixedJammer(tx, ty, kind) };
  LEGEND[String(i + 5)] = { name: `可移動干擾器（${JAMMER_NAMES[i]}）`, entity: (tx, ty) => new MovableJammer(tx, ty, kind) };
});
