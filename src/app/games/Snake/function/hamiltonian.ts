import type { Point } from '../types';

const toIdx = (x: number, y: number, width: number) => y * width + x;

export class HamiltonianCycle {
  width: number;
  height: number;
  // pathMap stores the order/index of each cell in the cycle (0 to N-1)
  pathMap: Int16Array;
  // cycle stores the coordinates at each index
  cycle: Point[];
  // Number of cells covered by the generated cycle.
  cycleLength: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pathMap = new Int16Array(width * height).fill(-1);
    this.cycle = new Array(width * height);
    this.cycleLength = 0;
    this.generate();
    this.cycle.length = this.cycleLength;
  }

  // Get distance between two points on the cycle (a -> b)
  dist(aIdx: number, bIdx: number): number {
    if (aIdx === -1 || bIdx === -1) return Infinity;
    return (bIdx - aIdx + this.cycleLength) % this.cycleLength;
  }

  getCycleIndex(p: Point): number {
    if (p.x < 0 || p.x >= this.width || p.y < 0 || p.y >= this.height) return -1;
    return this.pathMap[toIdx(p.x, p.y, this.width)];
  }

  private record(x: number, y: number, idx: number) {
    this.pathMap[toIdx(x, y, this.width)] = idx;
    this.cycle[idx] = { x, y };
  }

  private generate() {
    const { width: w, height: h } = this;

    if (w % 2 === 0) {
      this.generateSerpentine(w, h, false);
    } else if (h % 2 === 0) {
      // An odd x even grid still has a Hamiltonian cycle. Generate one for the
      // transposed grid and swap the coordinates while recording.
      this.generateSerpentine(h, w, true);
    } else {
      // Both dimensions are odd, so a Hamiltonian cycle cannot exist (grid
      // parity). Generate the full serpentine layout anyway; every cell is
      // covered, but the last column connects to the top row non-adjacently.
      this.generateSerpentine(w, h, false);
    }
  }

  private generateSerpentine(w: number, h: number, transpose: boolean) {
    // Serpentine traversal:
    // 1. Column 0: down from (0,0) to (0,H-1)
    // 2. Columns 1..W-1: up/down alternately, leaving the top row free
    // 3. Top row: left from (W-1,0) back to (1,0), closing the loop.
    // This is a valid cycle when `w` is even. For odd `w` the final edge from
    // (W-1,H-1) to (W-1,0) is not adjacent.
    // If `transpose` is set, (x,y) is recorded as (y,x).
    let idx = 0;
    const add = (x: number, y: number) => {
      if (transpose) this.record(y, x, idx++);
      else this.record(x, y, idx++);
    };

    for (let y = 0; y < h; y++) {
      add(0, y);
    }

    for (let x = 1; x < w; x++) {
      if (x % 2 === 1) {
        for (let y = h - 1; y >= 1; y--) add(x, y);
      } else {
        for (let y = 1; y < h; y++) add(x, y);
      }
    }

    for (let x = w - 1; x > 0; x--) {
      add(x, 0);
    }

    this.cycleLength = idx;
  }
}
