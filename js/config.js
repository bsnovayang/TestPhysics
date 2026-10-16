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
  // 靜止回復：站在地上完全不動、不按任何操作鍵一段時間後，MP 回復逐漸加速（解謎時不用乾等；戰鬥中很難做到）
  restDelay: 1.5,        // 靜止多久開始加速
  restDelayNearEnemy: 3, // 附近有敵人時要靜止多久
  restEnemyRange: 160,   // 「附近」的距離（10 格）
  restRamp: 1,           // 加速到最快需要的秒數
  restRegen: 30,         // 最快的回復速度（每秒）
  restHitLock: 3,        // 被打到後這段時間不會加速
  webSpeed: 480,
  webRange: 160,         // 約 10 格

  // 自身附著：按住技能鍵維持，持續消耗 MP，維持期間 MP 不回復
  selfAttachUnlocked: true, // 之後隨進度解鎖；原型預設開啟
  selfDrain: 25,            // 每秒消耗的 MP（啟動時另外扣一次一般消耗）

  // 重力抓取與時間倒轉
  grabLevel: 1,          // 重力抓取的等級（1～3，見 GRAB_LEVELS）；之後由技能樹升級
  grabDrain: 15,         // 抓住時每秒消耗的 MP
  grabSpeed: 420,        // 被抓住的物體追向游標的最高速度（放開時保留，所以可以丟出去）
  rewindTime: 8,         // 時間倒轉最多倒回幾秒
  rewindSpeed: 2,        // 倒轉播放的速度（倍）

  // 電磁加速
  railRange: 48,         // 金屬物體要在身邊幾 px 內（約 3 格）
  railMaxMass: 2,        // 射得出去的最大質量（鐵塊 2）
  railSpeed: 900,        // 射出的速度（超過一般速度上限 600）
  railTime: 0.5,         // 射出後這段時間不受重力、直線飛行
  railCost: 25,          // 每次消耗的 MP
  railCd: 2,             // 冷卻秒數

  // 洗腦
  charmLevel: 1,         // 洗腦的等級（1～3）：同時控制的數量上限見 CHARM_LEVELS
  charmDrain: 6,         // 每控制一隻，每秒消耗的 MP
  allySight: 260,        // 自己人會去攻擊多遠以內的敵人

  // 附身
  possessDrain: 10,      // 附身時每秒消耗的 MP
  possessCd: 3,          // 回到本體後的冷卻秒數
  possessStun: 1,        // 附身結束後，那隻敵人暈眩的秒數

  // 風場
  windSpeed: 220,        // 風速：被吹的東西最多被吹到這麼快
  windAccel: 6,          // 速度往風速靠近的快慢（每秒）；實際效果再乘上 受風面積 ÷ 質量²
  windGround: 0.5,       // 玩家站在地上時的倍率（踩得住）
  windSteam: 0.5,        // 蒸氣像素每一幀被吹動一格的機率

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
  stasisImpact: 200,     // 被時停的物體被撞的速度超過這個值，撞擊的力也會累積起來（時停結束時一次釋放）
  ironBreak: 520,        // 鐵塊撞牆或地面的速度超過這個值就碎掉（撞到敵人造成傷害時一定碎）；約等於從 9 格高掉下來

  // 物件
  boxFriction: 900,

  // 介面
  showHints: false,      // 房間提示預設隱藏，按 / 顯示（讓玩家先自己嘗試）

  // 除錯
  globalTimeScale: 1,
  godMode: false,        // 玩家無敵（尖刺、掉落仍會回到入口）
  showHitboxes: false,
};

// 重力抓取的等級
//   range：抓得到的距離（從肩膀到物體最近的邊）；maxMass：抓得起來的最大質量（木箱 1、鐵塊 2、重裝兵 5）
//   carry：true 時物體固定在角色面前，跟著角色走，游標只決定在角色周圍的哪個方向（Lv1）；false 時物體跟著游標移動
export const GRAB_LEVELS = {
  1: { range: 32, maxMass: 1, carry: true },
  2: { range: 80, maxMass: 2, carry: false },
  3: { range: 160, maxMass: 3, carry: false },
};

// 洗腦的等級：同時控制的數量上限
export const CHARM_LEVELS = { 1: 1, 2: 2, 3: 3 };

// 技能欄對應的按鍵（POE 式快捷鍵）
export const SLOT_KEYS = [
  { code: 'Mouse2', label: '右鍵' },
  { code: 'KeyQ', label: 'Q' },
  { code: 'KeyE', label: 'E' },
  { code: 'KeyR', label: 'R' },
  { code: 'KeyF', label: 'F' },
];
