export type Mode = 'menu' | 'running' | 'paused' | 'gameover';

export type BulletOwner = 'player' | 'enemy';

export type Bullet = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  owner: BulletOwner;
};

export type EnemyType = 'fixed' | 'tracker';

export type Enemy = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  type: EnemyType;
  fireTimer: number;
};

export type Player = {
  x: number;
  y: number;
  r: number;
  speed: number;
  fireTimer: number;
  invulnTimer: number;
  bulletSpeedMult: number;
  spreadLevel: number;
  bombs: number;
};

export type PickupKind = 'upgrade' | 'life' | 'bomb';

export type Pickup = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: PickupKind;
};

export type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
};

export type GameState = {
  mode: Mode;
  time: number;
  score: number;
  lives: number;
  enemies: Enemy[];
  bullets: Bullet[];
  pickups: Pickup[];
  particles: Particle[];
  player: Player;
  spawnTimer: number;
  aiEnabled: boolean;
  intensity: number;
};
