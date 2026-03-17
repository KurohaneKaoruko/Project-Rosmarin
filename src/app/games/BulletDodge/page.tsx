'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navigation from '../../components/Navigation';

type Mode = 'menu' | 'running' | 'paused' | 'gameover';

type BulletOwner = 'player' | 'enemy';

type Bullet = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  owner: BulletOwner;
};

type EnemyType = 'fixed' | 'tracker';

type Enemy = {
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

type Player = {
  x: number;
  y: number;
  r: number;
  speed: number;
  fireTimer: number;
  invulnTimer: number;
  bulletSpeedMult: number;
  spreadLevel: number;
};

type PickupKind = 'upgrade' | 'life';

type Pickup = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: PickupKind;
};

type Particle = {
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

type GameState = {
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

const WORLD = { width: 720, height: 420 };
const PLAYER_RADIUS = 6;
const PLAYER_SPEED = 280;
const PLAYER_FIRE_INTERVAL = 0.16;
const PLAYER_BULLET_SPEED = 420;
const ENEMY_MARGIN = 50;
const BULLET_MARGIN = 70;
const HUD_UPDATE_INTERVAL = 0.2;
const SCORE_PER_SECOND = 10;
const SCORE_PER_KILL_FIXED = 120;
const SCORE_PER_KILL_TRACKER = 180;
const SCORE_INTENSITY_BONUS = 0.18;
const DROP_UPGRADE_CHANCE = 0.25;
const DROP_LIFE_CHANCE = 0.12;
const PLAYER_MAX_LIVES = 5;
const PLAYER_INVULN_TIME = 1.4;
const PICKUP_SPEED = 60;

const DIRECTIONS = [
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function getSpawnInterval(time: number, intensity: number) {
  const base = 0.95 - intensity * 0.08;
  const ramp = base - time * 0.008;
  return clamp(ramp, 0.28, 1.1);
}

function getEnemySpeed(time: number, intensity: number) {
  return clamp(55 + intensity * 7 + time * 0.8, 55, 150);
}

function getEnemyBulletSpeed(time: number, intensity: number) {
  return clamp(140 + intensity * 12 + time * 1.2, 140, 260);
}

function getEnemyFireInterval(intensity: number) {
  return clamp(1.4 - intensity * 0.12, 0.45, 1.4);
}

function round(n: number, digits = 1) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export default function BulletDodgePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const rngRef = useRef<() => number>(() => Math.random());
  const keysRef = useRef<Set<string>>(new Set());
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const accumulatorRef = useRef(0);
  const externalTimeRef = useRef(false);
  const hudTimerRef = useRef(0);
  const bulletIdRef = useRef(1);
  const enemyIdRef = useRef(1);
  const pickupIdRef = useRef(1);
  const particleIdRef = useRef(1);
  const bestScoreRef = useRef(0);
  const aiDirRef = useRef({ dx: 0, dy: 0 });

  const [hud, setHud] = useState({
    mode: 'menu' as Mode,
    time: 0,
    score: 0,
    best: 0,
    enemies: 0,
    lives: 3,
    powerSpeed: 1,
    spreadLevel: 0,
    aiEnabled: false,
    intensity: 3,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const seed = useMemo(() => 43691, []);

  const syncHud = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    setHud({
      mode: s.mode,
      time: round(s.time, 2),
      score: Math.round(s.score),
      best: Math.round(bestScoreRef.current),
      enemies: s.enemies.length,
      lives: s.lives,
      powerSpeed: round(s.player.bulletSpeedMult, 2),
      spreadLevel: s.player.spreadLevel,
      aiEnabled: s.aiEnabled,
      intensity: s.intensity,
    });
  }, []);

  const resetState = useCallback(() => {
    rngRef.current = mulberry32(seed);
    const s = stateRef.current;
    if (!s) return;
    s.time = 0;
    s.score = 0;
    s.lives = 3;
    s.enemies = [];
    s.bullets = [];
    s.pickups = [];
    s.particles = [];
    s.spawnTimer = 0.8;
    s.player = {
      x: WORLD.width / 2,
      y: WORLD.height * 0.75,
      r: PLAYER_RADIUS,
      speed: PLAYER_SPEED,
      fireTimer: PLAYER_FIRE_INTERVAL,
      invulnTimer: 0,
      bulletSpeedMult: 1,
      spreadLevel: 0,
    };
  }, [seed]);

  const startGame = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    resetState();
    s.mode = 'running';
    syncHud();
  }, [resetState, syncHud]);

  const restartGame = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    resetState();
    s.mode = 'running';
    syncHud();
  }, [resetState, syncHud]);

  const togglePause = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.mode === 'running') {
      s.mode = 'paused';
    } else if (s.mode === 'paused') {
      s.mode = 'running';
    }
    syncHud();
  }, [syncHud]);

  const toggleAI = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    s.aiEnabled = !s.aiEnabled;
    syncHud();
  }, [syncHud]);

  const setIntensity = useCallback((value: number) => {
    const s = stateRef.current;
    if (!s) return;
    s.intensity = value;
    syncHud();
  }, [syncHud]);

  useEffect(() => {
    bestScoreRef.current = Number(window.localStorage.getItem('bullet-dodge-best-score') || 0);
  }, []);

  useEffect(() => {
    stateRef.current = {
      mode: 'menu',
      time: 0,
      score: 0,
      lives: 3,
      enemies: [],
      bullets: [],
      pickups: [],
      particles: [],
      player: {
        x: WORLD.width / 2,
        y: WORLD.height * 0.75,
        r: PLAYER_RADIUS,
        speed: PLAYER_SPEED,
        fireTimer: PLAYER_FIRE_INTERVAL,
        invulnTimer: 0,
        bulletSpeedMult: 1,
        spreadLevel: 0,
      },
      spawnTimer: 0.8,
      aiEnabled: false,
      intensity: 3,
    };
    syncHud();
  }, [syncHud]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(320, rect.width);
      const height = Math.max(220, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      render();
    };

    const getTransform = () => {
      const dpr = window.devicePixelRatio || 1;
      const viewWidth = canvas.width / dpr;
      const viewHeight = canvas.height / dpr;
      const scale = Math.min(viewWidth / WORLD.width, viewHeight / WORLD.height);
      const offsetX = (viewWidth - WORLD.width * scale) / 2;
      const offsetY = (viewHeight - WORLD.height * scale) / 2;
      return { dpr, scale, offsetX, offsetY };
    };

    const drawBackdrop = () => {
      const { dpr } = getTransform();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    };

    const render = () => {
      const s = stateRef.current;
      if (!s) return;
      drawBackdrop();
      const { dpr, scale, offsetX, offsetY } = getTransform();
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr);

      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= WORLD.width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD.height);
        ctx.stroke();
      }
      for (let y = 0; y <= WORLD.height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD.width, y);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, WORLD.width - 4, WORLD.height - 4);

      for (const particle of s.particles) {
        const alpha = Math.max(0, particle.life / particle.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const enemy of s.enemies) {
        if (enemy.type === 'fixed') {
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(enemy.x, enemy.y - enemy.r);
          ctx.lineTo(enemy.x + enemy.r, enemy.y);
          ctx.lineTo(enemy.x, enemy.y + enemy.r);
          ctx.lineTo(enemy.x - enemy.r, enemy.y);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = '#0ea5e9';
          ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r, enemy.r * 2, enemy.r * 2);
        }
      }

      for (const pickup of s.pickups) {
        if (pickup.kind === 'upgrade') {
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.moveTo(pickup.x, pickup.y - pickup.r);
          ctx.lineTo(pickup.x + pickup.r, pickup.y + pickup.r);
          ctx.lineTo(pickup.x - pickup.r, pickup.y + pickup.r);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = '#f472b6';
          ctx.fillRect(pickup.x - pickup.r * 0.6, pickup.y - pickup.r, pickup.r * 1.2, pickup.r * 2);
          ctx.fillRect(pickup.x - pickup.r, pickup.y - pickup.r * 0.6, pickup.r * 2, pickup.r * 1.2);
        }
      }

      for (const bullet of s.bullets) {
        if (bullet.owner === 'player') {
          ctx.fillStyle = '#111827';
        } else {
          ctx.fillStyle = '#ef4444';
        }
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = s.aiEnabled ? '#2563eb' : '#111827';
      ctx.beginPath();
      ctx.arc(s.player.x, s.player.y, s.player.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.player.invulnTimer > 0) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.player.x, s.player.y, s.player.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (s.mode !== 'running') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(0, 0, WORLD.width, WORLD.height);
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 22px "Segoe UI", sans-serif';
        const title = s.mode === 'menu' ? '弹幕射击' : s.mode === 'paused' ? '暂停' : '被击中';
        ctx.fillText(title, WORLD.width / 2, WORLD.height / 2 - 24);
        ctx.font = '14px "Segoe UI", sans-serif';
        const subtitle = s.mode === 'menu'
          ? '按 Enter 或点击开始按钮'
          : s.mode === 'paused'
            ? '按 Space 继续'
            : '按 Enter 重新开始';
        ctx.fillText(subtitle, WORLD.width / 2, WORLD.height / 2 + 12);
      }
    };

    const getInputVector = () => {
      const keys = keysRef.current;
      const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
      const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
      const up = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
      const down = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
      let dx = 0;
      let dy = 0;
      if (left) dx -= 1;
      if (right) dx += 1;
      if (up) dy -= 1;
      if (down) dy += 1;
      const magnitude = Math.hypot(dx, dy) || 1;
      return { dx: dx / magnitude, dy: dy / magnitude };
    };

    const computeAIStep = () => {
      const s = stateRef.current;
      if (!s) return { dx: 0, dy: 0 };
      const horizon = 0.75;
      const steps = 12;
      const safeBullet = 16;
      const safeEnemy = 22;
      let best = { score: -Infinity, dx: 0, dy: 0 };
      const preferredY = WORLD.height * 0.72;
      const targetEnemy = s.enemies.reduce<Enemy | null>((chosen, enemy) => {
        if (!chosen) return enemy;
        return enemy.y > chosen.y ? enemy : chosen;
      }, null);
      const targetX = targetEnemy ? targetEnemy.x : null;

      for (const dir of DIRECTIONS) {
        const mag = Math.hypot(dir.dx, dir.dy) || 1;
        const dx = dir.dx / mag;
        const dy = dir.dy / mag;
        let minClear = Infinity;
        let risk = 0;
        let finalX = s.player.x;
        let finalY = s.player.y;
        for (let i = 1; i <= steps; i += 1) {
          const t = (i / steps) * horizon;
          const px = clamp(s.player.x + dx * s.player.speed * t, s.player.r + 6, WORLD.width - s.player.r - 6);
          const py = clamp(s.player.y + dy * s.player.speed * t, s.player.r + 6, WORLD.height - s.player.r - 6);
          finalX = px;
          finalY = py;
          const timeWeight = 0.6 + (1 - t / horizon) * 0.6;

          for (const bullet of s.bullets) {
            if (bullet.owner !== 'enemy') continue;
            const bx = bullet.x + bullet.vx * t;
            const by = bullet.y + bullet.vy * t;
            const clearance = Math.hypot(px - bx, py - by) - bullet.r - s.player.r;
            if (clearance < minClear) minClear = clearance;
            if (clearance < safeBullet) {
              const danger = (safeBullet - clearance) ** 2;
              risk += danger * timeWeight;
            }
          }

          for (const enemy of s.enemies) {
            const ex = enemy.x + enemy.vx * t;
            const ey = enemy.y + enemy.vy * t;
            const clearance = Math.hypot(px - ex, py - ey) - enemy.r - s.player.r;
            if (clearance < minClear) minClear = clearance;
            if (clearance < safeEnemy) {
              const danger = (safeEnemy - clearance) ** 2;
              risk += danger * 1.4 * timeWeight;
            }
          }
        }
        if (!Number.isFinite(minClear)) minClear = 120;
        const edgeBuffer = Math.min(finalX - s.player.r, WORLD.width - s.player.r - finalX, finalY - s.player.r, WORLD.height - s.player.r - finalY);
        const verticalBias = -Math.abs(finalY - preferredY) * 0.0025;
        const targetBias = targetX !== null ? -Math.abs(finalX - targetX) * 0.025 : 0;
        const momentum = (dx * aiDirRef.current.dx + dy * aiDirRef.current.dy) * 0.08;
        const score = minClear * 1.2 - risk * 0.08 + edgeBuffer * 0.2 + verticalBias + targetBias + momentum;
        if (score > best.score) {
          best = { score, dx, dy };
        }
      }
      aiDirRef.current = { dx: best.dx, dy: best.dy };
      return { dx: best.dx, dy: best.dy };
    };

    const spawnEnemy = () => {
      const s = stateRef.current;
      if (!s) return;
      const rng = rngRef.current;
      const sideSpawn = rng() < 0.22 + s.intensity * 0.02;
      const typeRoll = rng();
      const type: EnemyType = typeRoll < 0.6 ? 'fixed' : 'tracker';
      const baseSpeed = getEnemySpeed(s.time, s.intensity);
      let x = 0;
      let y = 0;
      let vx = 0;
      let vy = 0;

      if (sideSpawn) {
        const fromLeft = rng() < 0.5;
        x = fromLeft ? -ENEMY_MARGIN : WORLD.width + ENEMY_MARGIN;
        y = rng() * WORLD.height * 0.55 + 20;
        vx = (fromLeft ? 1 : -1) * (baseSpeed * (0.9 + rng() * 0.4));
        vy = baseSpeed * 0.25;
      } else {
        x = rng() * (WORLD.width - 80) + 40;
        y = -ENEMY_MARGIN;
        vx = (rng() - 0.5) * 30;
        vy = baseSpeed * (0.7 + rng() * 0.5);
      }

      const r = type === 'fixed' ? 10 : 10;
      const hp = type === 'fixed' ? 1 : 2;
      const fireTimer = 0.6 + rng() * 0.8;

      s.enemies.push({
        id: enemyIdRef.current++,
        x,
        y,
        vx,
        vy,
        r,
        hp,
        type,
        fireTimer,
      });
    };

    const spawnPlayerBullet = (angle: number, speed: number) => {
      const s = stateRef.current;
      if (!s) return;
      s.bullets.push({
        id: bulletIdRef.current++,
        x: s.player.x,
        y: s.player.y - s.player.r - 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3,
        owner: 'player',
      });
    };

    const firePlayerBullets = () => {
      const s = stateRef.current;
      if (!s) return;
      const speed = PLAYER_BULLET_SPEED * s.player.bulletSpeedMult;
      const baseAngle = -Math.PI / 2;
      const patterns = [
        [0],
        [-0.08, 0.08],
        [-0.12, 0, 0.12],
        [-0.18, -0.06, 0.06, 0.18],
      ];
      const offsets = patterns[Math.min(s.player.spreadLevel, patterns.length - 1)];
      for (const offset of offsets) {
        spawnPlayerBullet(baseAngle + offset, speed);
      }
    };

    const spawnPickup = (x: number, y: number) => {
      const s = stateRef.current;
      if (!s) return;
      const rng = rngRef.current;
      const roll = rng();
      let kind: PickupKind | null = null;
      if (roll < DROP_LIFE_CHANCE) {
        kind = 'life';
      } else if (roll < DROP_LIFE_CHANCE + DROP_UPGRADE_CHANCE) {
        kind = 'upgrade';
      }
      if (!kind) return;
      s.pickups.push({
        id: pickupIdRef.current++,
        x,
        y,
        vx: (rng() - 0.5) * 20,
        vy: PICKUP_SPEED + rng() * 20,
        r: 8,
        kind,
      });
    };

    const spawnParticles = (x: number, y: number, color: string, count: number, speed: number, life: number) => {
      const s = stateRef.current;
      if (!s) return;
      const rng = rngRef.current;
      for (let i = 0; i < count; i += 1) {
        const angle = rng() * Math.PI * 2;
        const magnitude = speed * (0.4 + rng() * 0.6);
        s.particles.push({
          id: particleIdRef.current++,
          x,
          y,
          vx: Math.cos(angle) * magnitude,
          vy: Math.sin(angle) * magnitude,
          r: 1.8 + rng() * 2.4,
          life,
          maxLife: life,
          color,
        });
      }
    };

    const handlePlayerHit = () => {
      const s = stateRef.current;
      if (!s) return;
      if (s.player.invulnTimer > 0) return;
      spawnParticles(s.player.x, s.player.y, '#fb7185', 22, 180, 0.7);
      if (s.lives > 1) {
        s.lives -= 1;
        s.player.invulnTimer = PLAYER_INVULN_TIME;
        s.bullets = s.bullets.filter((bullet) => bullet.owner === 'player');
      } else {
        s.mode = 'gameover';
      }
    };

    const spawnEnemyBullets = (enemy: Enemy) => {
      const s = stateRef.current;
      if (!s) return;
      const speed = getEnemyBulletSpeed(s.time, s.intensity);
      if (enemy.type === 'fixed') {
        const spread = [-0.4, -0.2, 0, 0.2, 0.4];
        for (const offset of spread) {
          const angle = Math.PI / 2 + offset;
          s.bullets.push({
            id: bulletIdRef.current++,
            x: enemy.x,
            y: enemy.y + enemy.r + 4,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 3,
            owner: 'enemy',
          });
        }
      } else {
        const baseAngle = Math.atan2(s.player.y - enemy.y, s.player.x - enemy.x);
        const spread = [-0.18, 0, 0.18];
        for (const offset of spread) {
          const angle = baseAngle + offset;
          s.bullets.push({
            id: bulletIdRef.current++,
            x: enemy.x,
            y: enemy.y + enemy.r + 4,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 3.5,
            owner: 'enemy',
          });
        }
      }
    };

    const update = (dt: number) => {
      const s = stateRef.current;
      if (!s || s.mode !== 'running') return;

      const intensityMultiplier = 1 + s.intensity * SCORE_INTENSITY_BONUS;
      s.time += dt;
      s.score += dt * SCORE_PER_SECOND * intensityMultiplier;
      s.spawnTimer -= dt;
      while (s.spawnTimer <= 0) {
        spawnEnemy();
        s.spawnTimer += getSpawnInterval(s.time, s.intensity);
      }

      const slow = keysRef.current.has('Shift');
      const speed = s.player.speed * (slow ? 0.55 : 1);
      const input = s.aiEnabled ? computeAIStep() : getInputVector();
      s.player.x = clamp(s.player.x + input.dx * speed * dt, s.player.r + 4, WORLD.width - s.player.r - 4);
      s.player.y = clamp(s.player.y + input.dy * speed * dt, s.player.r + 4, WORLD.height - s.player.r - 4);

      s.player.invulnTimer = Math.max(0, s.player.invulnTimer - dt);
      s.player.fireTimer -= dt;
      if (s.player.fireTimer <= 0) {
        firePlayerBullets();
        s.player.fireTimer = PLAYER_FIRE_INTERVAL;
      }

      for (const enemy of s.enemies) {
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0) {
          spawnEnemyBullets(enemy);
          enemy.fireTimer = getEnemyFireInterval(s.intensity);
        }
      }

      for (const bullet of s.bullets) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
      }

      for (const pickup of s.pickups) {
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
      }

      for (const particle of s.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
      }

      const remainingEnemies: Enemy[] = [];
      for (const enemy of s.enemies) {
        const offscreen =
          enemy.x < -ENEMY_MARGIN * 1.6 ||
          enemy.x > WORLD.width + ENEMY_MARGIN * 1.6 ||
          enemy.y > WORLD.height + ENEMY_MARGIN * 1.6;
        if (!offscreen) remainingEnemies.push(enemy);
      }
      s.enemies = remainingEnemies;

      const remainingBullets: Bullet[] = [];
      for (const bullet of s.bullets) {
        const offscreen =
          bullet.x < -BULLET_MARGIN ||
          bullet.x > WORLD.width + BULLET_MARGIN ||
          bullet.y < -BULLET_MARGIN ||
          bullet.y > WORLD.height + BULLET_MARGIN;
        if (!offscreen) remainingBullets.push(bullet);
      }
      s.bullets = remainingBullets;
      s.pickups = s.pickups.filter(
        (pickup) =>
          pickup.x > -BULLET_MARGIN &&
          pickup.x < WORLD.width + BULLET_MARGIN &&
          pickup.y > -BULLET_MARGIN &&
          pickup.y < WORLD.height + BULLET_MARGIN
      );
      s.particles = s.particles.filter((particle) => particle.life > 0);

      for (const enemy of s.enemies) {
        if (Math.hypot(enemy.x - s.player.x, enemy.y - s.player.y) < enemy.r + s.player.r) {
          handlePlayerHit();
        }
      }

      for (const bullet of s.bullets) {
        if (bullet.owner === 'enemy') {
          const hit = Math.hypot(bullet.x - s.player.x, bullet.y - s.player.y) < bullet.r + s.player.r;
          if (hit) {
            handlePlayerHit();
            break;
          }
        }
      }

      if (s.mode === 'gameover') {
        if (s.score > bestScoreRef.current) {
          bestScoreRef.current = s.score;
          window.localStorage.setItem('bullet-dodge-best-score', String(bestScoreRef.current));
        }
        syncHud();
        return;
      }

      const bulletsToKeep: Bullet[] = [];
      for (const bullet of s.bullets) {
        if (bullet.owner !== 'player') {
          bulletsToKeep.push(bullet);
          continue;
        }
        let hit = false;
        for (const enemy of s.enemies) {
          if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < bullet.r + enemy.r) {
            enemy.hp -= 1;
            hit = true;
            if (enemy.hp <= 0) {
              const base = enemy.type === 'fixed' ? SCORE_PER_KILL_FIXED : SCORE_PER_KILL_TRACKER;
              s.score += base * intensityMultiplier;
              spawnParticles(enemy.x, enemy.y, '#fb923c', enemy.type === 'fixed' ? 10 : 14, 120, 0.6);
              spawnPickup(enemy.x, enemy.y);
            }
            break;
          }
        }
        if (!hit) bulletsToKeep.push(bullet);
      }
      s.bullets = bulletsToKeep;
      s.enemies = s.enemies.filter((enemy) => enemy.hp > 0);

      const pickupsToKeep: Pickup[] = [];
      for (const pickup of s.pickups) {
        const dist = Math.hypot(pickup.x - s.player.x, pickup.y - s.player.y);
        if (dist < pickup.r + s.player.r) {
          if (pickup.kind === 'life') {
            s.lives = Math.min(PLAYER_MAX_LIVES, s.lives + 1);
            spawnParticles(pickup.x, pickup.y, '#f472b6', 10, 100, 0.5);
          } else {
            s.player.bulletSpeedMult = Math.min(1.8, s.player.bulletSpeedMult + 0.12);
            s.player.spreadLevel = Math.min(3, s.player.spreadLevel + 1);
            spawnParticles(pickup.x, pickup.y, '#22c55e', 12, 120, 0.55);
          }
        } else {
          pickupsToKeep.push(pickup);
        }
      }
      s.pickups = pickupsToKeep;

      hudTimerRef.current += dt;
      if (hudTimerRef.current >= HUD_UPDATE_INTERVAL) {
        hudTimerRef.current = 0;
        syncHud();
      }
    };

    const step = (dt: number) => {
      update(dt);
      render();
    };

    const loop = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = Math.min(0.05, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;
      if (!externalTimeRef.current) {
        accumulatorRef.current += delta;
        const stepSize = 1 / 60;
        while (accumulatorRef.current >= stepSize) {
          update(stepSize);
          accumulatorRef.current -= stepSize;
        }
      }
      render();
      animationRef.current = requestAnimationFrame(loop);
    };

    resizeCanvas();
    animationRef.current = requestAnimationFrame(loop);
    window.addEventListener('resize', resizeCanvas);

    const onKeyDown = (event: KeyboardEvent) => {
      const s = stateRef.current;
      if (s && (s.mode === 'menu' || s.mode === 'gameover')) {
        const starterKeys = [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'w',
          'a',
          's',
          'd',
          'W',
          'A',
          'S',
          'D',
          'Enter',
        ];
        if (starterKeys.includes(event.key)) {
          startGame();
        }
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        startGame();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        togglePause();
        return;
      }
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        restartGame();
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
        return;
      }
      keysRef.current.add(event.key);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key);
    };

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      resizeCanvas();
    };

    const onCanvasClick = () => {
      const s = stateRef.current;
      if (!s) return;
      if (s.mode === 'menu' || s.mode === 'gameover') {
        startGame();
      }
    };

    canvas.addEventListener('click', onCanvasClick);

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    window.render_game_to_text = () => {
      const s = stateRef.current;
      if (!s) return '';
      return JSON.stringify({
        mode: s.mode,
        time: round(s.time, 2),
        score: Math.round(s.score),
        bestScore: Math.round(bestScoreRef.current),
        aiEnabled: s.aiEnabled,
        intensity: s.intensity,
        lives: s.lives,
        power: {
          bulletSpeedMult: round(s.player.bulletSpeedMult, 2),
          spreadLevel: s.player.spreadLevel,
        },
        coord: 'origin top-left, x right, y down, units px',
        bounds: { width: WORLD.width, height: WORLD.height },
        player: {
          x: round(s.player.x, 1),
          y: round(s.player.y, 1),
          r: s.player.r,
          speed: s.player.speed,
          invuln: round(s.player.invulnTimer, 2),
        },
        enemies: s.enemies.map((enemy) => ({
          id: enemy.id,
          x: round(enemy.x, 1),
          y: round(enemy.y, 1),
          r: enemy.r,
          hp: enemy.hp,
          type: enemy.type,
          vx: round(enemy.vx, 1),
          vy: round(enemy.vy, 1),
        })),
        pickups: s.pickups.map((pickup) => ({
          id: pickup.id,
          x: round(pickup.x, 1),
          y: round(pickup.y, 1),
          r: pickup.r,
          kind: pickup.kind,
        })),
        bullets: s.bullets.map((bullet) => ({
          id: bullet.id,
          x: round(bullet.x, 1),
          y: round(bullet.y, 1),
          r: round(bullet.r, 1),
          vx: round(bullet.vx, 1),
          vy: round(bullet.vy, 1),
          owner: bullet.owner,
        })),
      });
    };

    window.advanceTime = (ms: number) => {
      externalTimeRef.current = true;
      const stepSize = 1000 / 60;
      const steps = Math.max(1, Math.round(ms / stepSize));
      for (let i = 0; i < steps; i += 1) {
        step(1 / 60);
      }
    };

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      canvas.removeEventListener('click', onCanvasClick);
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [restartGame, startGame, syncHud, togglePause]);

  const statusLabel = useMemo(() => {
    if (hud.mode === 'running') return hud.aiEnabled ? 'AI 接管' : '手动模式';
    if (hud.mode === 'paused') return '已暂停';
    if (hud.mode === 'gameover') return '被击中';
    return '等待开始';
  }, [hud.aiEnabled, hud.mode]);

  return (
    <main className="min-h-screen">
      <Navigation title="DANMAKU_DODGE" />

      <div className="pt-20 pb-4 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <section className="lg:flex-1 bg-white tech-border border border-zinc-200 p-4 lg:p-6 relative">
              <div className="absolute -top-px -left-px w-2 h-2 border-t border-l border-blue-600"></div>
              <div className="absolute -top-px -right-px w-2 h-2 border-t border-r border-blue-600"></div>
              <div className="absolute -bottom-px -left-px w-2 h-2 border-b border-l border-blue-600"></div>
              <div className="absolute -bottom-px -right-px w-2 h-2 border-b border-r border-blue-600"></div>

              <div className="flex justify-center">
                <div
                  ref={containerRef}
                  className={`relative w-full border border-zinc-200 bg-zinc-50 flex items-center justify-center ${isFullscreen ? 'h-full' : 'max-w-[980px]'}`}
                  style={isFullscreen ? { width: '100%', height: '100%' } : { aspectRatio: '720 / 420' }}
                >
                  <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 text-[11px] font-mono text-zinc-700">
                    <div className="flex flex-wrap gap-2">
                      <div className="border border-zinc-200 bg-white/90 px-2 py-1">
                        TIME {hud.time.toFixed(2)}s
                      </div>
                      <div className="border border-zinc-200 bg-white/90 px-2 py-1">
                        SCORE {hud.score}
                      </div>
                      <div className="border border-zinc-200 bg-white/90 px-2 py-1">
                        BEST {hud.best}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="border border-zinc-200 bg-white/90 px-2 py-1">
                        SPD {hud.powerSpeed}x
                      </div>
                      <div className="border border-zinc-200 bg-white/90 px-2 py-1">
                        SPR {hud.spreadLevel}
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-3 right-3 z-10">
                    <div className="flex items-center gap-2 border border-zinc-200 bg-white/90 px-2 py-1 text-[11px] font-mono text-zinc-700">
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                        <path
                          d="M8 13.5L3.6 9.1A3.2 3.2 0 0 1 8 4.2a3.2 3.2 0 0 1 4.4 4.9L8 13.5Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{hud.lives}</span>
                    </div>
                  </div>
                  <canvas ref={canvasRef} />
                </div>
              </div>
            </section>

            <section className="lg:w-[300px] xl:w-[320px] bg-white tech-border border border-zinc-200 px-4 pt-4 pb-3 lg:px-6 lg:pt-6 lg:pb-4 relative">
              <div className="absolute -top-px -left-px w-2 h-2 border-t border-l border-blue-600 pointer-events-none"></div>
              <div className="absolute -top-px -right-px w-2 h-2 border-t border-r border-blue-600 pointer-events-none"></div>
              <div className="absolute -bottom-px -left-px w-2 h-2 border-b border-l border-blue-600 pointer-events-none"></div>
              <div className="absolute -bottom-px -right-px w-2 h-2 border-b border-r border-blue-600 pointer-events-none"></div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-zinc-400 font-mono">Status</div>
                    <div className="text-lg font-semibold text-zinc-800 mt-1">{statusLabel}</div>
                  </div>
                  <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest border ${hud.aiEnabled ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                    {hud.aiEnabled ? 'AI ON' : 'AI OFF'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    id="start-btn"
                    onClick={startGame}
                    className="px-4 py-3 bg-zinc-900 text-white text-xs font-bold tracking-widest uppercase hover:bg-zinc-800 transition"
                  >
                    开始
                  </button>
                  <button
                    onClick={togglePause}
                    className="px-4 py-3 border border-zinc-200 text-zinc-600 text-xs font-bold tracking-widest uppercase hover:border-zinc-300 hover:text-zinc-900 transition"
                  >
                    {hud.mode === 'paused' ? '继续' : '暂停'}
                  </button>
                  <button
                    onClick={restartGame}
                    className="px-4 py-3 border border-zinc-200 text-zinc-600 text-xs font-bold tracking-widest uppercase hover:border-zinc-300 hover:text-zinc-900 transition"
                  >
                    重新开始
                  </button>
                  <button
                    onClick={toggleAI}
                    className="px-4 py-3 bg-blue-600 text-white text-xs font-bold tracking-widest uppercase hover:bg-blue-500 transition"
                  >
                    AI 接管
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-zinc-500">
                    <span>敌人密度</span>
                    <span>{hud.intensity}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={hud.intensity}
                    onChange={(event) => setIntensity(Number(event.target.value))}
                    className="w-full h-2 bg-zinc-100 appearance-none cursor-pointer accent-zinc-900"
                  />
                </div>

                {/* Stats moved to canvas overlay */}

                <div className="text-xs text-zinc-500 leading-relaxed space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono">Controls</div>
                  <div>移动：WASD / 方向键</div>
                  <div>射击：自动 ｜ 慢速：Shift</div>
                  <div>暂停：Space ｜ 重新开始：R ｜ 全屏：F</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
