export const WORLD = { width: 720, height: 420 };
export const PLAYER_RADIUS = 6;
export const PLAYER_SPEED = 280;
export const PLAYER_FIRE_INTERVAL = 0.16;
export const PLAYER_BULLET_SPEED = 420;
export const ENEMY_MARGIN = 50;
export const BULLET_MARGIN = 70;
export const HUD_UPDATE_INTERVAL = 0.2;
export const SCORE_PER_SECOND = 10;
export const SCORE_PER_KILL_FIXED = 120;
export const SCORE_PER_KILL_TRACKER = 180;
export const SCORE_INTENSITY_BONUS = 0.18;
export const DROP_UPGRADE_CHANCE = 0.25;
export const DROP_LIFE_CHANCE = 0.12;
export const DROP_BOMB_CHANCE = 0.1;
export const PLAYER_MAX_LIVES = 5;
export const PLAYER_MAX_BOMBS = 3;
export const PLAYER_INVULN_TIME = 1.4;
export const PICKUP_SPEED = 60;

export const DIRECTIONS = [
  { dx: 0, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function getSpawnInterval(time: number, intensity: number) {
  const base = 0.95 - intensity * 0.08;
  const ramp = base - time * 0.008;
  return clamp(ramp, 0.28, 1.1);
}

export function getEnemySpeed(time: number, intensity: number) {
  return clamp(55 + intensity * 7 + time * 0.8, 55, 150);
}

export function getEnemyBulletSpeed(time: number, intensity: number) {
  return clamp(140 + intensity * 12 + time * 1.2, 140, 260);
}

export function getEnemyFireInterval(intensity: number) {
  return clamp(1.4 - intensity * 0.12, 0.45, 1.4);
}

export function getIntensity(time: number) {
  return clamp(1 + time / 20, 1, 5);
}

export function round(n: number, digits = 1) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}
