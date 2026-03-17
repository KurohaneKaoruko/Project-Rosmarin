import { DIRECTIONS, PLAYER_MAX_BOMBS, PLAYER_MAX_LIVES, WORLD, clamp } from './gameUtils';
import type { Enemy, GameState, Pickup } from '../types';

type AiMode = 'builtin' | 'custom';

type AiDirRef = {
  current: {
    dx: number;
    dy: number;
  };
};

type AiScriptRunner = ((state: any, utils: any) => any) | null;

type AiStepParams = {
  state: GameState;
  aiMode: AiMode;
  aiScript: AiScriptRunner;
  aiScriptErrorRef: { current: string | null };
  setAiScriptError: (value: string | null) => void;
  aiDirRef: AiDirRef;
};

export function computeAIStep({
  state: s,
  aiMode,
  aiScript,
  aiScriptErrorRef,
  setAiScriptError,
  aiDirRef,
}: AiStepParams) {
  if (aiMode === 'custom' && aiScript) {
    const snapshot = {
      time: s.time,
      score: s.score,
      lives: s.lives,
      intensity: s.intensity,
      bounds: { width: WORLD.width, height: WORLD.height },
      player: {
        x: s.player.x,
        y: s.player.y,
        r: s.player.r,
        speed: s.player.speed,
        bombs: s.player.bombs,
      },
      enemies: s.enemies.map((enemy) => ({
        x: enemy.x,
        y: enemy.y,
        vx: enemy.vx,
        vy: enemy.vy,
        r: enemy.r,
        hp: enemy.hp,
        type: enemy.type,
      })),
      bullets: s.bullets.map((bullet) => ({
        x: bullet.x,
        y: bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        r: bullet.r,
        owner: bullet.owner,
      })),
      pickups: s.pickups.map((pickup) => ({
        x: pickup.x,
        y: pickup.y,
        vx: pickup.vx,
        vy: pickup.vy,
        r: pickup.r,
        kind: pickup.kind,
      })),
    };

    const utils = {
      clamp,
      length: (dx: number, dy: number) => Math.hypot(dx, dy),
      normalize: (vec: { dx: number; dy: number }) => {
        const mag = Math.hypot(vec.dx, vec.dy);
        if (!mag) return { dx: 0, dy: 0 };
        return { dx: vec.dx / mag, dy: vec.dy / mag };
      },
      direction: (from: { x: number; y: number }, to: { x: number; y: number }) => {
        return utils.normalize({ dx: to.x - from.x, dy: to.y - from.y });
      },
      nearestEnemy: (from: { x: number; y: number }, enemies: typeof snapshot.enemies) => {
        let bestEnemy: typeof snapshot.enemies[number] | null = null;
        let bestDist = Infinity;
        for (const enemy of enemies) {
          const dist = Math.hypot(enemy.x - from.x, enemy.y - from.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestEnemy = enemy;
          }
        }
        return bestEnemy;
      },
      nearestBullet: (from: { x: number; y: number }, bullets: typeof snapshot.bullets) => {
        let bestBullet: typeof snapshot.bullets[number] | null = null;
        let bestDist = Infinity;
        for (const bullet of bullets) {
          if (bullet.owner !== 'enemy') continue;
          const dist = Math.hypot(bullet.x - from.x, bullet.y - from.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestBullet = bullet;
          }
        }
        return bestBullet;
      },
      nearestPickup: (from: { x: number; y: number }, pickups: typeof snapshot.pickups) => {
        let bestPickup: typeof snapshot.pickups[number] | null = null;
        let bestDist = Infinity;
        for (const pickup of pickups) {
          const dist = Math.hypot(pickup.x - from.x, pickup.y - from.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestPickup = pickup;
          }
        }
        return bestPickup;
      },
      avoidBullets: (from: { x: number; y: number }, bullets: typeof snapshot.bullets) => {
        let ax = 0;
        let ay = 0;
        for (const bullet of bullets) {
          if (bullet.owner !== 'enemy') continue;
          const dx = from.x - bullet.x;
          const dy = from.y - bullet.y;
          const distSq = dx * dx + dy * dy;
          if (distSq === 0) continue;
          const strength = Math.min(1.5, 1200 / distSq);
          ax += dx * strength;
          ay += dy * strength;
        }
        return utils.normalize({ dx: ax, dy: ay });
      },
    };

    try {
      const result = aiScript(snapshot, utils);
      let dx = 0;
      let dy = 0;
      if (Array.isArray(result)) {
        dx = Number(result[0]);
        dy = Number(result[1]);
      } else if (result && typeof result === 'object') {
        dx = Number((result as any).dx);
        dy = Number((result as any).dy);
      }
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        dx = 0;
        dy = 0;
      }
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }
      if (aiScriptErrorRef.current) {
        aiScriptErrorRef.current = null;
        setAiScriptError(null);
      }
      return { dx, dy };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (aiScriptErrorRef.current !== message) {
        aiScriptErrorRef.current = message;
        setAiScriptError(message);
      }
    }
  }

  const horizon = 0.8;
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
  const needUpgrade = s.player.spreadLevel < 3 || s.player.bulletSpeedMult < 1.8;
  const bombUrgency =
    s.player.bombs >= PLAYER_MAX_BOMBS ? 0 : s.player.bombs <= 0 ? 1.5 : s.player.bombs === 1 ? 1.1 : 0.75;
  let pickupTarget: Pickup | null = null;
  let pickupScore = -Infinity;
  const upgradeUrgency =
    0.9 + (3 - s.player.spreadLevel) * 0.1 + (1.8 - s.player.bulletSpeedMult) * 0.12;
  for (const pickup of s.pickups) {
    let urgency = 0;
    if (pickup.kind === 'life') {
      if (s.lives >= PLAYER_MAX_LIVES) continue;
      urgency = s.lives <= 2 ? 1.8 : 1.3;
    } else if (pickup.kind === 'bomb') {
      urgency = bombUrgency;
    } else if (needUpgrade) {
      urgency = upgradeUrgency;
    } else {
      urgency = bombUrgency * 0.9;
    }
    const dist = Math.hypot(pickup.x - s.player.x, pickup.y - s.player.y);
    const score = urgency / (dist + 30);
    if (score > pickupScore) {
      pickupScore = score;
      pickupTarget = pickup;
    }
  }
  const pickupDistNow = pickupTarget
    ? Math.hypot(pickupTarget.x - s.player.x, pickupTarget.y - s.player.y)
    : null;
  const pickupDir =
    pickupTarget && pickupDistNow
      ? {
          dx: (pickupTarget.x - s.player.x) / pickupDistNow,
          dy: (pickupTarget.y - s.player.y) / pickupDistNow,
        }
      : null;
  const pickupClose = pickupDistNow !== null && pickupDistNow < 140;
  const pickupCommit = pickupDistNow !== null && pickupDistNow < 85;

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
    const edgeBuffer = Math.min(
      finalX - s.player.r,
      WORLD.width - s.player.r - finalX,
      finalY - s.player.r,
      WORLD.height - s.player.r - finalY,
    );
    const edgeWeight = pickupCommit ? 0.08 : pickupClose ? 0.14 : 0.2;
    const verticalWeight = pickupCommit ? 0.0008 : pickupClose ? 0.0015 : 0.0025;
    const targetWeight = pickupCommit ? 0.004 : pickupClose ? 0.01 : 0.025;
    const verticalBias = -Math.abs(finalY - preferredY) * verticalWeight;
    const targetBias = targetX !== null ? -Math.abs(finalX - targetX) * targetWeight : 0;
    let pickupBias = 0;
    if (pickupTarget) {
      const dist = Math.hypot(finalX - pickupTarget.x, finalY - pickupTarget.y);
      const upgradeAsBomb = pickupTarget.kind === 'upgrade' && !needUpgrade;
      const weight =
        pickupTarget.kind === 'life'
          ? s.lives <= 2
            ? 1.8
            : 1.3
          : pickupTarget.kind === 'bomb'
            ? bombUrgency
            : upgradeAsBomb
              ? bombUrgency * 0.9
              : upgradeUrgency;
      pickupBias = (90 / (dist + 30)) * weight;
      if (pickupDistNow !== null && pickupDir) {
        const closeFactor = clamp((150 - pickupDistNow) / 150, 0, 1);
        const align = dx * pickupDir.dx + dy * pickupDir.dy;
        pickupBias += align * closeFactor * 28 * weight;
        if (pickupCommit && minClear > safeBullet * 0.55) {
          pickupBias += (pickupDistNow - dist) * 0.9 * weight;
        }
      }
    }
    const momentum = (dx * aiDirRef.current.dx + dy * aiDirRef.current.dy) * 0.08;
    const score =
      minClear * 1.2 -
      risk * 0.08 +
      edgeBuffer * edgeWeight +
      verticalBias +
      targetBias +
      pickupBias +
      momentum;
    if (score > best.score) {
      best = { score, dx, dy };
    }
  }
  aiDirRef.current = { dx: best.dx, dy: best.dy };
  return { dx: best.dx, dy: best.dy };
}
