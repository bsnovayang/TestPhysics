// 全域常數與可調整參數（除錯面板會直接修改 cfg）
export const TILE = 16;
export const COLS = 40;
export const ROWS = 22;
export const VIEW_W = 640;
export const VIEW_H = 360;
export const STEP = 1 / 60;

export const cfg = {
  // 世界
  gravity: 900,          // px/s²
  maxGravityMult: 3,     // 重力大小上限（倍數）
  maxTimeScale: 3,       // 時間倍率上限
  maxSpeed: 600,         // 任何軸向速度上限 px/s

  // 角色
  hp: 10,
  runSpeed: 110,
  groundAccel: 1400,
  airAccel: 800,
  jumpHeight: 3,         // 格，起跳速度由正常重力換算後固定
  coyoteTime: 0.1,
  jumpBuffer: 0.1,
  maxFall: 420,
  dashSpeed: 260,
  dashTime: 0.15,
  dashCooldown: 0.35,
  playerMinTime: 0.2,    // 玩家在時停或強減速中的最低倍率
  invulnTime: 1,

  // 場域
  fieldRadius: 32,       // 約等於角色身高（2 格）
  fieldDuration: 3,
  maxFields: 2,
  mpMax: 100,
  mpCostRatio: 0.1,
  mpRegen: 3,            // 每秒
  webSpeed: 480,
  webRange: 160,         // 約 10 格

  // 自身附著：按住技能鍵維持，持續消耗 MP，維持期間 MP 不回復
  selfAttachUnlocked: true, // 之後隨進度解鎖；原型預設開啟
  selfDrain: 25,            // 每秒消耗的 MP（啟動時另外扣一次一般消耗）

  // 空間
  blinkRange: 80,            // 約 5 格
  blinkThroughWalls: false,  // 之後解鎖
  portalDuration: 30,
  portalMinExit: 150,        // 離開傳送門的最低速度，避免卡在門口

  // 空氣砲
  cannonRate: 4,         // 每秒發數
  cannonSpeed: 420,
  cannonRange: 150,
  cannonImpulse: 280,    // 對質量 1 的物體造成的速度變化
  cannonDamage: 1,
  recoil: 50,

  // 撞擊傷害：速度超過門檻才會受傷，超過越多傷害越高；物體互撞時以相對速度計算並乘上撞過來那一方的質量
  impactThreshold: 320,  // px/s，約等於從 3.6 格高掉下來；要高於跳躍兵的起跳速度（270），否則它落地會自傷
  impactPerDamage: 50,   // 超過門檻每多少 px/s 算 1 點傷害
  impactRestitution: 0.3,

  // 物件
  boxFriction: 900,

  // 除錯
  globalTimeScale: 1,
  showHitboxes: false,
};

// 技能欄對應的按鍵（POE 式快捷鍵）
export const SLOT_KEYS = [
  { code: 'Mouse2', label: '右鍵' },
  { code: 'KeyQ', label: 'Q' },
  { code: 'KeyE', label: 'E' },
  { code: 'KeyR', label: 'R' },
  { code: 'KeyF', label: 'F' },
];
