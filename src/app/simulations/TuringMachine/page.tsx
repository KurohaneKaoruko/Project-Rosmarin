'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navigation from '../../components/Navigation';
import type { TMDef, TMDirection, TuringStats } from './simulation';
import { PRESETS, TuringMachineSim } from './simulation';

const STATE_COLORS = ['#0891b2', '#d97706', '#7c3aed', '#059669', '#db2777', '#2563eb'];
const colorOf = (state: string, states: string[]) => {
  const i = states.indexOf(state);
  return STATE_COLORS[(i < 0 ? 0 : i) % STATE_COLORS.length];
};

const PANEL = 'bg-white/85 backdrop-blur-md border border-zinc-200 rounded-xl shadow-xl shadow-zinc-900/5';

type DraftCell = { write: string; move: TMDirection; next: string };
type Draft = { states: string[]; symbols: string[]; table: Record<string, Record<string, DraftCell>>; input: string };

const makeDraft = (nStates: number, nSymbols: number): Draft => {
  const states = Array.from({ length: nStates }, (_, i) => String.fromCharCode(65 + i));
  const symbols = Array.from({ length: nSymbols }, (_, i) => String(i));
  const table: Record<string, Record<string, DraftCell>> = {};
  for (const st of states) {
    table[st] = {};
    for (const sym of symbols) {
      table[st][sym] = { write: sym, move: 'R', next: st === states[nStates - 1] ? 'HALT' : states[states.indexOf(st) + 1] };
    }
  }
  return { states, symbols, table, input: '' };
};

/** 默认草稿：BB(3)（可自定义的起点） */
const INITIAL_DRAFT: Draft = {
  states: ['A', 'B', 'C'],
  symbols: ['0', '1'],
  table: {
    A: {
      0: { write: '1', move: 'R', next: 'B' },
      1: { write: '1', move: 'L', next: 'C' },
    },
    B: {
      0: { write: '1', move: 'R', next: 'C' },
      1: { write: '1', move: 'R', next: 'B' },
    },
    C: {
      0: { write: '1', move: 'L', next: 'A' },
      1: { write: '0', move: 'L', next: 'HALT' },
    },
  } as Record<string, Record<string, DraftCell>>,
  input: '',
};

export default function TuringMachinePage() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<TuringMachineSim | null>(null);

  const [presetId, setPresetId] = useState(PRESETS[2].id); // 默认 BB(3)
  const preset = useMemo(() => PRESETS.find((p) => p.id === presetId) ?? PRESETS[0], [presetId]);

  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [stats, setStats] = useState<TuringStats | null>(null);
  const [showTable, setShowTable] = useState(true);
  const [showNote, setShowNote] = useState(false);
  const [panelTab, setPanelTab] = useState<'table' | 'custom' | 'evolution'>('table');

  // 自定义机器草稿
  const [draft, setDraft] = useState<Draft>(() => JSON.parse(JSON.stringify(INITIAL_DRAFT)) as Draft);
  const [customActive, setCustomActive] = useState(false);
  const [customDefId, setCustomDefId] = useState('custom');

  // 演化图
  const [evolutionRows, setEvolutionRows] = useState(256);
  const [evoExpanded, setEvoExpanded] = useState(false);
  const evoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const evoFullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stepRef = useRef(0);
  stepRef.current = stats?.step ?? 0;

  // 切换预设 -> 重建引擎
  useEffect(() => {
    const sim = new TuringMachineSim(preset as TMDef);
    sim.setStepsPerSecond(speed);
    sim.setOnFrame(setStats);
    sim.reset();
    simRef.current = sim;
    setRunning(false);
    setStats(sim.getStats());
    return () => sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  useEffect(() => {
    simRef.current?.setStepsPerSecond(speed);
  }, [speed]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (running) sim.start();
    else sim.stop();
  }, [running]);

  useEffect(() => {
    if (stats?.halted) setRunning(false);
  }, [stats?.halted]);

  // ---------- 画布：纸带深色横带，其余透明 ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !stats) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 只画纸带，其余保持透明（透出页面底色）
    ctx.clearRect(0, 0, w, h);

    const { start, cells } = stats.window;
    const n = cells.length;
    const headIdx = stats.head - start;
    const tapeCy = h * 0.5;
    const cellW = Math.min(56 * dpr, Math.max(14 * dpr, w / 42));
    const ch = cellW; // 正方形格子
    const centerX = w / 2;
    const cellCenter = (i: number) => centerX + (i - headIdx) * cellW;

    const accent = stats.halted ? '#71717a' : colorOf(stats.state, preset.states);

    // 纸带背板（深色横带，贯穿全宽）
    const bandTop = tapeCy - ch / 2 - 26 * dpr;
    const bandH = ch + 52 * dpr;
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, bandTop, w, bandH);

    // 格子行上下边界线
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.floor(tapeCy - ch / 2) + 0.5);
    ctx.lineTo(w, Math.floor(tapeCy - ch / 2) + 0.5);
    ctx.moveTo(0, Math.floor(tapeCy + ch / 2) + 0.5);
    ctx.lineTo(w, Math.floor(tapeCy + ch / 2) + 0.5);
    ctx.stroke();

    // 刻度线
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < n; i += 5) {
      const x = Math.floor(cellCenter(i)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, bandTop);
      ctx.lineTo(x, bandTop + bandH);
      ctx.stroke();
    }

    for (let i = 0; i < n; i++) {
      const cx = cellCenter(i) - cellW / 2;
      const v = cells[i];
      const isHead = i === headIdx;
      const dist = Math.abs(i - headIdx);
      const fade = Math.max(0.3, 1 - dist / (n * 0.55));

      if (v !== preset.blank) {
        ctx.globalAlpha = isHead ? 0.95 : 0.45 + 0.45 * fade;
        ctx.fillStyle = accent;
        // 无缝正方形：整格填充，不留间隙
        ctx.fillRect(cx, tapeCy - ch / 2, cellW, ch);
        ctx.globalAlpha = 1;

        if (cellW > 24 * dpr) {
          ctx.fillStyle = '#09090b';
          ctx.font = `bold ${cellW * 0.46}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(v, cx + cellW / 2, tapeCy);
        }
      }

      if (isHead) {
        // 磁头格子：白色描边
        ctx.strokeStyle = '#fafafa';
        ctx.lineWidth = 2.5 * dpr;
        ctx.strokeRect(cx + 1.25 * dpr, tapeCy - ch / 2 + 1.25 * dpr, cellW - 2.5 * dpr, ch - 2.5 * dpr);
      } else {
        // 无缝相邻，只画竖直网格线
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        const x = Math.floor(cx) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, tapeCy - ch / 2);
        ctx.lineTo(x, tapeCy + ch / 2);
        ctx.stroke();
      }

      // 索引
      if (cellW >= 28 * dpr || i % 5 === 0) {
        ctx.fillStyle = isHead ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)';
        ctx.font = `${Math.min(11 * dpr, cellW * 0.3)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(start + i), cx + cellW / 2, tapeCy + ch / 2 + 8 * dpr);
      }
    }

    // 磁头
    const hx = cellCenter(headIdx);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(hx - 9 * dpr, bandTop - 4 * dpr);
    ctx.lineTo(hx + 9 * dpr, bandTop - 4 * dpr);
    ctx.lineTo(hx, bandTop + 10 * dpr);
    ctx.closePath();
    ctx.fill();

    // 两侧渐隐（把纸带边缘融进页面底色）
    const fadeW = Math.min(160 * dpr, w * 0.2);
    const gl = ctx.createLinearGradient(0, 0, fadeW, 0);
    gl.addColorStop(0, 'rgba(250,250,250,1)');
    gl.addColorStop(1, 'rgba(250,250,250,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, bandTop, fadeW, bandH);
    const gr = ctx.createLinearGradient(w - fadeW, 0, w, 0);
    gr.addColorStop(0, 'rgba(250,250,250,0)');
    gr.addColorStop(1, 'rgba(250,250,250,1)');
    ctx.fillStyle = gr;
    ctx.fillRect(w - fadeW, bandTop, fadeW, bandH);
  }, [stats, preset]);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  // ---------- 自定义机器 ----------
  const resizeDraft = (nStates: number, nSymbols: number) => {
    setDraft((d) => {
      const nd = makeDraft(nStates, nSymbols);
      // 保留已有规则
      for (const st of nd.states) {
        for (const sym of nd.symbols) {
          const old = d.table[st]?.[sym];
          if (old) {
            nd.table[st][sym] = {
              write: nd.symbols.includes(old.write) ? old.write : sym,
              move: old.move,
              next: nd.states.includes(old.next) || old.next === 'HALT' ? old.next : 'HALT',
            };
          }
        }
      }
      nd.input = d.input;
      return nd;
    });
  };
  const setDraftCell = (st: string, sym: string, patch: Partial<DraftCell>) => {
    setDraft((d) => {
      const nd = { ...d, table: { ...d.table, [st]: { ...d.table[st], [sym]: { ...d.table[st][sym], ...patch } } } };
      return nd;
    });
  };
  const applyCustom = () => {
    const def: TMDef = {
      id: customDefId,
      name: '自定义机器',
      states: draft.states,
      symbols: draft.symbols,
      blank: draft.symbols[0],
      initialState: draft.states[0],
      transition: Object.fromEntries(
        draft.states.map((st) => [
          st,
          Object.fromEntries(
            draft.symbols.map((sym) => {
              const c = draft.table[st]?.[sym];
              return [sym, c ? { write: c.write, move: c.move, next: c.next } : undefined];
            }),
          ),
        ]),
      ),
      note: '用户自定义规则表生成的图灵机。',
      input: draft.input || undefined,
    };
    setCustomActive(true);
    setPresetId(PRESETS[0].id === def.id ? PRESETS[1].id : PRESETS[0].id); // 触发 effect 重置
    simRef.current?.setDef(def);
    setRunning(false);
  };

  // ---------- 演化图绘制 ----------
  const paintEvo = useCallback((canvas: HTMLCanvasElement | null, cssH: number) => {
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 480;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, w, h);

    const hist = sim.getHistory(evolutionRows);
    if (hist.rows.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `${12 * dpr}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('运行后这里会显示时间演化图', w / 2, h / 2);
      return;
    }
    const { rows, lo, hi } = hist;
    const span = Math.max(1, hi - lo + 1);
    const cw = w / span;
    const rh = h / rows.length;

    for (let r = 0; r < rows.length; r++) {
      const y = Math.floor(h - (r + 1) * rh);
      const row = rows[r];
      const color = row.state === 'HALT' ? '#71717a' : colorOf(row.state, preset.states);
      for (const [k, v] of row.tape) {
        if (v === preset.blank) continue;
        const x = Math.floor((k - lo) * cw);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, Math.max(1, Math.ceil(cw)), Math.max(1, Math.ceil(rh)));
      }
      // 磁头亮线
      const hx = Math.floor((row.head - lo) * cw);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(hx, y, Math.max(1, Math.ceil(cw)), Math.max(1, Math.ceil(rh)));
    }
  }, [evolutionRows, preset]);

  const drawEvolution = useCallback(() => {
    if (!stats || panelTab !== 'evolution' || !showTable) return;
    const isFull = evoExpanded;
    const mini = evoCanvasRef.current;
    if (!isFull && mini) paintEvo(mini, 160);
    const full = evoFullCanvasRef.current;
    if (isFull && full) {
      paintEvo(full, Math.min(window.innerWidth, window.innerHeight) - 160);
    }
  }, [paintEvo, stats, panelTab, showTable, evoExpanded]);

  useEffect(() => {
    drawEvolution();
    const onResize = () => drawEvolution();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawEvolution]);

  // ESC 关闭演化图弹层；展开/收起后重绘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEvoExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- 操作 ----------
  const doStep = () => {
    setRunning(false);
    simRef.current?.step();
  };
  const doReset = () => {
    setRunning(false);
    simRef.current?.reset();
    setStats(simRef.current?.getStats() ?? null);
  };
  const doRunToHalt = () => {
    setRunning(false);
    const sim = simRef.current;
    if (!sim) return;
    sim.run(preset.steps != null ? preset.steps + 16 : 2_000_000);
    setStats(sim.getStats());
  };

  const fmt = (n: number) => n.toLocaleString('en-US');
  const fmtBig = (n: number | undefined) =>
    n == null ? '—' : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : fmt(n);

  const verify =
    stats?.halted && preset.sigma != null
      ? stats.ones === preset.sigma && stats.step === (preset.steps ?? -1)
      : null;

  const ruleText = (r?: { write: string; move: string; next: string }) =>
    !r ? '—' : `${r.write}${r.move}${r.next === 'HALT' ? 'H' : r.next}`;

  return (
    <div className="h-screen overflow-hidden bg-zinc-50 relative">
      <Navigation title="TURING_MACHINE" />

      {/* 画布：占据导航栏以下的全部空间 */}
      <div ref={wrapRef} className="absolute left-0 right-0 top-16 bottom-0">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* 覆盖层：所有控件浮在画布上 */}
      <div className="absolute inset-0 top-16 pointer-events-none">
        {/* 左上：预设 + 状态 */}
        <div className="absolute left-4 top-4 sm:left-6 sm:top-6 w-[290px] pointer-events-auto">
          <div className={`${PANEL} p-4 space-y-3`}>
            <div className="text-[10px] font-mono text-zinc-400 tracking-[0.25em] uppercase">内置预设</div>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md font-mono text-sm text-zinc-900 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-1 rounded font-mono text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: stats?.halted ? '#71717a' : colorOf(stats?.state ?? '', preset.states) }}
              >
                {stats?.state ?? '—'}
                {stats?.halted ? ' · HALT' : ''}
              </span>
              <span className="text-zinc-500 text-xs truncate">{preset.name}</span>
            </div>

            <button
              onClick={() => setShowNote((v) => !v)}
              className="text-[10px] font-mono text-zinc-400 hover:text-zinc-700 transition-colors uppercase tracking-wider"
            >
              {showNote ? '收起说明 −' : '机器说明 +'}
            </button>
            {showNote && (
              <p className="text-[11px] leading-relaxed text-zinc-500 border-t border-zinc-100 pt-3">
                {preset.note}
              </p>
            )}
          </div>
        </div>

        {/* 右上：大步数 */}
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6 text-right pointer-events-none">
          <div className="text-zinc-400 font-mono text-[10px] tracking-[0.3em] uppercase">Steps</div>
          <div className="text-zinc-900 font-mono font-black leading-none tracking-tighter text-5xl sm:text-7xl xl:text-8xl tabular-nums">
            {fmt(stats?.step ?? 0)}
          </div>
          <div className="mt-2 flex gap-5 justify-end font-mono text-xs text-zinc-400">
            <span>
              σ <span className="text-zinc-900 font-bold">{fmt(stats?.ones ?? 0)}</span>
              {preset.sigma != null && <span className="text-zinc-300"> / {fmt(preset.sigma)}</span>}
            </span>
            <span>
              S <span className="text-zinc-900 font-bold">{fmtBig(preset.steps)}</span>
            </span>
          </div>
          {stats?.halted && (
            <div
              className={`mt-3 inline-block px-3 py-1.5 rounded-md border font-mono text-xs font-bold ${
                verify === null
                  ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                  : verify
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {verify === null
                ? `HALTED · σ=${fmt(stats.ones)} S=${fmt(stats.step)}`
                : verify
                  ? `✓ σ=${fmt(stats.ones)} S=${fmt(stats.step)} 与理论一致`
                  : `σ=${fmt(stats.ones)} S=${fmt(stats.step)} ≠ 理论值`}
            </div>
          )}
        </div>

        {/* 左下：控制 */}
        <div className={`absolute left-4 bottom-4 sm:left-6 sm:bottom-6 w-[290px] pointer-events-auto ${PANEL} p-4 space-y-3`}>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => !stats?.halted && setRunning((v) => !v)}
              disabled={stats?.halted}
              className={`px-3 py-2.5 rounded-md font-bold text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                running
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
              }`}
            >
              {running ? '暂停' : '开始'}
            </button>
            <button
              onClick={doStep}
              disabled={stats?.halted}
              className="px-3 py-2.5 rounded-md font-bold text-xs bg-zinc-50 border border-zinc-200 text-zinc-600 hover:bg-white hover:border-blue-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              单步
            </button>
            <button
              onClick={doReset}
              className="px-3 py-2.5 rounded-md font-bold text-xs bg-zinc-50 border border-zinc-200 text-zinc-600 hover:bg-white hover:border-blue-500/50 transition-colors"
            >
              重置
            </button>
            <button
              onClick={doRunToHalt}
              disabled={stats?.halted}
              title="同步快进（上限 200 万步）"
              className="px-3 py-2.5 rounded-md font-bold text-xs bg-zinc-50 border border-zinc-200 text-zinc-600 hover:bg-white hover:border-blue-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              快进
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
              <span>速度</span>
              <span className="text-zinc-700">{fmt(speed)} 步/秒</span>
            </div>
            <input
              type="range"
              className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              min={1}
              max={200000}
              step={1}
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
            />
            <div className="grid grid-cols-4 gap-1">
              {[1, 60, 5000, 200000].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`py-1 text-[10px] font-mono rounded border transition-colors ${
                    speed === s
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-white'
                  }`}
                >
                  {s >= 1000 ? `${s / 1000}k` : s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右下：规则表 / 自定义 / 演化图（页签） */}
        <div className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 max-w-[calc(100vw-2rem)] pointer-events-auto">
          <div className={`${PANEL} overflow-hidden`}>
            <div className="flex items-stretch border-b border-zinc-100">
              {(
                [
                  ['table', '规则表'],
                  ['custom', '自定义'],
                  ['evolution', '演化图'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    setPanelTab(key);
                    setShowTable(true);
                  }}
                  className={`px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                    panelTab === key && showTable
                      ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                      : 'text-zinc-400 hover:text-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowTable((v) => !v)}
                className="ml-auto px-4 py-2.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-700"
                title={showTable ? '收起面板' : '展开面板'}
              >
                {showTable ? '−' : '+'}
              </button>
            </div>

            {showTable && panelTab === 'table' && (
              <div className="px-4 pb-4 pt-2 overflow-x-auto">
                <table className="font-mono text-xs">
                  <thead>
                    <tr>
                      <th className="pb-2 pr-3 text-left text-zinc-400 text-[10px] uppercase tracking-wider font-bold align-bottom">
                        δ
                      </th>
                      {preset.states.map((st) => {
                        const active = stats?.state === st;
                        const color = colorOf(st, preset.states);
                        return (
                          <th key={st} className="pb-2 px-2 text-left font-bold align-bottom whitespace-nowrap">
                            <span
                              className="inline-flex items-baseline gap-1"
                              style={{ color: active ? color : '#a1a1aa' }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-sm inline-block self-center"
                                style={{ backgroundColor: color, opacity: active ? 1 : 0.4 }}
                              />
                              {st}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {preset.symbols.map((sym) => (
                      <tr key={sym} className="border-t border-zinc-100">
                        <td className="py-1.5 pr-3 text-zinc-400 whitespace-nowrap">读「{sym}」</td>
                        {preset.states.map((st) => {
                          const r = preset.transition[st]?.[sym];
                          const active = stats?.state === st;
                          const firing = active && stats?.headSymbol === sym && !stats.halted;
                          return (
                            <td
                              key={st}
                              className={`py-1.5 px-2 tabular-nums whitespace-nowrap ${
                                firing
                                  ? 'text-blue-600 font-bold'
                                  : firing === false && active
                                    ? 'text-zinc-400'
                                    : r
                                      ? 'text-zinc-600'
                                      : 'text-zinc-300'
                              }`}
                            >
                              {ruleText(r)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-zinc-400 font-mono mt-3 leading-relaxed">
                  写符号 + 方向(L/R/N) + 下一状态，H = 停机。当前正在执行的规则高亮。
                </p>
              </div>
            )}

            {showTable && panelTab === 'custom' && (
              <div className="px-4 pb-4 pt-2 space-y-3 max-h-[52vh] overflow-y-auto">
                {/* 尺寸 */}
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <label className="flex items-center gap-1.5 font-mono">
                    状态数
                    <select
                      value={draft.states.length}
                      onChange={(e) => resizeDraft(parseInt(e.target.value, 10), draft.symbols.length)}
                      className="px-1.5 py-0.5 bg-zinc-50 border border-zinc-200 rounded font-mono text-zinc-900 focus:outline-none focus:border-blue-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 font-mono">
                    符号数
                    <select
                      value={draft.symbols.length}
                      onChange={(e) => resizeDraft(draft.states.length, parseInt(e.target.value, 10))}
                      className="px-1.5 py-0.5 bg-zinc-50 border border-zinc-200 rounded font-mono text-zinc-900 focus:outline-none focus:border-blue-500"
                    >
                      {[2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* 规则编辑网格：行=状态, 列=符号 */}
                <div className="overflow-x-auto">
                  <table className="font-mono text-xs border-separate border-spacing-1">
                    <thead>
                      <tr>
                        <th className="text-zinc-400 text-[10px] uppercase font-bold px-1">δ</th>
                        {draft.symbols.map((s) => (
                          <th key={s} className="text-zinc-400 text-[10px] uppercase font-bold px-1">
                            读「{s}」
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.states.map((st) => (
                        <tr key={st}>
                          <td className="pr-1 font-bold whitespace-nowrap" style={{ color: colorOf(st, draft.states) }}>
                            <span className="inline-flex items-center gap-1">
                              <span
                                className="w-1.5 h-1.5 rounded-sm inline-block"
                                style={{ backgroundColor: colorOf(st, draft.states) }}
                              />
                              {st}
                            </span>
                          </td>
                          {draft.symbols.map((sym) => {
                            const cell = draft.table[st]?.[sym] ?? { write: sym, move: 'N', next: 'HALT' };
                            const cellKey = `${st}|${sym}`;
                            return (
                              <td key={sym} className="whitespace-nowrap">
                                <div className="inline-flex items-center border border-zinc-200 rounded overflow-hidden bg-zinc-50">
                                  <select
                                    value={cell.write}
                                    onChange={(e) => setDraftCell(st, sym, { write: e.target.value })}
                                    className="w-7 py-1 text-center bg-transparent focus:outline-none cursor-pointer"
                                    title="写符号"
                                  >
                                    {draft.symbols.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                  {(['L', 'N', 'R'] as const).map((m) => (
                                    <button
                                      key={m}
                                      onClick={() => setDraftCell(st, sym, { move: m })}
                                      className={`w-5 py-1 text-[10px] font-bold transition-colors ${
                                        cell.move === m ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-200'
                                      }`}
                                    >
                                      {m}
                                    </button>
                                  ))}
                                  <select
                                    value={cell.next}
                                    onChange={(e) => setDraftCell(st, sym, { next: e.target.value })}
                                    className="w-9 py-1 text-center bg-transparent focus:outline-none cursor-pointer"
                                    title="下一状态"
                                  >
                                    {draft.states.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                    <option value="HALT">H</option>
                                  </select>
                                </div>
                                {cellKey === '' && <span />}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 初始输入 + 操作 */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 font-mono text-zinc-500">
                    输入
                    <input
                      value={draft.input}
                      onChange={(e) => setDraft({ ...draft, input: e.target.value.replace(/\s/g, '') })}
                      placeholder="空"
                      className="w-32 px-2 py-1 bg-zinc-50 border border-zinc-200 rounded font-mono text-zinc-900 focus:outline-none focus:border-blue-500"
                    />
                  </label>
                  <button
                    onClick={applyCustom}
                    className="px-3 py-1.5 rounded-md font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    运行此机器
                  </button>
                  {customActive && (
                    <span className="text-emerald-600 font-mono text-[10px]">● 当前运行中</span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-400 font-mono leading-relaxed">
                  三元组 = 写符号 + 移动方向 + 下一状态（H = 停机）。改完点「运行此机器」从空白纸带开始。
                </p>
              </div>
            )}

            {showTable && panelTab === 'evolution' && (
              <div className="px-4 pb-4 pt-2 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  <span>
                    时间演化 · {evolutionRows} 行 · 最新在底部
                  </span>
                  <div className="flex gap-1">
                    {[128, 256, 512].map((n) => (
                      <button
                        key={n}
                        onClick={() => setEvolutionRows(n)}
                        className={`px-2 py-0.5 rounded border transition-colors ${
                          evolutionRows === n
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-white'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setEvoExpanded(true)}
                      className="px-2 py-0.5 rounded border bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-white hover:border-blue-500/50 transition-colors"
                    >
                      放大
                    </button>
                  </div>
                </div>
                <canvas
                  ref={evoCanvasRef}
                  className="block w-full rounded-lg border border-zinc-200 bg-zinc-950 cursor-zoom-in"
                  style={{ height: 160 }}
                  onClick={() => setEvoExpanded(true)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 演化图全屏弹层 */}
      {evoExpanded && (
        <div
          className="fixed inset-0 z-[60] bg-zinc-950/95 backdrop-blur-sm flex flex-col p-6 sm:p-10"
          onClick={() => setEvoExpanded(false)}
        >
          <div className="flex items-center justify-between mb-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
              时间演化 · {evolutionRows} 行 · {fmt(stepRef.current)} 步 · 色块 = 非空白符号 · 亮竖线 = 磁头 · 最新在底部
            </div>
            <button
              onClick={() => setEvoExpanded(false)}
              className="px-3 py-1.5 rounded-md border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-xs font-mono transition-colors"
            >
              关闭 ESC
            </button>
          </div>
          <canvas
            ref={evoFullCanvasRef}
            className="flex-1 min-h-0 w-full rounded-lg border border-white/10"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
