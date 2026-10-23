// PoW（工作量证明）模拟引擎
// 两种模式：
//   single   —— 单次挑战：服务器下发题目（消息+难度），矿工跑 nonce，返回结果由服务器验证
//   chain    —— 区块链模式：连续出块，前向链接，可篡改/校验
// SHA-256 为纯 TypeScript 同步实现，计算热循环零内存分配。
// 求解与校验用单次 SHA-256（Bitcoin 为双重，这里取单次让每次尝试快一倍，浏览器演示更流畅）。

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const W = new Uint32Array(64);
const HS = new Uint32Array(8);
const T1 = new Uint32Array(8);
const DIGEST = new Uint8Array(32);

function compress(): void {
  for (let j = 16; j < 64; j++) {
    const x = W[j - 15];
    const y = W[j - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
  }
  let a = HS[0], b = HS[1], c = HS[2], d = HS[3];
  let e = HS[4], f = HS[5], g = HS[6], h = HS[7];
  for (let j = 0; j < 64; j++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[j] + W[j]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0;
    d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  HS[0] = (HS[0] + a) | 0;
  HS[1] = (HS[1] + b) | 0;
  HS[2] = (HS[2] + c) | 0;
  HS[3] = (HS[3] + d) | 0;
  HS[4] = (HS[4] + e) | 0;
  HS[5] = (HS[5] + f) | 0;
  HS[6] = (HS[6] + g) | 0;
  HS[7] = (HS[7] + h) | 0;
}

/** 计算 SHA-256：data 前 len 字节，结果 8 词写入 out */
export function sha256Into(data: Uint8Array, len: number, out: Uint32Array): void {
  HS.set(IV);
  let i = 0;
  for (; i + 64 <= len; i += 64) {
    for (let j = 0; j < 16; j++) {
      const o = i + j * 4;
      W[j] = ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) | 0;
    }
    compress();
  }
  const rem = len - i;
  for (let j = 0; j < 16; j++) W[j] = 0;
  for (let j = 0; j < rem; j++) W[j >> 2] |= data[i + j] << (24 - (j & 3) * 8);
  W[rem >> 2] |= 0x80 << (24 - (rem & 3) * 8);
  if (rem >= 56) {
    compress();
    for (let j = 0; j < 16; j++) W[j] = 0;
  }
  W[14] = (len / 0x20000000) | 0;
  W[15] = (len << 3) | 0;
  compress();
  out.set(HS);
}

/** 双重 SHA-256（Bitcoin PoW 用的结构） */
export function doubleSha256Into(data: Uint8Array, len: number, out: Uint32Array): void {
  sha256Into(data, len, T1);
  for (let i = 0; i < 8; i++) {
    const v = T1[i];
    DIGEST[i * 4] = (v >>> 24) & 0xff;
    DIGEST[i * 4 + 1] = (v >>> 16) & 0xff;
    DIGEST[i * 4 + 2] = (v >>> 8) & 0xff;
    DIGEST[i * 4 + 3] = v & 0xff;
  }
  sha256Into(DIGEST, 32, out);
}

/** 哈希前导 0 位数 */
export function leadingZeroBits(w: Uint32Array): number {
  let bits = 0;
  for (let i = 0; i < 8; i++) {
    const v = w[i] >>> 0;
    if (v === 0) {
      bits += 32;
      continue;
    }
    bits += Math.clz32(v);
    break;
  }
  return bits;
}

export function wordsToHex(w: Uint32Array): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += (w[i] >>> 0).toString(16).padStart(8, '0');
  return s;
}

const ENC = new TextEncoder();

export function sha256Hex(msg: string): string {
  const bytes = ENC.encode(msg);
  sha256Into(bytes, bytes.length, T1);
  return wordsToHex(T1);
}

export function doubleSha256Hex(msg: string): string {
  const bytes = ENC.encode(msg);
  doubleSha256Into(bytes, bytes.length, T1);
  return wordsToHex(T1);
}

// ============ 区块与矿工 ============

export type PoWBlock = {
  height: number;
  message: string;
  prevHash: string;
  timestamp: number;
  nonce: number;
  hash: string;
  attempts: number;
  elapsedMs: number;
  difficulty: number;
  tampered: boolean;
};

export type PoWStats = {
  running: boolean;
  version: number;
  chainLength: number;
  nextHeight: number;
  attempts: number;
  totalAttempts: number;
  nonce: number;
  hashRate: number;
  difficultyBits: number;
  expected: number;
  currentHash: string;
  recent: string[];
  bestHash: string;
  bestBits: number;
  elapsedMs: number;
  /** 当前待打包消息（自动模式下由服务器随机生成） */
  message: string;
  /** 自动模式：随机消息 + 动态难度 */
  auto: boolean;
  /** 目标出块间隔（自动难度以此为目标） */
  targetBlockMs: number;
  /** 上一块实际耗时 ms */
  lastBlockMs: number;
  /** 难度调整记录 */
  difficultyLog: DifficultyAdjust[];
};

export type DifficultyAdjust = {
  at: number;
  from: number;
  to: number;
  reason: string;
};

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/** 区块头序列化（挖矿与校验必须使用同一格式） */
export const headerOf = (b: {
  height: number;
  prevHash: string;
  timestamp: number;
  message: string;
  nonce: number;
}) => `${b.height}|${b.prevHash}|${b.timestamp}|${b.message}|${b.nonce}`;

export const GENESIS_PREV = '0'.repeat(64);

export class PoWMiner {
  readonly chain: PoWBlock[] = [];
  private difficulty = 12;
  private message = 'Alice → Bob: 3 BTC';

  /** 自动模式：随机消息 + 按出块时间动态调难度 */
  auto = true;
  /** 目标出块间隔 ms（自动难度调节的目标） */
  targetBlockMs = 3000;
  private lastBlockMs = 0;
  private difficultyLog: DifficultyAdjust[] = [];

  // 随机消息素材
  private static randMsg(): string {
    const from = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', '柴犬', '橘猫'];
    const to = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', '柴犬', '橘猫'];
    const acts = [
      () => `转账 ${rand(1, 99)}.${rand(0, 9)} BTC`,
      () => `转账 ${rand(1, 999)} USDT`,
      () => `合约调用 mint(#${rand(1, 9999)})`,
      () => `合约调用 swap(${rand(1, 500)} TOKEN)`,
      () => `记录日志 block_${rand(1000, 9999)}`,
      () => `存证 hash=0x${rand(0x1000, 0xffff).toString(16)}`,
      () => `投票 proposal#${rand(1, 20)} 赞成`,
      () => `NFT 转移 #${rand(100, 999)}`,
    ];
    const a = from[rand(0, from.length - 1)];
    let b = to[rand(0, to.length - 1)];
    if (b === a) b = to[(to.indexOf(a) + 3) % to.length];
    return `${a} → ${b}: ${acts[rand(0, acts.length - 1)]()}`;
  }

  private version = 0;
  private running = false;
  private timer = 0;
  private onFrame: ((s: PoWStats) => void) | null = null;

  // 当前区块的挖矿状态
  private height = 0;
  private prevHash = GENESIS_PREV;
  private ts = 0;
  private nonce = 1;
  private attempts = 0;
  private totalAttempts = 0;
  private blockStartMs = 0;

  private prefix: Uint8Array = new Uint8Array(0);
  private prefixLen = 0;
  private buf = new Uint8Array(64);

  private curWords = new Uint32Array(8);
  private bestWords = new Uint32Array(8);
  private bestBits = -1;
  private bestHash = '';
  private recent: string[] = [];

  private hashRate = 0;
  private lastCount = 0;
  private lastTime = 0;
  private lastEmit = 0;

  setOnFrame(cb: ((s: PoWStats) => void) | null) {
    this.onFrame = cb;
  }

  private emit() {
    this.onFrame?.(this.getStats());
  }

  /** 自动难度：按实际出块时间与目标间隔的比值调整（每块最多 ±1 bit） */
  private adjustDifficulty() {
    if (!this.auto) return;
    const from = this.difficulty;
    if (this.lastBlockMs > 0) {
      const ratio = this.lastBlockMs / this.targetBlockMs;
      if (ratio < 0.5 && this.difficulty < 24) {
        this.difficulty += 1; // 出块太快 -> 加难
      } else if (ratio > 2 && this.difficulty > 6) {
        this.difficulty -= 1; // 出块太慢 -> 降难
      }
    }
    if (this.difficulty !== from) {
      this.difficultyLog.push({
        at: this.height,
        from,
        to: this.difficulty,
        reason: `出块 ${(this.lastBlockMs / 1000).toFixed(1)}s ${this.difficulty > from ? '>' : '<'} 目标 ${this.targetBlockMs / 1000}s`,
      });
      if (this.difficultyLog.length > 20) this.difficultyLog.shift();
    }
  }

  getStats(): PoWStats {
    return {
      running: this.running,
      version: this.version,
      chainLength: this.chain.length,
      nextHeight: this.height,
      attempts: this.attempts,
      totalAttempts: this.totalAttempts,
      nonce: this.nonce,
      hashRate: this.hashRate,
      difficultyBits: this.difficulty,
      expected: 2 ** this.difficulty,
      currentHash: wordsToHex(this.curWords),
      recent: this.recent.slice(),
      bestHash: this.bestHash,
      bestBits: this.bestBits,
      elapsedMs: Date.now() - this.blockStartMs,
      message: this.message,
      auto: this.auto,
      targetBlockMs: this.targetBlockMs,
      lastBlockMs: this.lastBlockMs,
      difficultyLog: this.difficultyLog.slice(),
    };
  }

  getDifficulty() {
    return this.difficulty;
  }

  getMessage() {
    return this.message;
  }

  setDifficulty(bits: number) {
    this.difficulty = bits;
    this.resetCurrentBlock();
    this.rebuildPrefix();
    this.emit();
  }

  setMessage(msg: string) {
    this.message = msg;
    this.resetCurrentBlock();
    this.rebuildPrefix();
    this.emit();
  }

  setAuto(on: boolean) {
    this.auto = on;
    if (on) {
      // 切回自动：为当前块重新随机消息
      this.message = PoWMiner.randMsg();
    }
    this.resetCurrentBlock();
    this.rebuildPrefix();
    this.emit();
  }

  setTargetBlockMs(ms: number) {
    this.targetBlockMs = ms;
    this.emit();
  }

  /** 重新开始挖当前高度的块（换内容/难度后调用） */
  private resetCurrentBlock() {
    this.nonce = 1;
    this.attempts = 0;
    this.blockStartMs = Date.now();
    this.bestBits = -1;
    this.bestHash = '';
    this.bestWords.fill(0);
  }

  private rebuildPrefix() {
    this.ts = Date.now();
    const bytes = ENC.encode(`${this.height}|${this.prevHash}|${this.ts}|${this.message}|`);
    this.prefix = bytes;
    this.prefixLen = bytes.length;
    if (this.buf.length < bytes.length + 20) {
      this.buf = new Uint8Array(bytes.length + 20);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.blockStartMs === 0) this.blockStartMs = Date.now();
    if (this.prefixLen === 0) this.rebuildPrefix();
    this.lastCount = this.totalAttempts;
    this.lastTime = Date.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
    this.emit();
  }

  reset() {
    this.stop();
    this.chain.length = 0;
    this.version++;
    this.height = 0;
    this.prevHash = GENESIS_PREV;
    this.totalAttempts = 0;
    this.hashRate = 0;
    this.recent = [];
    this.curWords.fill(0);
    this.lastBlockMs = 0;
    this.difficultyLog = [];
    this.difficulty = 12;
    if (this.auto) this.message = PoWMiner.randMsg();
    this.resetCurrentBlock();
    this.rebuildPrefix();
    this.emit();
  }

  /** 切换某块的篡改标记 */
  tamper(height: number) {
    const b = this.chain.find((x) => x.height === height);
    if (!b) return;
    b.tampered = !b.tampered;
    this.version++;
    this.emit();
  }

  /** 按当前内容重算某块哈希（篡改后与存储哈希不同） */
  recomputeHash(height: number): string {
    const b = this.chain.find((x) => x.height === height);
    if (!b) return '';
    return sha256Hex(
      headerOf({
        height: b.height,
        prevHash: b.prevHash,
        timestamp: b.timestamp,
        message: b.tampered ? `${b.message} [已篡改]` : b.message,
        nonce: b.nonce,
      }),
    );
  }

  /** 校验整条链：返回第一个无效块的下标，-1 表示全部有效 */
  verify(): number {
    for (let i = 0; i < this.chain.length; i++) {
      const b = this.chain[i];
      if (this.recomputeHash(b.height) !== b.hash) return i;
      if (i > 0 && b.prevHash !== this.chain[i - 1].hash) return i;
    }
    return -1;
  }

  private loop = () => {
    if (!this.running) return;
    this.mineBatch(12);
    const now = Date.now();
    const dh = this.totalAttempts - this.lastCount;
    const dt = now - this.lastTime;
    if (dt > 0) {
      const inst = dh / (dt / 1000);
      this.hashRate = this.hashRate === 0 ? inst : this.hashRate * 0.7 + inst * 0.3;
    }
    this.lastCount = this.totalAttempts;
    this.lastTime = now;
    if (now - this.lastEmit > 100) {
      this.lastEmit = now;
      this.emit();
    }
    if (this.running) this.timer = setTimeout(this.loop, 0) as unknown as number;
  };

  /** 挖一批哈希（限时预算 ms），期间发现有效块则入链并准备下一块 */
  private mineBatch(budgetMs: number): void {
    const deadline = Date.now() + budgetMs;
    const diff = this.difficulty;
    const buf = this.buf;
    const plen = this.prefixLen;
    const end = plen + 20;
    buf.set(this.prefix, 0);
    let n = this.nonce;
    let attempts = 0;
    let found = false;
    while (true) {
      for (let k = 0; k < 1024; k++) {
        // nonce 十进制写入（从末尾倒着写，再搬到前缀后面）
        let m = n;
        let e = end;
        while (m > 0) {
          const q = (m / 10) | 0;
          buf[--e] = 48 + m - q * 10;
          m = q;
        }
        const dlen = end - e;
        if (e !== plen) buf.copyWithin(plen, e, end);
        sha256Into(buf, plen + dlen, this.curWords);
        const lz = leadingZeroBits(this.curWords);
        if (lz > this.bestBits) {
          this.bestBits = lz;
          this.bestWords.set(this.curWords);
          this.bestHash = wordsToHex(this.curWords);
        }
        if ((attempts & 0xfff) === 0) {
          this.recent.push(wordsToHex(this.curWords));
          if (this.recent.length > 6) this.recent.shift();
        }
        if (lz >= diff) {
          found = true;
          break;
        }
        attempts++;
        n++;
      }
      if (found || Date.now() >= deadline) break;
    }
    this.totalAttempts += attempts;
    if (found) {
      this.attempts = attempts + 1;
      const now = Date.now();
      this.lastBlockMs = now - this.blockStartMs;
      this.chain.push({
        height: this.height,
        message: this.message,
        prevHash: this.prevHash,
        timestamp: this.ts,
        nonce: n,
        hash: wordsToHex(this.curWords),
        attempts: this.attempts,
        elapsedMs: this.lastBlockMs,
        difficulty: diff,
        tampered: false,
      });
      this.version++;
      this.height++;
      this.prevHash = this.chain[this.chain.length - 1].hash;
      // 自动模式：先调难度，再为下一块随机新消息
      this.adjustDifficulty();
      if (this.auto) this.message = PoWMiner.randMsg();
      this.resetCurrentBlock();
      this.rebuildPrefix();
      this.emit();
    } else {
      this.attempts += attempts;
      this.nonce = n;
    }
  }
}

// ============ 单次 PoW 挑战（服务器下发题目 -> 矿工求解 -> 服务器验证） ============

export type Challenge = {
  id: number;
  message: string;
  difficulty: number;
  /** 服务器时间戳，进入哈希 */
  issuedAt: number;
};

export type Solution = {
  challengeId: number;
  nonce: number;
  hash: string;
  attempts: number;
  elapsedMs: number;
};

export type SoloStats = {
  running: boolean;
  /** 服务器当前题目（null = 尚未下发） */
  challenge: Challenge | null;
  /** 矿工正在尝试的 nonce */
  nonce: number;
  attempts: number;
  hashRate: number;
  currentHash: string;
  recent: string[];
  bestBits: number;
  bestHash: string;
  expected: number;
  /** 已完成的回合（含验证结果） */
  rounds: SoloRound[];
  /** 当前回合是否已找到解（等待服务器验证展示） */
  solved: Solution | null;
};

export type SoloRound = {
  seq: number;
  challenge: Challenge;
  solution: Solution | null;
  /** 服务器验证结果 */
  valid: boolean | null;
  validDetail: string;
};

export class SoloPoW {
  private challenge: Challenge | null = null;
  private seq = 0;
  private rounds: SoloRound[] = [];
  private solved: Solution | null = null;

  private running = false;
  private timer = 0;
  private onFrame: ((s: SoloStats) => void) | null = null;

  private nonce = 0;
  private attempts = 0;
  private blockStartMs = 0;

  private prefix: Uint8Array = new Uint8Array(0);
  private prefixLen = 0;
  private buf = new Uint8Array(64);

  private curWords = new Uint32Array(8);
  private bestBits = -1;
  private bestHash = '';
  private recent: string[] = [];
  private hashRate = 0;
  private lastCount = 0;
  private lastTime = 0;
  private lastEmit = 0;

  private totalSolved = 0;

  setOnFrame(cb: ((s: SoloStats) => void) | null) {
    this.onFrame = cb;
  }

  private emit() {
    this.onFrame?.(this.getStats());
  }

  getStats(): SoloStats {
    return {
      running: this.running,
      challenge: this.challenge,
      nonce: this.nonce,
      attempts: this.attempts,
      hashRate: this.hashRate,
      currentHash: wordsToHex(this.curWords),
      recent: this.recent.slice(),
      bestBits: this.bestBits,
      bestHash: this.bestHash,
      expected: this.challenge ? 2 ** this.challenge.difficulty : 0,
      rounds: this.rounds.slice(),
      solved: this.solved,
    };
  }

  /** 服务器：下发新题目（可自定义消息与难度） */
  issueChallenge(message: string, difficulty: number): Challenge {
    this.stopWork();
    this.seq += 1;
    this.challenge = {
      id: this.seq,
      message,
      difficulty,
      issuedAt: Date.now(),
    };
    this.beginWork();
    this.emit();
    return this.challenge;
  }

  /** 矿工：提交解后由服务器验证。这里实现服务器的验证逻辑，供 UI 调用。 */
  static verifySolution(ch: Challenge, sol: Solution): { valid: boolean; detail: string } {
    const header = `${ch.message}|${ch.issuedAt}|${sol.nonce}`;
    const hash = sha256Hex(header);
    const bits = leadingZeroBits(hexToWords(hash));
    if (hash !== sol.hash) return { valid: false, detail: '哈希与提交不符（数据被改动）' };
    if (bits < ch.difficulty) return { valid: false, detail: `哈希仅 ${bits} 个前导 0，不足 ${ch.difficulty} 位` };
    return { valid: true, detail: `哈希 ${bits} 个前导 0 ≥ 难度 ${ch.difficulty}，验证通过` };
  }

  /** 矿工开始工作 */
  private beginWork() {
    this.nonce = 1;
    this.attempts = 0;
    this.bestBits = -1;
    this.bestHash = '';
    this.solved = null;
    this.blockStartMs = Date.now();
    const ch = this.challenge;
    if (!ch) return;
    const bytes = ENC.encode(`${ch.message}|${ch.issuedAt}|`);
    this.prefix = bytes;
    this.prefixLen = bytes.length;
    if (this.buf.length < bytes.length + 20) this.buf = new Uint8Array(bytes.length + 20);
    this.recent = [];
  }

  private stopWork() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
  }

  start() {
    if (!this.challenge || this.running || this.solved) return;
    this.running = true;
    this.lastCount = 0;
    this.attempts = 0;
    this.lastTime = Date.now();
    this.loop();
  }

  stop() {
    this.stopWork();
    this.emit();
  }

  reset() {
    this.stopWork();
    this.challenge = null;
    this.rounds = [];
    this.solved = null;
    this.seq = 0;
    this.attempts = 0;
    this.hashRate = 0;
    this.recent = [];
    this.curWords.fill(0);
    this.bestBits = -1;
    this.bestHash = '';
    this.emit();
  }

  getRounds() {
    return this.rounds;
  }

  getTotalSolved() {
    return this.totalSolved;
  }

  private loop = () => {
    if (!this.running) return;
    const done = this.workBatch(12);
    const now = Date.now();
    const dh = this.attempts - this.lastCount;
    const dt = now - this.lastTime;
    if (dt > 0) {
      const inst = dh / (dt / 1000);
      this.hashRate = this.hashRate === 0 ? inst : this.hashRate * 0.7 + inst * 0.3;
    }
    this.lastCount = this.attempts;
    this.lastTime = now;
    if (now - this.lastEmit > 100) {
      this.lastEmit = now;
      this.emit();
    }
    if (done) {
      this.running = false;
      this.emit();
      return;
    }
    if (this.running) this.timer = setTimeout(this.loop, 0) as unknown as number;
  };

  /** 跑一批哈希；返回是否已找到解 */
  private workBatch(budgetMs: number): boolean {
    const ch = this.challenge;
    if (!ch) return true;
    const deadline = Date.now() + budgetMs;
    const diff = ch.difficulty;
    const buf = this.buf;
    const plen = this.prefixLen;
    const end = plen + 20;
    buf.set(this.prefix, 0);
    let n = this.nonce;
    let found = false;
    while (true) {
      for (let k = 0; k < 1024; k++) {
        let m = n;
        let e = end;
        while (m > 0) {
          const q = (m / 10) | 0;
          buf[--e] = 48 + m - q * 10;
          m = q;
        }
        const dlen = end - e;
        if (e !== plen) buf.copyWithin(plen, e, end);
        sha256Into(buf, plen + dlen, this.curWords);
        const lz = leadingZeroBits(this.curWords);
        if (lz > this.bestBits) {
          this.bestBits = lz;
          this.bestHash = wordsToHex(this.curWords);
        }
        if ((this.attempts & 0xfff) === 0) {
          this.recent.push(wordsToHex(this.curWords));
          if (this.recent.length > 6) this.recent.shift();
        }
        if (lz >= diff) {
          found = true;
          break;
        }
        this.attempts++;
        n++;
      }
      if (found || Date.now() >= deadline) break;
    }
    this.nonce = n;
    if (found) {
      this.attempts++;
      this.solved = {
        challengeId: ch.id,
        nonce: n,
        hash: wordsToHex(this.curWords),
        attempts: this.attempts,
        elapsedMs: Date.now() - this.blockStartMs,
      };
      this.totalSolved++;
      return true;
    }
    return false;
  }
}

function hexToWords(hex: string): Uint32Array {
  const out = new Uint32Array(8);
  for (let i = 0; i < 8; i++) out[i] = parseInt(hex.slice(i * 8, i * 8 + 8), 16) >>> 0;
  return out;
}
