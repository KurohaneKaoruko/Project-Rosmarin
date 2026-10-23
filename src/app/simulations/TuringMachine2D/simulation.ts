// 二维图灵机引擎（2D Turing Machine / Turmite）
// 有限状态机 + 二维无限网格；每步：读格 -> 按规则(写符号, 上下左右移动, 新状态) -> 移动一格。
// 网格用稀疏 Map 实现，理论无界：爬虫走到哪里，网格就延伸到哪里。
// 预设均为 2D Turing Machine（Turmite），与兰顿蚂蚁（另一页面已有）无关。

export type TM2DRule = {
  write: number; // 写入符号索引
  move: 0 | 1 | 2 | 3; // 移动方向：0=上 1=右 2=下 3=左
  next: number; // 下一状态索引，-1 = 停机
};

export type TM2DDef = {
  id: string;
  name: string;
  nStates: number;
  nSymbols: number;
  rules: TM2DRule[][]; // rules[state][symbol]
  initialState?: number; // 默认 0
  note: string;
};

export type TM2DStats = {
  steps: number;
  x: number;
  y: number;
  state: number;
  halted: boolean;
  covered: number; // 非空白格数
  /** 网格包围盒（目前到过的范围） */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

// 坐标 -> Map 键：x/y 各偏移 2^20，键 = (x+OFF)*2^22 + (y+OFF)，可覆盖 ±100 万格
const OFF = 1 << 20;
const SCALE = 1 << 22;
const keyOf = (x: number, y: number) => (x + OFF) * SCALE + (y + OFF);

export class TM2DSim {
  readonly def: TM2DDef;
  private grid = new Map<number, number>();
  private x = 0;
  private y = 0;
  private state: number;
  private stepCount = 0;
  private halted = false;
  private covered = 0;
  private minX = 0;
  private maxX = 0;
  private minY = 0;
  private maxY = 0;

  private running = false;
  private timer = 0;
  private stepsPerSecond = 60;
  private onFrame: ((s: TM2DStats) => void) | null = null;

  constructor(def: TM2DDef) {
    this.def = def;
    this.state = def.initialState ?? 0;
  }

  setOnFrame(cb: ((s: TM2DStats) => void) | null) {
    this.onFrame = cb;
  }

  setStepsPerSecond(n: number) {
    this.stepsPerSecond = Math.max(1, Math.min(100000, n));
    if (this.running) {
      this.stopTimer();
      this.startTimer();
    }
  }

  private emit() {
    this.onFrame?.(this.getStats());
  }

  getStats(): TM2DStats {
    return {
      steps: this.stepCount,
      x: this.x,
      y: this.y,
      state: this.state,
      halted: this.halted,
      covered: this.covered,
      minX: this.minX,
      maxX: this.maxX,
      minY: this.minY,
      maxY: this.maxY,
    };
  }

  /** 读取格子符号（越界 = 空白 0，网格无界） */
  cell(cx: number, cy: number): number {
    return this.grid.get(keyOf(cx, cy)) ?? 0;
  }

  /** 已探索包围盒（供渲染裁剪遍历范围） */
  get bounds() {
    return { minX: this.minX, maxX: this.maxX, minY: this.minY, maxY: this.maxY };
  }

  /** 手动改格子 */
  paint(cx: number, cy: number, sym: number) {
    const k = keyOf(cx, cy);
    const prev = this.grid.get(k) ?? 0;
    if (prev !== sym) {
      if (sym === 0) {
        this.grid.delete(k);
        this.covered -= 1;
      } else {
        this.grid.set(k, sym);
        if (prev === 0) this.covered += 1;
      }
      this.track(cx, cy);
    }
  }

  private track(x: number, y: number) {
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  reset() {
    this.grid.clear();
    this.x = 0;
    this.y = 0;
    this.state = this.def.initialState ?? 0;
    this.stepCount = 0;
    this.halted = false;
    this.covered = 0;
    this.minX = 0;
    this.maxX = 0;
    this.minY = 0;
    this.maxY = 0;
    this.emit();
  }

  step(): boolean {
    if (this.halted) return false;
    const k = keyOf(this.x, this.y);
    const sym = this.grid.get(k) ?? 0;
    const rule = this.def.rules[this.state]?.[sym];
    if (!rule) {
      this.halted = true;
      this.emit();
      return false;
    }
    if (rule.write === 0) {
      if (sym !== 0) {
        this.grid.delete(k);
        this.covered -= 1;
      }
    } else {
      this.grid.set(k, rule.write);
      if (sym === 0) this.covered += 1;
    }
    this.track(this.x, this.y);

    if (rule.move === 0) this.y -= 1;
    else if (rule.move === 1) this.x += 1;
    else if (rule.move === 2) this.y += 1;
    else this.x -= 1;
    this.track(this.x, this.y);

    if (rule.next === -1 || rule.next >= this.def.nStates) {
      this.state = -1;
      this.halted = true;
    } else {
      this.state = rule.next;
    }

    this.stepCount += 1;
    if (this.stepCount % 10 === 0 || this.halted) this.emit();
    return true;
  }

  run(n: number): boolean {
    for (let i = 0; i < n; i++) {
      if (!this.step()) return false;
    }
    return true;
  }

  start() {
    if (this.running || this.halted) return;
    this.running = true;
    this.startTimer();
  }

  private startTimer() {
    const tick = () => {
      if (!this.running) return;
      const n = Math.max(1, Math.floor(this.stepsPerSecond / 60));
      this.run(n);
      this.emit();
      if (this.halted) {
        this.running = false;
        return;
      }
      this.timer = window.setTimeout(tick, 1000 / 60);
    };
    this.timer = window.setTimeout(tick, 1000 / 60);
  }

  stop() {
    this.running = false;
    this.stopTimer();
  }

  private stopTimer() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = 0;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

// ============ 预设 ============
// 往 PRESETS_2D 数组添加新 TM2DDef 即可在页面下拉栏中出现。

/** 规则速记：write, move(0上1右2下3左), next */
const r = (write: number, move: 0 | 1 | 2 | 3, next: number): TM2DRule => ({ write, move, next });

// 相对转向记法: [write, turn, next]，turn: 1=右转 -1=左转 0=直行 2=掉头
// 相对转向表 -> 绝对方向引擎：组合状态 = 内部状态*4 + 朝向(0上1右2下3左)，move = (朝向+转向) mod 4
function fromRelative(rel: Array<Array<[number, number, number]>>): TM2DRule[][] {
  const rules: TM2DRule[][] = [];
  for (let inner = 0; inner < rel.length; inner++) {
    for (let dir = 0; dir < 4; dir++) {
      const row: TM2DRule[] = [];
      for (let sym = 0; sym < rel[inner].length; sym++) {
        const [write, turn, next] = rel[inner][sym];
        const move = ((dir + turn) % 4 + 4) % 4;
        row.push(r(write, move as 0 | 1 | 2 | 3, next * 4 + move));
      }
      rules.push(row);
    }
  }
  return rules;
}

/** 镜面对称编织者：2态2色。图案镜像对称、近似方形扩张，填充率恒定 50%（65536 台全枚举筛选） */
const mirrorWeaver: TM2DDef = {
  id: 'mirror-weaver',
  name: '镜面编织者 (2×2)',
  nStates: 8,
  nSymbols: 2,
  rules: fromRelative([
    // state0: 读0 -> 写1右转留本态; 读1 -> 写0左转进1
    [[1, 1, 0], [0, -1, 1]],
    // state1: 读0 -> 写1右转留本态; 读1 -> 写0右转回0
    [[1, 1, 0], [0, 1, 0]],
  ]),
  note: '2 状态 2 符号。织出镜面对称的花纹，近似方形匀速外扩，填充率稳定在 50%。由全空间 65536 台 2×2 机器枚举筛选（对称度 0.99）。',
};

/** 方形织机 (2×2)：以对称方形扩张（枚举 101,110 | 020,010） */
const squareWeaver: TM2DDef = {
  id: 'square-weaver',
  name: '方形织机 (2×2)',
  nStates: 8,
  nSymbols: 2,
  rules: fromRelative([
    // state0: 读0 -> 写1直行进1; 读1 -> 写1右转留本态
    [[1, 0, 1], [1, 1, 0]],
    // state1: 读0 -> 写0掉头回0; 读1 -> 写0右转留本态
    [[0, 2, 0], [0, 1, 0]],
  ]),
  note: '2 状态 2 符号。以恒定 50% 密度织出不断扩大的正方形织物，边缘平整、左右完全对称（对称度 1.00）。',
};

/** 混沌高速公路 (2×2)：先混沌生长，随后甩出细长高速路 */
const chaosHighway: TM2DDef = {
  id: 'chaos-highway',
  name: '混沌甩尾 (2×2)',
  nStates: 8,
  nSymbols: 2,
  rules: fromRelative([
    [[1, 1, 0], [0, -1, 0]],
    [[1, 0, 0], [1, 2, 0]],
  ]),
  note: '2 状态 2 符号。中心区域混沌生长一段时间后，爬虫冲出并沿对角方向甩出细长的"高速公路"。',
};

/** 纹理生长者 (2×2)：Wikipedia Turmite 页顶图机器，混沌后转入规则纹理生长 */
const wikiChaos: TM2DDef = {
  id: 'wiki-chaos',
  name: '纹理生长者 (2×2)',
  nStates: 8,
  nSymbols: 2,
  rules: fromRelative([
    [[1, 1, 0], [1, 1, 1]],
    [[0, 0, 0], [0, 0, 1]],
  ]),
  note: 'Wikipedia Turmite 词条页顶图机器：8342 步前混沌、随后转入规则运动，织出特征纹理的定向生长带。',
};

export const PRESETS_2D: TM2DDef[] = [mirrorWeaver, squareWeaver, chaosHighway, wikiChaos];

/** 符号颜色（索引 0 = 空白底色，不会用于绘制） */
export const SYMBOL_COLORS = ['#18181b', '#0ea5e9', '#f59e0b', '#a78bfa'];
