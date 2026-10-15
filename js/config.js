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
  invulnTime: 1.5,       // 受傷後的無敵時間（尖刺與掉落會直接回到入口，不受此限制）
  hitStun: 0.35,         // 受傷後短暫無法操作，讓擊退真的把角色推離敵人
  knockback: 170,

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

  // 干擾裝置
  jammerRadius: 48,          // 3 格

  // 光線
  lightBend: 2e-5,           // 重力場域讓光線彎曲的程度
  emitterDamage: 0,          // 雷射發射器（解謎裝置）預設無害
  laserDamage: 1,            // 雷射兵的傷害
  laserCharge: 2,            // 集氣時間（秒）
  laserLock: 0.4,            // 集氣最後這段時間鎖定方向
  laserFire: 0.3,
  laserCooldown: 1.5,

  // 水與溫度
  coldRadius: 40,            // 冷凍裝置的範圍
  freezeTime: 1,             // 水在冷凍範圍內多久結冰
  meltTime: 1,               // 冰被光照多久融化
  waterDrag: 4,              // 水中的阻力
  swimSpeed: 140,            // 在水中按跳躍時往上游的速度
  swimCooldown: 0.25,
  iceFriction: 0.12,         // 冰面上的抓地力（倍率）
  heatRadius: 40,            // 火爐的範圍
  // 火山
  ventInterval: 4,           // 噴發口兩次噴發之間的安靜時間
  ventWarn: 1,               // 噴發前的預兆時間
  ventDuration: 0.8,         // 噴發持續時間
  ventSpeed: 560,            // 熔岩塊噴出的速度（約可噴到 10 格高）
  ventBombs: 2,              // 每次噴發拋出的火山彈
  ventDrain: 0.8,            // 噴發口把周圍熔岩吸回去的速度
  blobLava: 0.015,           // 每塊熔岩落地變成多少熔岩
  blobDamage: 2,
  bombDamage: 2,
  lavaSourceRate: 0.15,      // 熔岩源每秒流出的量
  waterSourceRate: 1.5,      // 水源每秒流出的量
  lavaMargin: 8,             // 房間熔岩總量上限 = 一開始的量 + 上升熔岩的量 + 這個值
  waterMargin: 40,           // 房間水總量上限 = 一開始的量 + 這個值
  lavaFlow: 0.2,             // 熔岩每一步往下流的比例（水是 1，熔岩很黏）
  lavaSpread: 10,            // 熔岩往兩側擴散的除數（越大散得越少）
  boilTime: 1,               // 水被加熱多久開始沸騰（加熱強度 1 時）
  laserHeat: 3,              // 雷射的加熱強度（火爐是 1、熔岩是 3）
  boilRate: 0.3,             // 沸騰時每秒有多少水變成蒸氣（熔岩是 3 倍）
  steamRise: 0.06,           // 蒸氣每一步往上飄的比例（約每秒 3 格；舊值 0.25 約每秒 14 格）
  steamWander: 0.06,         // 蒸氣每一步隨機往左右飄的比例（讓它看起來在翻騰）
  steamSpread: 16,           // 蒸氣往兩側擴散的除數（越大擴散越少、越能維持成一團）
  steamCondense: 0.08,       // 蒸氣每秒凝結回水的比例（冷凍裝置附近更快）
  steamBlock: 0.3,           // 蒸氣濃度超過這個值就會擋住光線
  steamLift: 30,             // 蒸氣浮台被推上去的最高速度（要比蒸氣上升慢，否則會跑到蒸氣上面停住）

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

  // 介面
  showHints: false,      // 房間提示預設隱藏，按 / 顯示（讓玩家先自己嘗試）

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
