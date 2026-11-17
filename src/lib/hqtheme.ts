// What each office looks like: wall and floor colours, the floor material, the rug, the trim and the desks. Pure data (the drawing is in components/HqDecor.tsx).
import type { Room } from './hqwing';
export type FloorKind = 'wood' | 'carpet' | 'tile' | 'marble';
export interface Theme { wall: [string, string]; floor: [string, string]; kind: FloorKind; rug: string; trim: string; desk: [string, string]; glow: string }
export const THEME: Record<Room, Theme> = {
  email: { wall: ['#2f78b8', '#1c4d80'], floor: ['#2b4f7c', '#1d3a5e'], kind: 'carpet', rug: '#4a90d0', trim: '#8fd0ff', desk: ['#e9eff9', '#9db0cf'], glow: '#9fd6ff' },
  creative: { wall: ['#7a3fb0', '#4a2478'], floor: ['#4a3036', '#33202a'], kind: 'wood', rug: '#a655dc', trim: '#e0a8ff', desk: ['#2c3050', '#1a1d34'], glow: '#e0a8ff' },
  ads: { wall: ['#d08430', '#92521a'], floor: ['#3d424e', '#2a2f3a'], kind: 'tile', rug: '#eaa844', trim: '#ffd694', desk: ['#f4e6cb', '#b99b6a'], glow: '#ffd694' },
  desk: { wall: ['#239a82', '#146654'], floor: ['#21545a', '#16404a'], kind: 'carpet', rug: '#34c8a8', trim: '#94f2dc', desk: ['#f0f4f8', '#a8b8c8'], glow: '#94f2dc' },
  hub: { wall: ['#2347a8', '#142f74'], floor: ['#13255f', '#0b1848'], kind: 'marble', rug: '#2f5ad8', trim: '#ffc94d', desk: ['#d7e4ff', '#7f9bd8'], glow: '#9fc2ff' },
  booking: { wall: ['#3b58c0', '#25408f'], floor: ['#765234', '#5a3d25'], kind: 'wood', rug: '#6482f2', trim: '#a4b8ff', desk: ['#b27d46', '#76502c'], glow: '#a4b8ff' },
  hr: { wall: ['#4fa268', '#33724a'], floor: ['#62503a', '#483a26'], kind: 'wood', rug: '#72c88a', trim: '#bff2cc', desk: ['#b8864a', '#7c5a30'], glow: '#bff2cc' },
  cafe: { wall: ['#923f70', '#5e2548'], floor: ['#4e2d3f', '#37202d'], kind: 'wood', rug: '#c9649e', trim: '#ffb8e8', desk: ['#e8d6c0', '#a08868'], glow: '#ffb8e8' },
  board: { wall: ['#51332a', '#321e16'], floor: ['#2d1f1b', '#1e1411'], kind: 'carpet', rug: '#7e3232', trim: '#ffc94d', desk: ['#6a4630', '#40281a'], glow: '#ffc94d' },
};
