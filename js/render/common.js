import { TREE_COLORS } from '../skills.js';

// 繪製共用的顏色與字型
export const JAMMER_COLORS = { ...TREE_COLORS, all: '#ffffff' };

// 像素字型（Fusion Pixel 12px，只用 12px 一種大小才會清楚）
export const FONT = '"FusionPixel", "Microsoft JhengHei", sans-serif';
export const TEXT = `12px ${FONT}`;
export const C = {
  bg: '#141821',
  bgGrid: '#1a1f2b',
  tile: '#3a4357',
  tileTop: '#56627d',
  spike: '#e05555',
  door: '#7a5c3a',
  key: '#ffd34d',
  plate: '#8fd18f',
  box: '#b98a4f',
  boxEdge: '#8a6435',
  platform: '#5d8aa8',
  player: '#e8edf5',
  playerBand: '#4ad0ff',
  web: '#ffffff',
  shot: '#cfe8ff',
  bullet: '#ff5e5e',
  hud: '#e8edf5',
  dim: '#7d869a',
};
