// What each office looks like: wall and floor colours, the floor material, the rug, the trim and the desks. Pure data (the drawing is in components/HqDecor.tsx).
import type { Room } from './hqwing';
export type FloorKind = 'wood' | 'carpet' | 'tile' | 'marble';
export interface Theme { wall: [string, string]; floor: [string, string]; kind: FloorKind; rug: string; trim: string; desk: [string, string]; glow: string }
export const THEME: Record<Room, Theme> = {
  email: { wall: ['#173a63', '#0b1a30'], floor: ['#0e1a2e', '#08101f'], kind: 'tile', rug: '#38a8ff', trim: '#5cc8ff', desk: ['#eef4ff', '#7f93b8'], glow: '#38a8ff' },
  creative: { wall: ['#3a2166', '#170d2e'], floor: ['#140d26', '#0b0718'], kind: 'tile', rug: '#b46cff', trim: '#c58cff', desk: ['#eef4ff', '#7f93b8'], glow: '#b46cff' },
  ads: { wall: ['#5a3a12', '#24160a'], floor: ['#171410', '#0d0b08'], kind: 'tile', rug: '#ffae3d', trim: '#ffbf5c', desk: ['#eef4ff', '#7f93b8'], glow: '#ffae3d' },
  desk: { wall: ['#0f4a46', '#07201f'], floor: ['#0a1b1c', '#061112'], kind: 'tile', rug: '#2fe0c0', trim: '#4cf0d2', desk: ['#eef4ff', '#7f93b8'], glow: '#2fe0c0' },
  hub: { wall: ['#13306e', '#08142f'], floor: ['#0a1330', '#050a1c'], kind: 'marble', rug: '#4f86ff', trim: '#ffc94d', desk: ['#eef4ff', '#7f93b8'], glow: '#6fa0ff' },
  booking: { wall: ['#1d3f8a', '#0c1a3c'], floor: ['#0d1730', '#070d1d'], kind: 'tile', rug: '#6d92ff', trim: '#8fb0ff', desk: ['#eef4ff', '#7f93b8'], glow: '#6d92ff' },
  hr: { wall: ['#14573a', '#0a2318'], floor: ['#0c1a14', '#07100c'], kind: 'tile', rug: '#46e08a', trim: '#6af0a6', desk: ['#eef4ff', '#7f93b8'], glow: '#46e08a' },
  cafe: { wall: ['#5c1f46', '#25091c'], floor: ['#1a0d16', '#0e060d'], kind: 'marble', rug: '#ff5cb8', trim: '#ff82cc', desk: ['#eef4ff', '#7f93b8'], glow: '#ff5cb8' },
  board: { wall: ['#2a2a36', '#101018'], floor: ['#101018', '#08080e'], kind: 'marble', rug: '#ffc94d', trim: '#ffc94d', desk: ['#2b3350', '#141a30'], glow: '#ffc94d' },
};
