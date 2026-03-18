import { useCallback, useEffect, useRef } from 'react';
import type { Point, SnakeStatus } from '../types';
import { computeFinalScore } from '../function/scoring';

export type SnakeBoardProps = {
  width: number;
  height: number;
  snake: Point[];
  food: Point;
  tick: number;
  status: SnakeStatus;
  onRestart?: () => void;
};

export default function SnakeBoard(props: SnakeBoardProps) {
  const { width, height, snake, food, tick, status, onRestart } = props;

  const finalScore = computeFinalScore({ length: snake.length, steps: tick });
  const didFinish = status === 'game_over' || status === 'passed';
  const targetSize = width >= 96 ? 800 : width >= 64 ? 680 : 520;
  const boardSize = `min(100%, ${targetSize}px, 78vh)`;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, cellW: 0, cellH: 0 });
  const snakeRef = useRef<Point[]>(snake);
  const foodRef = useRef<Point>(food);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h, cellW, cellH } = sizeRef.current;
    if (w <= 0 || h <= 0) return;

    const curSnake = snakeRef.current;
    const curFood = foodRef.current;
    const head = curSnake[0];

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(grid, 0, 0);

    if (curFood.x >= 0 && curFood.y >= 0) {
      const fx = curFood.x * cellW + cellW * 0.5;
      const fy = curFood.y * cellH + cellH * 0.5;
      const r = Math.min(cellW, cellH) * 0.35;
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#3F3F46';
    for (let i = curSnake.length - 1; i >= 0; i--) {
      const seg = curSnake[i];
      if (head && seg.x === head.x && seg.y === head.y) continue;
      ctx.fillRect(seg.x * cellW, seg.y * cellH, cellW, cellH);
    }

    if (head) {
      ctx.fillStyle = '#2563EB';
      ctx.fillRect(head.x * cellW, head.y * cellH, cellW, cellH);
    }
  }, []);

  useEffect(() => {
    if (!gridRef.current) gridRef.current = document.createElement('canvas');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid) return;
    const ctx = canvas.getContext('2d');
    const gctx = grid.getContext('2d');
    if (!ctx || !gctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (w === sizeRef.current.w && h === sizeRef.current.h) return;

      canvas.width = w;
      canvas.height = h;
      grid.width = w;
      grid.height = h;

      const cellW = w / width;
      const cellH = h / height;
      sizeRef.current = { w, h, cellW, cellH };

      gctx.clearRect(0, 0, w, h);
      gctx.fillStyle = '#FFFFFF';
      gctx.fillRect(0, 0, w, h);

      if (cellW >= 6 && cellH >= 6) {
        gctx.strokeStyle = 'rgba(24,24,27,0.08)';
        gctx.lineWidth = 1;
        gctx.beginPath();
        for (let x = 0; x <= width; x++) {
          const px = Math.round(x * cellW) + 0.5;
          gctx.moveTo(px, 0);
          gctx.lineTo(px, h);
        }
        for (let y = 0; y <= height; y++) {
          const py = Math.round(y * cellH) + 0.5;
          gctx.moveTo(0, py);
          gctx.lineTo(w, py);
        }
        gctx.stroke();
      }

      drawFrame();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
  }, [width, height, boardSize, drawFrame]);

  useEffect(() => {
    snakeRef.current = snake;
    foodRef.current = food;
    drawFrame();
  }, [snake, food, tick, drawFrame]);

  return (
    <div className="w-full flex justify-center py-2">
      <div
        className="relative bg-white border border-zinc-300 shadow-2xl rounded-sm overflow-hidden ring-4 ring-zinc-100 aspect-square"
        style={{ width: boardSize }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {didFinish ? (
          <div className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300 z-20">
            <div className="bg-white border border-zinc-200 p-8 text-center shadow-2xl rounded-xl max-w-[260px] transform scale-100 animate-in zoom-in-95 duration-300">
              <div className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] mb-3 uppercase">{status === 'passed' ? 'Cleared' : 'Game Over'}</div>
              <div className="text-3xl font-black text-zinc-900 mb-6 tracking-tight">{status === 'passed' ? '挑战成功' : '挑战失败'}</div>
              <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-2">
                  <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">长度</div>
                  <div className="text-sm font-black text-zinc-900 font-mono">{snake.length}</div>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-2">
                  <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">步数</div>
                  <div className="text-sm font-black text-zinc-900 font-mono">{tick}</div>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-2">
                  <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">分数</div>
                  <div className="text-sm font-black text-zinc-900 font-mono">{finalScore}</div>
                </div>
              </div>
              {onRestart && (
                <button 
                  onClick={onRestart}
                  className="w-full px-6 py-4 bg-zinc-900 text-white text-xs font-bold tracking-widest uppercase hover:bg-zinc-800 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-zinc-900/20 rounded-lg"
                >
                  {status === 'passed' ? '再来一局' : '再试一次'}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
