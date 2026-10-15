import { cfg } from './config.js';

// 即時參數面板。lil-gui 從 CDN 載入，離線時只會少了面板，遊戲照常執行。
export async function createDebugPanel() {
  let GUI;
  try {
    ({ default: GUI } = await import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/+esm'));
  } catch (err) {
    console.warn('lil-gui 載入失敗，除錯面板停用', err);
    return null;
  }

  const gui = new GUI({ title: '除錯參數（F2）' });
  gui.hide();

  // 面板裡的按鈕或勾選框有焦點時，空白鍵會觸發它（例如一直展開收合面板）。
  // 按下空白鍵時先移除焦點，讓空白鍵只用來跳躍。
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && gui.domElement.contains(document.activeElement)) {
      e.preventDefault();
      document.activeElement.blur();
    }
  }, true);

  const world = gui.addFolder('世界');
  world.add(cfg, 'gravity', 100, 2000, 10).name('重力');
  world.add(cfg, 'globalTimeScale', 0.1, 1, 0.05).name('整體速度');
  world.add(cfg, 'showHitboxes').name('顯示碰撞框').listen();

  const player = gui.addFolder('角色');
  player.add(cfg, 'runSpeed', 40, 300, 5).name('移動速度');
  player.add(cfg, 'jumpHeight', 1, 8, 0.25).name('跳躍高度（格）');
  player.add(cfg, 'groundAccel', 200, 4000, 50).name('地面加速度');
  player.add(cfg, 'airAccel', 100, 3000, 50).name('空中加速度');
  player.add(cfg, 'dashSpeed', 100, 600, 10).name('衝刺速度');
  player.add(cfg, 'playerMinTime', 0, 1, 0.05).name('時停中的最低倍率');

  const field = gui.addFolder('場域');
  field.add(cfg, 'fieldRadius', 8, 96, 1).name('半徑');
  field.add(cfg, 'fieldDuration', 0.5, 10, 0.5).name('持續時間');
  field.add(cfg, 'maxFields', 1, 6, 1).name('最多數量');
  field.add(cfg, 'mpCostRatio', 0, 0.5, 0.01).name('MP 消耗比例');
  field.add(cfg, 'mpRegen', 0, 30, 0.5).name('MP 回復／秒');
  field.add(cfg, 'selfAttachUnlocked').name('自身附著已解鎖');
  field.add(cfg, 'selfDrain', 0, 100, 1).name('自身附著 MP／秒');
  field.add(cfg, 'webRange', 32, 400, 4).name('網的射程');
  field.add(cfg, 'webSpeed', 100, 1200, 20).name('網的速度');

  const space = gui.addFolder('空間');
  space.add(cfg, 'blinkRange', 16, 320, 4).name('閃現距離');
  space.add(cfg, 'blinkThroughWalls').name('閃現可穿牆');
  space.add(cfg, 'portalDuration', 5, 120, 5).name('傳送門持續時間');
  space.add(cfg, 'portalMinExit', 0, 400, 10).name('出口最低速度');

  const light = gui.addFolder('干擾與光線');
  light.add(cfg, 'jammerRadius', 16, 160, 4).name('干擾器範圍');
  light.add(cfg, 'lightBend', 0, 1e-4, 1e-6).name('重力彎曲光線');
  light.add(cfg, 'laserDamage', 0, 5, 1).name('雷射兵傷害');
  light.add(cfg, 'laserCharge', 0.5, 5, 0.1).name('雷射集氣秒數');
  light.add(cfg, 'laserLock', 0, 2, 0.05).name('鎖定秒數');
  light.add(cfg, 'emitterDamage', 0, 5, 1).name('發射器傷害');

  const water = gui.addFolder('水與蒸氣（B 噴蒸氣、N 倒水）');
  water.add(cfg, 'steamRise', 0, 0.5, 0.005).name('蒸氣上升速度');
  water.add(cfg, 'steamWander', 0, 0.6, 0.01).name('蒸氣左右飄動');
  water.add(cfg, 'steamSpread', 2, 40, 1).name('蒸氣集中程度');
  water.add(cfg, 'steamCondense', 0, 0.5, 0.01).name('蒸氣凝結速度');
  water.add(cfg, 'boilRate', 0, 2, 0.05).name('沸騰速度');
  water.add(cfg, 'steamLift', 0, 150, 5).name('浮台上升速度');
  water.add(cfg, 'steamBlock', 0.05, 1, 0.05).name('擋光濃度');
  water.add(cfg, 'swimSpeed', 50, 300, 10).name('游泳速度');
  water.add(cfg, 'waterDrag', 0, 10, 0.5).name('水中阻力');

  const impact = gui.addFolder('撞擊傷害');
  impact.add(cfg, 'impactThreshold', 50, 600, 10).name('速度門檻');
  impact.add(cfg, 'impactPerDamage', 20, 400, 10).name('每點傷害所需速度');
  impact.add(cfg, 'impactRestitution', 0, 1, 0.05).name('反彈係數');

  const cannon = gui.addFolder('空氣砲');
  cannon.add(cfg, 'cannonRate', 1, 15, 0.5).name('每秒發數');
  cannon.add(cfg, 'cannonImpulse', 0, 800, 10).name('擊退力');
  cannon.add(cfg, 'cannonRange', 30, 400, 10).name('射程');
  cannon.add(cfg, 'recoil', 0, 300, 5).name('後座力');

  return gui;
}
