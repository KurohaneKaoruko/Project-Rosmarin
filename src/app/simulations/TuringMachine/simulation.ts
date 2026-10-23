// 图灵机模拟引擎（忙碌海狸等预设）
// 任意符号字母表 + 有限状态机 + 一维无限纸带。

export type TMDirection = 'L' | 'R' | 'N';

export type TMRule = {
  write: string;
  move: TMDirection;
  /** 下一状态，'HALT' 表示停机 */
  next: string;
};

/** 图灵机定义。往 PRESETS 里加新预设即可在页面上被选中。 */
export type TMDef = {
  id: string;
  name: string;
  states: string[];
  /** 纸带符号全集（含空白符） */
  symbols: string[];
  blank: string;
  initialState: string;
  transition: Record<string, Record<string, TMRule | undefined>>;
  note: string;
  /** 忙碌海狸预设：理论 σ（停机时 1 的个数） */
  sigma?: number;
  /** 忙碌海狸预设：理论 S（停机步数） */
  steps?: number;
  /** 初始纸带内容（从索引 0 起，其余为空白） */
  input?: string;
};

export type TuringStats = {
  step: number;
  /** 纸带上非空白格个数（忙碌海狸语境 = 1 的个数） */
  ones: number;
  head: number;
  /** 磁头下当前符号 */
  headSymbol: string;
  state: string;
  halted: boolean;
  window: { start: number; cells: string[] };
};

/** 展示窗口宽度（格子数，奇数） */
const WINDOW = 61;

/** 时间演化图历史容量（环缓冲，超出后覆盖最旧的） */
const HIST_CAP = 65536;

export class TuringMachineSim {
  private def: TMDef;
  private tape = new Map<number, string>();
  private head = 0;
  private state: string;
  private stepCount = 0;
  private halted = false;
  private ones = 0;

  private running = false;
  private timer = 0;
  private stepsPerSecond = 8;
  private onFrame: ((stats: TuringStats) => void) | null = null;

  // 时间演化历史（环形缓冲）：记录 head 相对偏移、纸带快照（稀疏:相对索引->符号）、状态
  private histHead: number[] = [];
  private histTape: Array<Map<number, string>> = [];
  private histState: string[] = [];
  private histStart = 0;
  private histCount = 0;
  /** 纸带上出现过的最小/最大索引（用于演化图定界） */
  private tapeMin = 0;
  private tapeMax = 0;

  constructor(def: TMDef) {
    this.def = def;
    this.state = def.initialState;
    this.loadInput();
  }

  setDef(def: TMDef) {
    this.stop();
    this.def = def;
    this.resetAll();
  }

  private loadInput() {
    const input = this.def.input ?? '';
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch !== this.def.blank) this.tape.set(i, ch);
    }
    this.head = 0;
  }

  reset() {
    this.resetAll();
  }

  private resetAll() {
    this.tape.clear();
    this.head = 0;
    this.state = this.def.initialState;
    this.stepCount = 0;
    this.halted = false;
    this.ones = 0;
    this.histHead = [];
    this.histTape = [];
    this.histState = [];
    this.histStart = 0;
    this.histCount = 0;
    this.tapeMin = 0;
    this.tapeMax = 0;
    this.loadInput();
    this.recordHistory();
    this.emit();
  }

  /** 追加一条历史快照（环形缓冲） */
  private recordHistory() {
    const cap = HIST_CAP;
    if (this.histCount < cap) {
      this.histCount += 1;
    } else {
      this.histStart += 1;
    }
    const tapeSnap = new Map<number, string>();
    for (const [k, v] of this.tape) {
      if (v !== this.def.blank) tapeSnap.set(k, v);
    }
    const writeIdx =
      (this.histStart + this.histCount - 1) % cap;
    this.histHead[writeIdx] = this.head;
    this.histTape[writeIdx] = tapeSnap;
    this.histState[writeIdx] = this.state;
  }

  /**
   * 取时间演化历史：第 t 行为执行 t 步后的纸带。
   * 返回 [row, {lo, hi, tape, head, state}]，lo/hi 为该批行的公共索引范围。
   */
  getHistory(maxRows: number): {
    rows: Array<{ tape: Map<number, string>; head: number; state: string }>;
    lo: number;
    hi: number;
    total: number;
  } {
    const count = Math.min(this.histCount, maxRows);
    const rows: Array<{ tape: Map<number, string>; head: number; state: string }> = [];
    if (count <= 0) return { rows, lo: 0, hi: -1, total: this.histCount };
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < count; i++) {
      const src = (this.histStart + (this.histCount - count) + i) % HIST_CAP;
      const head = this.histHead[src];
      if (head < lo) lo = head;
      if (head > hi) hi = head;
      const t = this.histTape[src];
      for (const k of t.keys()) {
        if (k < lo) lo = k;
        if (k > hi) hi = k;
      }
      rows.push({ tape: t, head, state: this.histState[src] });
    }
    return { rows, lo, hi, total: this.histCount };
  }

  setStepsPerSecond(n: number) {
    this.stepsPerSecond = Math.max(1, Math.min(1_000_000, n));
    if (this.running) {
      this.stopTimer();
      this.startTimer();
    }
  }

  setOnFrame(cb: ((stats: TuringStats) => void) | null) {
    this.onFrame = cb;
  }

  /** 执行单步。返回是否实际执行（停机后为 false）。 */
  step(): boolean {
    if (this.halted) return false;
    const rule = this.def.transition[this.state];
    const symbol = this.tape.get(this.head) ?? this.def.blank;
    const t = rule?.[symbol];
    if (!t) {
      this.halted = true;
      this.emit();
      return false;
    }

    const prev = this.tape.get(this.head) ?? this.def.blank;
    this.tape.set(this.head, t.write);
    if (prev !== t.write) {
      if (t.write !== this.def.blank && prev === this.def.blank) this.ones += 1;
      else if (t.write === this.def.blank && prev !== this.def.blank) this.ones -= 1;
    }
    if (this.head < this.tapeMin) this.tapeMin = this.head;
    if (this.head > this.tapeMax) this.tapeMax = this.head;

    if (t.move === 'L') this.head -= 1;
    else if (t.move === 'R') this.head += 1;

    if (t.next === 'HALT' || !this.def.states.includes(t.next)) {
      this.state = 'HALT';
      this.halted = true;
    } else {
      this.state = t.next;
    }

    this.stepCount += 1;
    this.recordHistory();
    if (this.stepCount % 30 === 0 || this.halted) this.emit();
    return true;
  }

  /** 连续执行 n 步（不逐帧刷新）。返回是否全部执行完（未停机）。 */
  run(n: number): boolean {
    for (let i = 0; i < n; i++) {
      if (!this.step()) return false;
    }
    return true;
  }

  getStats(): TuringStats {
    const half = Math.floor(WINDOW / 2);
    const start = this.head - half;
    const cells: string[] = [];
    for (let i = start; i < start + WINDOW; i++) {
      cells.push(this.tape.get(i) ?? this.def.blank);
    }
    return {
      step: this.stepCount,
      ones: this.ones,
      head: this.head,
      headSymbol: this.tape.get(this.head) ?? this.def.blank,
      state: this.state,
      halted: this.halted,
      window: { start, cells },
    };
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

  private emit() {
    this.onFrame?.(this.getStats());
  }
}

// ============ 内置预设 ============
// 往 PRESETS 数组添加新 TMDef 即可在页面下拉栏中出现。

const rule = (write: string, move: TMDirection, next: string): TMRule => ({ write, move, next });

const bb1: TMDef = {
  id: 'bb1',
  name: '忙碌海狸 BB(1)',
  states: ['A'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'HALT'), 1: rule('1', 'R', 'HALT') },
  },
  note: '1 状态冠军：写 1 后直接停机。σ=1, S=1。',
  sigma: 1,
  steps: 1,
};

const bb2: TMDef = {
  id: 'bb2',
  name: '忙碌海狸 BB(2)',
  states: ['A', 'B'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('1', 'L', 'B') },
    B: { 0: rule('1', 'L', 'A'), 1: rule('1', 'R', 'HALT') },
  },
  note: '2 状态冠军：σ=4, S=6（Lin & Rado, 1965）。',
  sigma: 4,
  steps: 6,
};

const bb3: TMDef = {
  id: 'bb3',
  name: '忙碌海狸 BB(3)',
  states: ['A', 'B', 'C'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('1', 'R', 'HALT') },
    B: { 0: rule('0', 'R', 'C'), 1: rule('1', 'R', 'B') },
    C: { 0: rule('1', 'L', 'C'), 1: rule('1', 'L', 'A') },
  },
  note: '3 状态冠军：σ=6, S=14（Lin & Rado, 1965）。',
  sigma: 6,
  steps: 14,
};

const bb4: TMDef = {
  id: 'bb4',
  name: '忙碌海狸 BB(4)',
  states: ['A', 'B', 'C', 'D'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('1', 'L', 'B') },
    B: { 0: rule('1', 'L', 'A'), 1: rule('0', 'L', 'C') },
    C: { 0: rule('1', 'R', 'HALT'), 1: rule('1', 'L', 'D') },
    D: { 0: rule('1', 'R', 'D'), 1: rule('0', 'R', 'A') },
  },
  note: '4 状态冠军：σ=13, S=107（Brady, 1983）。',
  sigma: 13,
  steps: 107,
};

const bb5: TMDef = {
  id: 'bb5',
  name: '忙碌海狸 BB(5)',
  states: ['A', 'B', 'C', 'D', 'E'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('1', 'L', 'C') },
    B: { 0: rule('1', 'R', 'C'), 1: rule('1', 'R', 'B') },
    C: { 0: rule('1', 'R', 'D'), 1: rule('0', 'L', 'E') },
    D: { 0: rule('1', 'L', 'A'), 1: rule('1', 'L', 'D') },
    E: { 0: rule('1', 'R', 'HALT'), 1: rule('0', 'L', 'A') },
  },
  note: '5 状态冠军：σ=4098, S=47,176,870（Marxen & Buntrock, 1990）。100k 步/秒约需 8 分钟。',
  sigma: 4098,
  steps: 47_176_870,
};

/**
 * 六状态机器（均为 BusyBeaverWiki / BB Challenge 上已发表的机器，标准 bbch 记法）
 * 记法：1RB = 写 1、右移、进入 B；0LC = 写 0、左移、进入 C；Z / --- = 停机。
 */

/** 反九头蛇 Antihydra：1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA (mxdys 2024 / Racheline) */
const antihydra: TMDef = {
  id: 'antihydra',
  name: 'Antihydra',
  states: ['A', 'B', 'C', 'D', 'E', 'F'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('1', 'R', 'A') },
    B: { 0: rule('0', 'L', 'C'), 1: rule('1', 'L', 'E') },
    C: { 0: rule('1', 'L', 'D'), 1: rule('1', 'L', 'C') },
    D: { 0: rule('1', 'L', 'A'), 1: rule('0', 'L', 'B') },
    E: { 0: rule('1', 'L', 'F'), 1: rule('1', 'R', 'E') },
    F: { 0: rule('0', 'N', 'HALT'), 1: rule('0', 'R', 'A') },
  },
  note: '2024-06 由 mxdys 发现的 BB(6) 密机 (Cryptid)。它是否停机等价于一个 Collatz 型猜想，至今未被证明，大概率永不停机。纸带上会呈现类似随机游走的涂抹痕迹。',
};

/** BB(6) 目前最长运行记录：1RB1RA_1RC1RZ_1LD0RF_1RA0LE_0LD1RC_1RA0RE (mxdys 2025) */
const bb6: TMDef = {
  id: 'bb6',
  name: '忙碌海狸挑战赛 2025',
  states: ['A', 'B', 'C', 'D', 'E', 'F'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('1', 'R', 'A') },
    B: { 0: rule('1', 'R', 'C'), 1: rule('1', 'R', 'HALT') },
    C: { 0: rule('1', 'L', 'D'), 1: rule('0', 'R', 'F') },
    D: { 0: rule('1', 'R', 'A'), 1: rule('0', 'L', 'E') },
    E: { 0: rule('0', 'L', 'D'), 1: rule('1', 'R', 'C') },
    F: { 0: rule('1', 'R', 'A'), 1: rule('0', 'R', 'E') },
  },
  note: 'mxdys 于 2025-06 发现，给出 S(6) > Σ(6) > 10↑↑10↑↑10↑↑8 的下界。运行时间远超宇宙原子数，实际观测中不会停机。',
};

/** Kropitz 2010 年的 6 状态机器：1RB1LE_1RC1RF_1LD0RB_1RE0LC_1LA0RD_1RZ1RC */
const bb6kropitz: TMDef = {
  id: 'bb6-kropitz',
  name: '忙碌海狸挑战赛 2010',
  states: ['A', 'B', 'C', 'D', 'E', 'F'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('1', 'L', 'E') },
    B: { 0: rule('1', 'R', 'C'), 1: rule('1', 'R', 'F') },
    C: { 0: rule('1', 'L', 'D'), 1: rule('0', 'R', 'B') },
    D: { 0: rule('1', 'R', 'E'), 1: rule('0', 'L', 'C') },
    E: { 0: rule('1', 'L', 'A'), 1: rule('0', 'R', 'D') },
    F: { 0: rule('1', 'R', 'HALT'), 1: rule('1', 'R', 'C') },
  },
  note: 'Kropitz (2010) 发现的 6 状态机器：σ > 3.5×10¹⁸²⁶⁷，S > 7.4×10³⁶⁵³⁴。它把问题归约为 Collatz 型映射，因此属于“难以判定”的机器。',
};

/** Space Needle：1RB1LA_1LC0RE_1LF1LD_0RB0LA_1RC1RE_---0LD (mxdys 2025) */
const spaceNeedle: TMDef = {
  id: 'space-needle',
  name: 'Space Needle',
  states: ['A', 'B', 'C', 'D', 'E', 'F'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('1', 'L', 'A') },
    B: { 0: rule('1', 'L', 'C'), 1: rule('0', 'R', 'E') },
    C: { 0: rule('1', 'L', 'F'), 1: rule('1', 'L', 'D') },
    D: { 0: rule('0', 'R', 'B'), 1: rule('0', 'L', 'A') },
    E: { 0: rule('1', 'R', 'C'), 1: rule('1', 'R', 'E') },
    F: { 0: rule('0', 'N', 'HALT'), 1: rule('0', 'L', 'D') },
  },
  note: 'BB(6) 密机之一（mxdys, 2025-01）：停机与否同样归结为 Collatz 型难题，概率上被认为永不停机。',
};

/** Lucy's Moonlight：1RB0RD_0RC1RE_1RD0LA_1LE1LC_1RF0LD_---0RA (Racheline 2025) */
const lucysMoonlight: TMDef = {
  id: 'lucys-moonlight',
  name: "Lucy's Moonlight",
  states: ['A', 'B', 'C', 'D', 'E', 'F'],
  symbols: ['0', '1'],
  blank: '0',
  initialState: 'A',
  transition: {
    A: { 0: rule('1', 'R', 'B'), 1: rule('0', 'R', 'D') },
    B: { 0: rule('0', 'R', 'C'), 1: rule('1', 'R', 'E') },
    C: { 0: rule('1', 'R', 'D'), 1: rule('0', 'L', 'A') },
    D: { 0: rule('1', 'L', 'E'), 1: rule('1', 'L', 'C') },
    E: { 0: rule('1', 'R', 'F'), 1: rule('0', 'L', 'D') },
    F: { 0: rule('0', 'N', 'HALT'), 1: rule('0', 'R', 'A') },
  },
  note: '2025-03 由 Racheline 发现的密机，与 Antihydra 同族但停机条件相反：概率上倾向于“会停机”，但同样未被证明。',
};

export const PRESETS: TMDef[] = [
  bb1,
  bb2,
  bb3,
  bb4,
  bb5,
  antihydra,
  bb6,
  bb6kropitz,
  spaceNeedle,
  lucysMoonlight,
];
