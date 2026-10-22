import type { Direction, Point, SnakeState } from '../types';
import { inBounds, isOpposite, movePoint, samePoint, validNextDirections } from './engine';
import { HamiltonianCycle } from './hamiltonian';
import { CustomScriptExecutor, DirectionValues } from './customScript';

export type AIStrategy = 'greedy' | 'safe' | 'strong' | 'hamiltonian' | 'custom';

export type AIMove = {
  direction: Direction;
  strategy: 'to_food' | 'to_tail' | 'max_space' | 'fallback' | 'greedy' | 'hamiltonian' | 'custom';
  pathLength?: number;
};

type Cell = { x: number; y: number };

function keyOf(p: Cell): number {
  return (p.y << 16) | p.x;
}

function neighbors(p: Cell): Cell[] {
  return [
    { x: p.x, y: p.y - 1 },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
    { x: p.x + 1, y: p.y },
  ];
}

function dirFromTo(a: Point, b: Point): Direction {
  if (b.x === a.x && b.y === a.y - 1) return 'Up';
  if (b.x === a.x && b.y === a.y + 1) return 'Down';
  if (b.x === a.x - 1 && b.y === a.y) return 'Left';
  return 'Right';
}

function buildBlocked(state: SnakeState, allowTail: boolean): boolean[][] {
  const blocked: boolean[][] = Array.from({ length: state.height }, () => Array.from({ length: state.width }, () => false));
  const lastIndex = state.snake.length - 1;
  for (let i = 0; i < state.snake.length; i++) {
    if (allowTail && i === lastIndex) continue;
    const p = state.snake[i];
    blocked[p.y][p.x] = true;
  }
  return blocked;
}

function bfsPath(
  start: Cell,
  goal: Cell,
  width: number,
  height: number,
  blocked: boolean[][]
): Cell[] | null {
  const startKey = keyOf(start);
  const goalKey = keyOf(goal);
  const queue: Cell[] = [start];
  const headIndex: number[] = [0];
  const visited = new Set<number>([startKey]);
  const prev = new Map<number, number>();

  while (headIndex[0] < queue.length) {
    const cur = queue[headIndex[0]++];
    const curKey = keyOf(cur);
    if (curKey === goalKey) break;

    for (const n of neighbors(cur)) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      if (blocked[n.y][n.x] && !(n.x === goal.x && n.y === goal.y)) continue;
      const nk = keyOf(n);
      if (visited.has(nk)) continue;
      visited.add(nk);
      prev.set(nk, curKey);
      queue.push(n);
    }
  }

  if (!prev.has(goalKey) && startKey !== goalKey) return null;

  const path: Cell[] = [];
  let curKey = goalKey;
  const safety = width * height + 5;
  let steps = 0;
  while (curKey !== startKey && steps++ < safety) {
    const x = curKey & 0xffff;
    const y = curKey >> 16;
    path.push({ x, y });
    const p = prev.get(curKey);
    if (p === undefined) return null;
    curKey = p;
  }
  path.reverse();
  return path;
}

function simulateNextSnake(state: SnakeState, dir: Direction): Point[] {
  const head = state.snake[0];
  const nh = movePoint(head, dir);
  const willEat = samePoint(nh, state.food);
  const next = [nh, ...state.snake];
  if (!willEat) next.pop();
  return next;
}

function floodFillCount(start: Point, width: number, height: number, blocked: boolean[][]): number {
  if (!inBounds(start, width, height)) return 0;
  if (blocked[start.y][start.x]) return 0;
  const queue: Cell[] = [{ x: start.x, y: start.y }];
  const headIndex: number[] = [0];
  const visited = new Set<number>([keyOf(queue[0])]);
  let count = 0;
  while (headIndex[0] < queue.length) {
    const cur = queue[headIndex[0]++];
    count++;
    for (const n of neighbors(cur)) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      if (blocked[n.y][n.x]) continue;
      const nk = keyOf(n);
      if (visited.has(nk)) continue;
      visited.add(nk);
      queue.push(n);
    }
  }
  return count;
}

// 1. Greedy: Minimize Manhattan distance to food, no collision checks other than immediate next step
function getGreedyMove(state: SnakeState, legal: Direction[]): AIMove {
  const head = state.snake[0];
  const food = state.food;
  
  let bestDir = legal[0];
  let minDist = Infinity;

  for (const d of legal) {
    const nh = movePoint(head, d);
    const dist = Math.abs(nh.x - food.x) + Math.abs(nh.y - food.y);
    if (dist < minDist) {
      minDist = dist;
      bestDir = d;
    }
  }
  return { direction: bestDir, strategy: 'greedy' };
}

// 2. Safe: BFS to food -> BFS to tail -> Max Space
function getSafeMove(state: SnakeState, legal: Direction[]): AIMove {
  const head = state.snake[0];
  const food = state.food;
  const tail = state.snake[state.snake.length - 1];

  // Try to find path to food
  const blockedForFood = buildBlocked(state, true);
  const pathToFood = bfsPath(
    { x: head.x, y: head.y },
    { x: food.x, y: food.y },
    state.width,
    state.height,
    blockedForFood
  );
  if (pathToFood && pathToFood.length > 0) {
    const next = pathToFood[0];
    const dir = dirFromTo(head, next);
    if (!isOpposite(state.direction, dir) && legal.includes(dir)) {
      return { direction: dir, strategy: 'to_food', pathLength: pathToFood.length };
    }
  }

  // Try to find path to tail
  const blockedForTail = buildBlocked(state, true);
  const pathToTail = bfsPath(
    { x: head.x, y: head.y },
    { x: tail.x, y: tail.y },
    state.width,
    state.height,
    blockedForTail
  );
  if (pathToTail && pathToTail.length > 0) {
    const next = pathToTail[0];
    const dir = dirFromTo(head, next);
    if (!isOpposite(state.direction, dir) && legal.includes(dir)) {
      return { direction: dir, strategy: 'to_tail', pathLength: pathToTail.length };
    }
  }

  return getMaxSpaceMove(state, legal);
}

// 3. Strong: BFS to food (BUT verify tail reachable after eating) -> BFS to tail -> Max Space
function getStrongMove(state: SnakeState, legal: Direction[]): AIMove {
  const head = state.snake[0];
  const food = state.food;
  const tail = state.snake[state.snake.length - 1];

  // A. Try to find path to food AND check safety
  const blockedForFood = buildBlocked(state, true);
  const pathToFood = bfsPath(
    { x: head.x, y: head.y },
    { x: food.x, y: food.y },
    state.width,
    state.height,
    blockedForFood
  );

  if (pathToFood && pathToFood.length > 0) {
    // Check if taking this path is safe (can we reach tail after eating?)
    // Simulate the state after eating
    // Simplified simulation:
    // 1. New Head = Food
    // 2. Body includes path
    // 3. Tail moves (path.length - 1) times. 
    // Actually, snake grows by 1. Total moves = path.length.
    // If path.length = 5. Snake moves 5 times. Grows 1.
    // Tail index in original snake moves (5 - 1 = 4) steps? No.
    // Length increases by 1.
    // Effective tail position: 
    //   If path.length <= snake.length (usual), the old tail moves forward by path.length.
    //   Wait, if we eat, we grow. Tail stays for 1 turn?
    //   Correct logic: Each move shifts body. Eat adds 1 at head.
    //   So after N moves (eating at N), tail moves N-1 times.
    //   New Tail is at index (snake.length - 1 - (path.length - 1)) = snake.length - path.length?
    //   Let's construct the "Virtual Blocked Grid" directly.
    
    // Virtual Blocked Grid includes:
    // 1. All points in `pathToFood` (except the very last one? No, we need to reach tail FROM food).
    //    Actually, we are at Food. We need to reach New Tail.
    // 2. The remaining parts of the old body.
    
    // Calculate how many segments of the old body remain.
    // Moves = path.length.
    // Growth = 1.
    // Old body segments remaining = OriginalLength - (Moves - Growth) = OriginalLength - path.length + 1?
    // Example: Snake [H, B1, T]. Len 3. Food at dist 1. Path [F].
    // Move 1 to F. Eat. Snake [F, H, B1, T]. Len 4.
    // Moves=1. Growth=1. Remaining = 3 - (1-1) = 3. All remain. Correct.
    // Example: Snake [H, B1, T]. Len 3. Food at dist 2. Path [P, F].
    // Move 1 to P. [P, H, B1]. T removed.
    // Move 2 to F. [F, P, H, B1]. Eat.
    // Moves=2. Growth=1. Remaining = 3 - (2-1) = 2. [H, B1] remain. T gone.
    
    const moves = pathToFood.length;
    const growth = 1;
    const segmentsToKeep = state.snake.length - (moves - growth);
    
    const virtualBlocked = Array.from({ length: state.height }, () => Array.from({ length: state.width }, () => false));
    
    // Block the path (excluding the current head position which is start of path? bfsPath excludes start)
    // bfsPath returns [Step1, Step2, ..., Goal].
    // So block all of them.
    for (const p of pathToFood) {
      virtualBlocked[p.y][p.x] = true;
    }
    
    // Block the remaining old body
    for (let i = 0; i < segmentsToKeep; i++) {
      if (i >= state.snake.length) break; // Should not happen if math is right
      const p = state.snake[i];
      // Note: snake[0] is current Head. 
      // After moving, snake[0] becomes body[1] in new snake...
      // The logic `segmentsToKeep` counts from the *head* backwards?
      // Yes, snake[0] is head, snake[N] is tail.
      // We keep the first `segmentsToKeep` segments of the OLD snake.
      virtualBlocked[p.y][p.x] = true;
    }
    
    // The "New Tail" is the last segment of the *remaining* old body.
    // If segmentsToKeep < 1, it means the whole old body is gone (moved into path).
    // Then New Tail is somewhere in the path.
    // For simplicity, let's just target the *current* tail? 
    // No, current tail might be gone.
    // Target the *last valid segment* of the virtual snake.
    
    let virtualTail: Point;
    if (segmentsToKeep > 0) {
      virtualTail = state.snake[segmentsToKeep - 1];
    } else {
      // Old body completely gone. Tail is in path.
      // Index in path?
      // Path: [P1, P2, ... PF].
      // New Snake: [PF, ... P1, ...].
      // Length = OldLen + 1.
      // We are at PF.
      // Tail is at Path[Path.length - 1 - (NewLen - 1)]?
      // Simplified: Just use the *current* tail if feasible, or check connectivity generally?
      // Actually, if we consume the whole body, we are very safe usually.
      // Let's rely on `segmentsToKeep > 0` for 99% of cases.
      // If `segmentsToKeep <= 0`, we are small and moving far.
      // Just assume safe or use current tail as proxy (it will be empty space, so reachable).
       virtualTail = tail; // Fallback
    }

    // Unblock the virtual tail (we want to reach it)
    virtualBlocked[virtualTail.y][virtualTail.x] = false;

    // Check reachability from Food to Virtual Tail
    const pathFromFoodToTail = bfsPath(
      { x: food.x, y: food.y },
      { x: virtualTail.x, y: virtualTail.y },
      state.width,
      state.height,
      virtualBlocked
    );

    if (pathFromFoodToTail) {
      const next = pathToFood[0];
      const dir = dirFromTo(head, next);
      if (!isOpposite(state.direction, dir) && legal.includes(dir)) {
        return { direction: dir, strategy: 'to_food', pathLength: pathToFood.length };
      }
    }
  }

  // B. If Food path unsafe or not found: BFS to Tail
  const blockedForTail = buildBlocked(state, true);
  const pathToTail = bfsPath(
    { x: head.x, y: head.y },
    { x: tail.x, y: tail.y },
    state.width,
    state.height,
    blockedForTail
  );
  if (pathToTail && pathToTail.length > 0) {
    const next = pathToTail[0];
    const dir = dirFromTo(head, next);
    if (!isOpposite(state.direction, dir) && legal.includes(dir)) {
      return { direction: dir, strategy: 'to_tail', pathLength: pathToTail.length };
    }
  }

  // C. Fallback: Max Space
  return getMaxSpaceMove(state, legal);
}

function getMaxSpaceMove(state: SnakeState, legal: Direction[]): AIMove {
  const food = state.food;
  let bestDir: Direction = legal[0];
  let bestScore = -1;
  for (const d of legal) {
    const nextSnake = simulateNextSnake(state, d);
    const blocked = Array.from({ length: state.height }, () => Array.from({ length: state.width }, () => false));
    for (let i = 0; i < nextSnake.length; i++) {
      const p = nextSnake[i];
      blocked[p.y][p.x] = true;
    }
    const nh = nextSnake[0];
    blocked[nh.y][nh.x] = false;
    const space = floodFillCount(nh, state.width, state.height, blocked);
    const manhattan = Math.abs(nh.x - food.x) + Math.abs(nh.y - food.y);
    const score = space * 1000 - manhattan;
    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }
  return { direction: bestDir, strategy: 'max_space' };
}

// Cache the cycle to avoid regeneration if grid size hasn't changed
let cachedCycle: HamiltonianCycle | null = null;

function getHamiltonianMove(state: SnakeState, legal: Direction[]): AIMove {
  if (!cachedCycle || cachedCycle.width !== state.width || cachedCycle.height !== state.height) {
    cachedCycle = new HamiltonianCycle(state.width, state.height);
  }
  const cycle = cachedCycle;

  const head = state.snake[0];
  const tail = state.snake[state.snake.length - 1];
  const food = state.food;
  
  const headIdx = cycle.getCycleIndex(head);
  const tailIdx = cycle.getCycleIndex(tail);
  const foodIdx = cycle.getCycleIndex(food);

  // Calculate standard next move on cycle
  const nextIdxOnCycle = (headIdx + 1) % cycle.cycleLength;
  const nextPosOnCycle = cycle.cycle[nextIdxOnCycle];
  
  // Find direction for standard move
  let bestDir: Direction | null = null;
  for (const d of legal) {
    const p = movePoint(head, d);
    if (samePoint(p, nextPosOnCycle)) {
      bestDir = d;
      break;
    }
  }
  
  // If standard move is somehow illegal, fallback to Safe Strategy.
  // On odd x odd boards the generated cycle has one non-adjacent edge, so the
  // snake reaches this branch when it crosses that break.
  if (!bestDir) {
      return getSafeMove(state, legal);
  }

  // Shortcut Logic:
  // Try to find a neighbor that is closer to food on the cycle BUT safe
  let bestDist = cycle.dist(headIdx, foodIdx);
  
  // The available space on the cycle from Head to Tail
  const cycleSpace = cycle.dist(headIdx, tailIdx);
  const snakeLen = state.snake.length;

  for (const d of legal) {
    const neighbor = movePoint(head, d);
    const nIdx = cycle.getCycleIndex(neighbor);
    
    // Skip if neighbor is not the standard next move (we already have that as baseline)
    if (nIdx === nextIdxOnCycle) continue;
    
    // Calculate distance from neighbor to food
    const distToFood = cycle.dist(nIdx, foodIdx);
    
    // Calculate how far we are jumping forward from Head
    const jumpDist = cycle.dist(headIdx, nIdx);
    
    // Safety Checks:
    // 1. Must be closer to food (Optimization)
    // 2. Must NOT jump backwards into the body (Wrap-around check)
    //    We ensure the jump lands strictly within the "empty" space (Head -> Tail).
    //    i.e., jumpDist < cycleSpace.
    // 3. Must leave enough space after the jump to reach the tail (Safety buffer)
    //    remainingSpace = cycleSpace - jumpDist.
    //    remainingSpace > snakeLen + buffer.
    
    if (distToFood < bestDist) {
        if (jumpDist < cycleSpace) {
            const remainingSpace = cycleSpace - jumpDist;
             // Buffer of 4 is usually safe enough to react
            if (remainingSpace > snakeLen + 4) {
                bestDist = distToFood;
                bestDir = d;
            }
        }
    }
  }

  return { direction: bestDir, strategy: 'hamiltonian' };
}

function getCustomMove(state: SnakeState, legal: Direction[], script?: string): AIMove {
  if (!script) return { direction: legal[0], strategy: 'fallback' };
  
  const result = CustomScriptExecutor.execute(script, {
    state,
    utils: {
      movePoint,
      samePoint,
      isOpposite,
      Direction: DirectionValues,
    }
  });

  if (result && legal.includes(result)) {
    return { direction: result, strategy: 'custom' };
  }
  
  // If script fails or returns illegal move, fallback to safe
  return getSafeMove(state, legal);
}

export function getAIMove(state: SnakeState, strategy: AIStrategy = 'safe', customScript?: string): AIMove {
  const legal = validNextDirections(state);
  if (legal.length === 0) return { direction: state.direction, strategy: 'fallback' };

  if (strategy === 'greedy') {
    return getGreedyMove(state, legal);
  }
  if (strategy === 'strong') {
    return getStrongMove(state, legal);
  }
  if (strategy === 'hamiltonian') {
    return getHamiltonianMove(state, legal);
  }
  if (strategy === 'custom') {
    return getCustomMove(state, legal, customScript);
  }
  // Default to safe
  return getSafeMove(state, legal);
}
