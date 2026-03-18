export type AntColorTheme = 'dark' | 'light';
export type AntMode = 'classic' | 'fullColor';

type Ant = {
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3;
  color: string;
};

export type LangtonsAntConfig = {
  cellSizePx: number;
  ants: number;
  stepsPerSecond: number;
  wrap: boolean;
  syncUpdate: boolean;
  theme: AntColorTheme;
  density: number;
  mode: AntMode;
  resolutionScale: number;
  colorStep: number;
  colorStepMin: number;
  colorStepMax: number;
  colorStepNoZero: boolean;
  trace: boolean;
};

export class LangtonsAntSim {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  private width = 1;
  private height = 1;
  private cols = 1;
  private rows = 1;
  private cellSizePx = 6;
  private displayCellW = 6;
  private displayCellH = 6;

  private grid = new Uint8Array(1);
  private ants: Ant[] = [];
  private stepCount = 0;

  private bg = '#18181B';
  private fg = '#F4F4F5';
  private antColors = ['#EF4444', '#22C55E', '#3B82F6', '#EAB308', '#06B6D4', '#D946EF'];

  private running = false;
  private raf = 0;
  private lastTime = 0;
  private accSteps = 0;
  private stepsPerSecond = 600;
  private wrap = true;
  private syncUpdate = false;
  private mode: AntMode = 'classic';
  private resolutionScale = 1;
  private trace = false;

  private toggleMask = new Uint8Array(1);
  private touched = new Int32Array(1);
  private nextX = new Int32Array(1);
  private nextY = new Int32Array(1);
  private nextDir = new Uint8Array(1);

  private colorGrid = new Uint8Array(0);
  private colorImage: ImageData | null = null;
  private colorData: Uint8ClampedArray | null = null;
  private colorBase = 1;
  private colorStep = 1;
  private colorStepMin = 1;
  private colorStepMax = 8;
  private colorStepNoZero = true;
  private ruleSeed = Math.floor(Math.random() * 2 ** 32) >>> 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d', { alpha: false });
    if (!offCtx) throw new Error('Failed to get offscreen 2D context');
    this.offscreen = off;
    this.offscreenCtx = offCtx;
    this.offscreenCtx.imageSmoothingEnabled = false;
  }

  getStats() {
    return {
      steps: this.stepCount,
      ants: this.ants.length,
      cols: this.cols,
      rows: this.rows,
      mode: this.mode,
      scale: this.resolutionScale,
    };
  }

  setConfig(next: Partial<LangtonsAntConfig>) {
    if (typeof next.stepsPerSecond === 'number') this.stepsPerSecond = Math.max(1, Math.floor(next.stepsPerSecond));
    if (typeof next.wrap === 'boolean') this.wrap = next.wrap;
    if (typeof next.syncUpdate === 'boolean') this.syncUpdate = next.syncUpdate;
    if (next.theme) this.setTheme(next.theme);
    if (typeof next.ants === 'number') this.setAntCount(next.ants);
    let needsResize = false;
    let needsRender = false;
    if (next.mode && next.mode !== this.mode) {
      this.mode = next.mode;
      if (this.mode === 'fullColor') this.resetColorRules();
      needsResize = true;
    }
    if (typeof next.resolutionScale === 'number') {
      this.resolutionScale = Math.max(1, Math.floor(next.resolutionScale));
      needsResize = true;
    }
    if (typeof next.colorStep === 'number') this.colorStep = Math.max(0, Math.floor(next.colorStep));
    if (typeof next.colorStepMin === 'number') this.colorStepMin = Math.max(0, Math.floor(next.colorStepMin));
    if (typeof next.colorStepMax === 'number') this.colorStepMax = Math.max(1, Math.floor(next.colorStepMax));
    if (typeof next.colorStepNoZero === 'boolean') this.colorStepNoZero = next.colorStepNoZero;
    if (typeof next.trace === 'boolean') {
      this.trace = next.trace;
      needsRender = true;
    }
    if (needsResize) this.resize(this.width, this.height, this.cellSizePx);
    else if (needsRender) this.render();
  }

  resize(width: number, height: number, cellSizePx: number) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.cellSizePx = Math.max(1, Math.floor(cellSizePx));

    const baseCols = Math.max(1, Math.floor(this.width / this.cellSizePx));
    const baseRows = Math.max(1, Math.floor(this.height / this.cellSizePx));
    const scale = Math.max(1, Math.floor(this.resolutionScale));
    this.cols = Math.max(1, Math.floor(baseCols * scale));
    this.rows = Math.max(1, Math.floor(baseRows * scale));
    this.displayCellW = this.width / this.cols;
    this.displayCellH = this.height / this.rows;

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx.imageSmoothingEnabled = false;

    this.offscreen.width = this.cols;
    this.offscreen.height = this.rows;
    this.offscreenCtx.imageSmoothingEnabled = false;

    const cellCount = this.cols * this.rows;
    if (this.mode === 'fullColor') {
      this.colorGrid = new Uint8Array(cellCount * 3);
      this.colorImage = this.offscreenCtx.createImageData(this.cols, this.rows);
      this.colorData = this.colorImage.data;
      this.fillColorBase();
    } else {
      this.grid = new Uint8Array(cellCount);
      this.toggleMask = new Uint8Array(this.grid.length);
    }
    this.stepCount = 0;
    this.resetAnts(this.ants.length || 1);
    if (this.mode === 'fullColor') this.syncColorImage();
    else this.redrawOffscreen();
    this.render();
  }

  setTheme(theme: AntColorTheme) {
    if (theme === 'light') {
      this.bg = '#FFFFFF';
      this.fg = '#0A0A0A';
    } else {
      this.bg = '#18181B';
      this.fg = '#F4F4F5';
    }
    if (this.mode !== 'fullColor') this.redrawOffscreen();
    this.render();
  }

  setAntCount(count: number) {
    const next = Math.max(1, Math.min(32, Math.floor(count)));
    this.resetAnts(next);
    this.render();
  }

  randomize(density: number) {
    const d = Math.min(1, Math.max(0, density));
    if (this.mode === 'fullColor') {
      this.randomizeColor(d);
      this.stepCount = 0;
      this.render();
      return;
    }
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = Math.random() < d ? 1 : 0;
    }
    this.stepCount = 0;
    this.redrawOffscreen();
    this.render();
  }

  clear() {
    if (this.mode === 'fullColor') {
      this.fillColorBase();
      this.stepCount = 0;
      this.render();
      return;
    }
    this.grid.fill(0);
    this.stepCount = 0;
    this.redrawOffscreen();
    this.render();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accSteps = 0;
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  step(generations: number) {
    const g = Math.max(1, Math.floor(generations));
    for (let i = 0; i < g; i++) this.stepOneGeneration();
    this.render();
  }

  toggleCellAt(px: number, py: number) {
    const cell = this.pixelToCell(px, py);
    if (!cell) return;
    const { x, y } = cell;
    if (this.mode === 'fullColor') {
      this.toggleColorCell(x, y);
      this.render();
      return;
    }
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    const idx = y * this.cols + x;
    this.grid[idx] = this.grid[idx] ? 0 : 1;
    this.offscreenCtx.fillStyle = this.grid[idx] ? this.fg : this.bg;
    this.offscreenCtx.fillRect(x, y, 1, 1);
    this.render();
  }

  regenerateColorRules(seed?: number) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      this.ruleSeed = seed >>> 0;
    } else {
      this.ruleSeed = Math.floor(Math.random() * 2 ** 32) >>> 0;
    }
  }

  getCellKeyAt(px: number, py: number) {
    const cell = this.pixelToCell(px, py);
    if (!cell) return null;
    return `${cell.x}:${cell.y}`;
  }

  private pixelToCell(px: number, py: number) {
    const x = Math.floor(px / this.displayCellW);
    const y = Math.floor(py / this.displayCellH);
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return null;
    return { x, y };
  }

  private resetAnts(count: number) {
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows / 2);
    const ants: Ant[] = [];
    for (let i = 0; i < count; i++) {
      const dx = (i % 8) - 3;
      const dy = Math.floor(i / 8) - 1;
      const color = this.antColors[i % this.antColors.length];
      const dir = (i % 4) as 0 | 1 | 2 | 3;
      ants.push({ x: (cx + dx + this.cols) % this.cols, y: (cy + dy + this.rows) % this.rows, dir, color });
    }
    this.ants = ants;
    this.ensureScratch();
  }

  private stepOneGeneration() {
    if (this.mode === 'fullColor') {
      this.stepOneGenerationColorSequential();
      return;
    }
    if (this.syncUpdate) {
      this.stepOneGenerationSync();
    } else {
      this.stepOneGenerationSequential();
    }
  }

  private stepOneGenerationSequential() {
    const w = this.cols;
    const h = this.rows;

    for (let a = 0; a < this.ants.length; a++) {
      const ant = this.ants[a];
      const idx = ant.y * w + ant.x;
      const cell = this.grid[idx];

      if (cell === 0) ant.dir = (((ant.dir + 1) & 3) as 0 | 1 | 2 | 3);
      else ant.dir = (((ant.dir + 3) & 3) as 0 | 1 | 2 | 3);

      this.grid[idx] = cell ? 0 : 1;
      this.offscreenCtx.fillStyle = this.grid[idx] ? this.fg : this.bg;
      this.offscreenCtx.fillRect(ant.x, ant.y, 1, 1);

      if (ant.dir === 0) ant.y -= 1;
      else if (ant.dir === 1) ant.x += 1;
      else if (ant.dir === 2) ant.y += 1;
      else ant.x -= 1;

      if (this.wrap) {
        ant.x = (ant.x + w) % w;
        ant.y = (ant.y + h) % h;
      } else {
        if (ant.x < 0) {
          ant.x = 0;
          ant.dir = 1;
        } else if (ant.x >= w) {
          ant.x = w - 1;
          ant.dir = 3;
        }
        if (ant.y < 0) {
          ant.y = 0;
          ant.dir = 2;
        } else if (ant.y >= h) {
          ant.y = h - 1;
          ant.dir = 0;
        }
      }
    }

    this.stepCount += 1;
  }

  private stepOneGenerationSync() {
    const w = this.cols;
    const h = this.rows;
    const oldGrid = this.grid;

    const n = this.ants.length;
    this.ensureScratch();

    let touchedCount = 0;

    for (let a = 0; a < n; a++) {
      const ant = this.ants[a];
      const idx = ant.y * w + ant.x;
      const cell = oldGrid[idx];

      let dir = ant.dir;
      if (cell === 0) dir = (((dir + 1) & 3) as 0 | 1 | 2 | 3);
      else dir = (((dir + 3) & 3) as 0 | 1 | 2 | 3);

      this.nextDir[a] = dir;

      if (this.toggleMask[idx] === 0) this.touched[touchedCount++] = idx;
      this.toggleMask[idx] ^= 1;

      let nx = ant.x;
      let ny = ant.y;
      if (dir === 0) ny -= 1;
      else if (dir === 1) nx += 1;
      else if (dir === 2) ny += 1;
      else nx -= 1;

      if (this.wrap) {
        nx = (nx + w) % w;
        ny = (ny + h) % h;
      } else {
        if (nx < 0) {
          nx = 0;
          dir = 1;
        } else if (nx >= w) {
          nx = w - 1;
          dir = 3;
        }
        if (ny < 0) {
          ny = 0;
          dir = 2;
        } else if (ny >= h) {
          ny = h - 1;
          dir = 0;
        }
        this.nextDir[a] = dir;
      }

      this.nextX[a] = nx;
      this.nextY[a] = ny;
    }

    for (let i = 0; i < touchedCount; i++) {
      const idx = this.touched[i];
      if (this.toggleMask[idx] === 1) {
        oldGrid[idx] ^= 1;
        this.offscreenCtx.fillStyle = oldGrid[idx] ? this.fg : this.bg;
        const x = idx % w;
        const y = Math.floor(idx / w);
        this.offscreenCtx.fillRect(x, y, 1, 1);
      }
      this.toggleMask[idx] = 0;
    }

    for (let a = 0; a < n; a++) {
      const ant = this.ants[a];
      ant.x = this.nextX[a];
      ant.y = this.nextY[a];
      ant.dir = (this.nextDir[a] as 0 | 1 | 2 | 3);
    }

    this.stepCount += 1;
  }

  private ensureScratch() {
    const n = Math.max(1, this.ants.length);
    if (this.touched.length !== n) this.touched = new Int32Array(n);
    if (this.nextX.length !== n) this.nextX = new Int32Array(n);
    if (this.nextY.length !== n) this.nextY = new Int32Array(n);
    if (this.nextDir.length !== n) this.nextDir = new Uint8Array(n);
  }

  private resetColorRules() {
    this.ruleSeed = Math.floor(Math.random() * 2 ** 32) >>> 0;
  }

  private hashColor(r: number, g: number, b: number) {
    let x = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    x ^= this.ruleSeed;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  private getColorRule(r: number, g: number, b: number) {
    const h = this.hashColor(r, g, b);
    const turn = (h & 1) === 0 ? 1 : 3; // right (1) or left (3)
    const channel = (h >>> 1) % 3;
    let step = this.colorStep;
    if (this.colorStep === 0) {
      const min = this.colorStepMin;
      const range = Math.max(1, this.colorStepMax - min);
      step = min + ((h >>> 3) % range);
      if (this.colorStepNoZero && step === 0) step = min > 0 ? min : 1;
    }
    return { turn, channel, step };
  }

  private stepOneGenerationColorSequential() {
    if (!this.colorData) return;
    const w = this.cols;
    const h = this.rows;

    for (let a = 0; a < this.ants.length; a++) {
      const ant = this.ants[a];
      const cellIndex = ant.y * w + ant.x;
      const gIdx = cellIndex * 3;
      const r = this.colorGrid[gIdx];
      const g = this.colorGrid[gIdx + 1];
      const b = this.colorGrid[gIdx + 2];
      const rule = this.getColorRule(r, g, b);

      ant.dir = (((ant.dir + rule.turn) & 3) as 0 | 1 | 2 | 3);

      const channelIndex = gIdx + rule.channel;
      this.colorGrid[channelIndex] = (this.colorGrid[channelIndex] + rule.step) & 255;

      this.writeColorPixel(cellIndex);

      if (ant.dir === 0) ant.y -= 1;
      else if (ant.dir === 1) ant.x += 1;
      else if (ant.dir === 2) ant.y += 1;
      else ant.x -= 1;

      if (this.wrap) {
        ant.x = (ant.x + w) % w;
        ant.y = (ant.y + h) % h;
      } else {
        if (ant.x < 0) {
          ant.x = 0;
          ant.dir = 1;
        } else if (ant.x >= w) {
          ant.x = w - 1;
          ant.dir = 3;
        }
        if (ant.y < 0) {
          ant.y = 0;
          ant.dir = 2;
        } else if (ant.y >= h) {
          ant.y = h - 1;
          ant.dir = 0;
        }
      }
    }

    this.stepCount += 1;
  }

  private fillColorBase() {
    const base = this.colorBase & 255;
    this.colorGrid.fill(base);
    if (!this.colorData) return;
    const cellCount = this.cols * this.rows;
    for (let i = 0, p = 0; i < cellCount; i++, p += 4) {
      this.colorData[p] = base;
      this.colorData[p + 1] = base;
      this.colorData[p + 2] = base;
      this.colorData[p + 3] = 255;
    }
  }

  private syncColorImage() {
    if (!this.colorData) return;
    const cellCount = this.cols * this.rows;
    for (let i = 0, p = 0, g = 0; i < cellCount; i++, p += 4, g += 3) {
      this.colorData[p] = this.colorGrid[g];
      this.colorData[p + 1] = this.colorGrid[g + 1];
      this.colorData[p + 2] = this.colorGrid[g + 2];
      this.colorData[p + 3] = 255;
    }
  }

  private randomizeColor(density: number) {
    if (!this.colorData) return;
    const base = this.colorBase & 255;
    const cellCount = this.cols * this.rows;
    for (let i = 0, p = 0, g = 0; i < cellCount; i++, p += 4, g += 3) {
      if (Math.random() < density) {
        const r = Math.floor(Math.random() * 256);
        const gg = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        this.colorGrid[g] = r;
        this.colorGrid[g + 1] = gg;
        this.colorGrid[g + 2] = b;
        this.colorData[p] = r;
        this.colorData[p + 1] = gg;
        this.colorData[p + 2] = b;
        this.colorData[p + 3] = 255;
      } else {
        this.colorGrid[g] = base;
        this.colorGrid[g + 1] = base;
        this.colorGrid[g + 2] = base;
        this.colorData[p] = base;
        this.colorData[p + 1] = base;
        this.colorData[p + 2] = base;
        this.colorData[p + 3] = 255;
      }
    }
  }

  private toggleColorCell(x: number, y: number) {
    if (!this.colorData) return;
    const base = this.colorBase & 255;
    const idx = y * this.cols + x;
    const g = idx * 3;
    const p = idx * 4;
    const isBase = this.colorGrid[g] === base && this.colorGrid[g + 1] === base && this.colorGrid[g + 2] === base;
    if (isBase) {
      const r = Math.floor(Math.random() * 256);
      const gg = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      this.colorGrid[g] = r;
      this.colorGrid[g + 1] = gg;
      this.colorGrid[g + 2] = b;
      this.colorData[p] = r;
      this.colorData[p + 1] = gg;
      this.colorData[p + 2] = b;
      this.colorData[p + 3] = 255;
    } else {
      this.colorGrid[g] = base;
      this.colorGrid[g + 1] = base;
      this.colorGrid[g + 2] = base;
      this.colorData[p] = base;
      this.colorData[p + 1] = base;
      this.colorData[p + 2] = base;
      this.colorData[p + 3] = 255;
    }
  }

  private writeColorPixel(cellIndex: number) {
    if (!this.colorData) return;
    const g = cellIndex * 3;
    const p = cellIndex * 4;
    this.colorData[p] = this.colorGrid[g];
    this.colorData[p + 1] = this.colorGrid[g + 1];
    this.colorData[p + 2] = this.colorGrid[g + 2];
    this.colorData[p + 3] = 255;
  }

  private redrawOffscreen() {
    this.offscreenCtx.fillStyle = this.bg;
    this.offscreenCtx.fillRect(0, 0, this.cols, this.rows);
    this.offscreenCtx.fillStyle = this.fg;
    for (let i = 0; i < this.grid.length; i++) {
      if (!this.grid[i]) continue;
      const x = i % this.cols;
      const y = Math.floor(i / this.cols);
      this.offscreenCtx.fillRect(x, y, 1, 1);
    }
  }

  private render() {
    this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(0, 0, this.width, this.height);

    if (this.mode === 'fullColor' && this.colorImage) {
      this.offscreenCtx.putImageData(this.colorImage, 0, 0);
    }
    this.ctx.drawImage(this.offscreen, 0, 0, this.cols, this.rows, 0, 0, this.width, this.height);

    for (let i = 0; i < this.ants.length; i++) {
      const ant = this.ants[i];
      const x = ant.x * this.displayCellW;
      const y = ant.y * this.displayCellH;
      this.ctx.fillStyle = ant.color;
      this.ctx.fillRect(x, y, this.displayCellW, this.displayCellH);
    }

    if (this.trace && this.ants.length > 0) {
      this.ctx.save();
      this.ctx.strokeStyle = this.mode === 'fullColor' ? 'rgba(255,255,255,0.35)' : 'rgba(244,244,245,0.35)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for (let i = 0; i < this.ants.length; i++) {
        const ant = this.ants[i];
        const cx = (ant.x + 0.5) * this.displayCellW;
        const cy = (ant.y + 0.5) * this.displayCellH;
        this.ctx.moveTo(0, cy);
        this.ctx.lineTo(this.width, cy);
        this.ctx.moveTo(cx, 0);
        this.ctx.lineTo(cx, this.height);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  private loop = (t: number = performance.now()) => {
    if (!this.running) return;
    const dt = Math.min(0.1, Math.max(0, (t - this.lastTime) / 1000));
    this.lastTime = t;

    this.accSteps += dt * this.stepsPerSecond;
    const maxGen = 5000;
    let gen = Math.floor(this.accSteps);
    if (gen > maxGen) gen = maxGen;
    if (gen >= 1) {
      for (let i = 0; i < gen; i++) this.stepOneGeneration();
      this.accSteps -= gen;
    }

    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };
}
