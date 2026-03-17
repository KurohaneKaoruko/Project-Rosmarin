'use client';

import type { PendulumParams, Vec2 } from '../engine/types';
import type { PendulumSimulation } from '../engine/pendulumSimulation';
import { clamp, dist } from '../engine/vec2';
import { useEffect, useMemo, useRef } from 'react';

type Props = {
  simRef: React.MutableRefObject<PendulumSimulation>;
  params: PendulumParams;
  paused: boolean;
  showTrail: boolean;
  trailLength: number;
  showEnergy: boolean;
  showPhasePlot: boolean;
  phaseTrailLength: number;
  resetToken: number;
};

function formatPercent(n: number) {
  if (!Number.isFinite(n)) return '0.00%';
  return `${(n * 100).toFixed(2)}%`;
}

export default function SimulationCanvas({
  simRef,
  params,
  paused,
  showTrail,
  trailLength,
  showEnergy,
  showPhasePlot,
  phaseTrailLength,
  resetToken,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const accRef = useRef(0);

  const settingsRef = useRef({ paused, showTrail, trailLength, showEnergy, showPhasePlot: false, phaseTrailLength: 2000, resetToken, params });
  useEffect(() => {
    settingsRef.current = { paused, showTrail, trailLength, showEnergy, showPhasePlot, phaseTrailLength, resetToken, params };
  }, [paused, showTrail, trailLength, showEnergy, showPhasePlot, phaseTrailLength, resetToken, params]);

  const lastResetTokenRef = useRef(resetToken);
  const baseEnergyRef = useRef<number | null>(null);
  const energyBufRef = useRef<{ total: number; kinetic: number; potential: number }[]>([]);
  const trailRef = useRef<Vec2[]>([]);
  const phaseRef = useRef<{ a: number; b: number; theta1: number }[]>([]);

  const totalLength = useMemo(() => {
    const count = params.mode === 'double' ? 2 : 3;
    return params.lengths.slice(0, count).reduce((a, b) => a + Math.max(0.05, b), 0);
  }, [params.lengths, params.mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const preventTouch = (ev: TouchEvent) => {
      if (ev.cancelable) ev.preventDefault();
    };
    canvas.addEventListener('touchstart', preventTouch, { passive: false });
    canvas.addEventListener('touchmove', preventTouch, { passive: false });

    let raf = 0;
    let lastMs = performance.now();
    const fixedDt = 1 / 240;
    const maxStepsPerFrame = 8 * 240;

    const getTransform = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const origin = { x: w / 2, y: h * 0.22 };
      const scale = Math.max(10, (Math.min(w, h) * 0.38) / Math.max(0.1, totalLength));
      return { rect, origin, scale };
    };

    const worldToScreen = (p: Vec2, origin: Vec2, scale: number) => ({ x: origin.x + p.x * scale, y: origin.y + p.y * scale });

    const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastMs) / 1000);
      lastMs = now;

      const { rect, origin, scale } = getTransform();
      const w = rect.width;
      const h = rect.height;

      const {
        paused: pausedNow,
        showTrail: trailOn,
        trailLength: trailN,
        showEnergy: energyOn,
        showPhasePlot: phaseOn,
        phaseTrailLength: phaseN,
        resetToken: resetNow,
        params: paramsNow,
      } =
        settingsRef.current;

      if (resetNow !== lastResetTokenRef.current) {
        lastResetTokenRef.current = resetNow;
        baseEnergyRef.current = null;
        energyBufRef.current = [];
        trailRef.current = [];
        phaseRef.current = [];
        accRef.current = 0;
      }

      if (!pausedNow) accRef.current += dt;
      let steps = 0;
      while (accRef.current >= fixedDt && steps < maxStepsPerFrame) {
        simRef.current.step(fixedDt);
        accRef.current -= fixedDt;
        steps++;
      }

      const snap = simRef.current.getSnapshot(fixedDt);

      if (trailOn) {
        const last = snap.points[snap.points.length - 1];
        trailRef.current.push(last);
        if (trailRef.current.length > trailN) trailRef.current.splice(0, trailRef.current.length - trailN);
      } else {
        trailRef.current = [];
      }

      if (energyOn) {
        if (baseEnergyRef.current == null) baseEnergyRef.current = snap.energy.total;
        const base = baseEnergyRef.current || 1;
        energyBufRef.current.push({
          total: snap.energy.total / base,
          kinetic: snap.energy.kinetic / base,
          potential: snap.energy.potential / base,
        });
        if (energyBufRef.current.length > 360) energyBufRef.current.splice(0, energyBufRef.current.length - 360);
      } else {
        energyBufRef.current = [];
        baseEnergyRef.current = null;
      }

      if (phaseOn) {
        const count = paramsNow.mode === 'double' ? 2 : 3;
        const idxA = count === 2 ? 0 : 1;
        const idxB = count === 2 ? 1 : 2;
        const a = wrapAngle(snap.anglesRad[idxA] ?? 0);
        const b = wrapAngle(snap.anglesRad[idxB] ?? 0);
        const angle1Raw = snap.anglesRad[0] ?? 0;
        phaseRef.current.push({ a, b, theta1: angle1Raw });
        if (phaseRef.current.length > phaseN) phaseRef.current.splice(0, phaseRef.current.length - phaseN);
      } else {
        phaseRef.current = [];
      }

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      
      // Grid Background
      ctx.save();
      ctx.strokeStyle = '#F4F4F5'; // zinc-100
      ctx.lineWidth = 1;
      const gridSize = 40;
      
      ctx.beginPath();
      for (let x = 0; x <= w; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.restore();

      const trail = trailRef.current;
      if (trailOn && trail.length >= 2) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.4)'; // blue-600 with opacity
        ctx.beginPath();
        const s0 = worldToScreen(trail[0], origin, scale);
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < trail.length; i++) {
          const s = worldToScreen(trail[i], origin, scale);
          ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }

      const pointsS = snap.points.map((p) => worldToScreen(p, origin, scale));

      // Draw Arms
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#18181B'; // zinc-900
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      for (const p of pointsS) ctx.lineTo(p.x, p.y);
      ctx.stroke();

      const count = paramsNow.mode === 'double' ? 2 : 3;
      const masses = paramsNow.masses;
      for (let i = 0; i < count; i++) {
        const r = 8 + 4 * Math.sqrt(Math.max(0.2, masses[i]));
        // Pendulum bob styling
        ctx.fillStyle = i === count - 1 ? '#2563EB' : '#FFFFFF'; // Last one blue, others white
        ctx.strokeStyle = '#18181B'; // zinc-900
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(pointsS[i].x, pointsS[i].y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Inner dot for white bobs
        if (i !== count - 1) {
          ctx.fillStyle = '#18181B';
          ctx.beginPath();
          ctx.arc(pointsS[i].x, pointsS[i].y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Origin point
      ctx.fillStyle = '#18181B';
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Status text
      ctx.fillStyle = '#71717A'; // zinc-500
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      const statusText = pausedNow ? 'STATUS: PAUSED' : 'STATUS: RUNNING';
      ctx.fillText(statusText, 12, h - 12);

      if (energyOn && energyBufRef.current.length >= 2) {
        const buf = energyBufRef.current;
        const boxW = Math.min(220, w - 24);
        const boxH = 76;
        const x0 = 12;
        const y0 = 12;

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeStyle = '#E4E4E7'; // zinc-200
        ctx.lineWidth = 1;
        ctx.fillRect(x0, y0, boxW, boxH);
        ctx.strokeRect(x0, y0, boxW, boxH);

        const yMid = y0 + boxH / 2;
        ctx.strokeStyle = '#F4F4F5'; // zinc-100
        ctx.beginPath();
        ctx.moveTo(x0, yMid);
        ctx.lineTo(x0 + boxW, yMid);
        ctx.stroke();

        const drawLine = (key: 'total' | 'kinetic' | 'potential', color: string) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < buf.length; i++) {
            const t = i / (buf.length - 1);
            const x = x0 + t * boxW;
            const val = buf[i][key];
            const y = y0 + boxH - clamp((val - 0.6) / 0.9, 0, 1) * boxH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        };

        drawLine('potential', '#93C5FD'); // blue-300
        drawLine('kinetic', '#86EFAC'); // green-300
        drawLine('total', '#18181B'); // zinc-900

        const last = buf[buf.length - 1];
        const drift = last.total - 1;
        ctx.fillStyle = '#71717A'; // zinc-500
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.fillText(`ENERGY_DRIFT: ${formatPercent(drift)}`, x0 + 10, y0 + boxH - 8);
      }

      if (phaseOn && phaseRef.current.length >= 2) {
        const box = Math.min(220, w - 24);
        const boxW = box;
        const boxH = 220;
        const x0 = 12;
        const y0 = Math.max(12, h - boxH - 12);

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeStyle = '#E4E4E7';
        ctx.lineWidth = 1;
        ctx.fillRect(x0, y0, boxW, boxH);
        ctx.strokeRect(x0, y0, boxW, boxH);

        const midX = x0 + boxW / 2;
        const midY = y0 + boxH / 2;
        ctx.strokeStyle = '#F4F4F5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midX, y0);
        ctx.lineTo(midX, y0 + boxH);
        ctx.moveTo(x0, midY);
        ctx.lineTo(x0 + boxW, midY);
        ctx.stroke();

        const toX = (a: number) => x0 + ((a + Math.PI) / (2 * Math.PI)) * boxW;
        const toY = (b: number) => y0 + (1 - (b + Math.PI) / (2 * Math.PI)) * boxH;

        const buf = phaseRef.current;
        const isTriple = paramsNow.mode === 'triple';

        if (isTriple) {
          const n = buf.length;
          const step = Math.max(1, Math.floor(n / 2200));
          const hueOf = (theta1: number) => {
            const cycle = (theta1 / (2 * Math.PI)) % 1;
            return ((cycle + 1) % 1) * 360;
          };
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          for (let i = step; i < n; i += step) {
            const prev = buf[i - step];
            const cur = buf[i];
            const da = Math.abs(cur.a - prev.a);
            const db = Math.abs(cur.b - prev.b);
            if (da > Math.PI || db > Math.PI) continue;
            ctx.strokeStyle = `hsla(${hueOf(cur.theta1).toFixed(1)}, 78%, 46%, 0.9)`;
            ctx.beginPath();
            ctx.moveTo(toX(prev.a), toY(prev.b));
            ctx.lineTo(toX(cur.a), toY(cur.b));
            ctx.stroke();
          }

          // sprinkle colored points for stronger hue perception
          const dotStep = Math.max(1, Math.floor(n / 1400));
          for (let i = 0; i < n; i += dotStep) {
            const cur = buf[i];
            ctx.fillStyle = `hsla(${hueOf(cur.theta1).toFixed(1)}, 85%, 45%, 1)`;
            ctx.beginPath();
            ctx.arc(toX(cur.a), toY(cur.b), 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(toX(buf[0].a), toY(buf[0].b));
          for (let i = 1; i < buf.length; i++) {
            const prev = buf[i - 1];
            const cur = buf[i];
            const da = Math.abs(cur.a - prev.a);
            const db = Math.abs(cur.b - prev.b);
            if (da > Math.PI || db > Math.PI) {
              ctx.moveTo(toX(cur.a), toY(cur.b));
              continue;
            }
            ctx.lineTo(toX(cur.a), toY(cur.b));
          }
          ctx.stroke();
        }

        const last = buf[buf.length - 1];
        ctx.fillStyle = isTriple
          ? `hsl(${((((last.theta1 / (2 * Math.PI)) % 1) + 1) % 1 * 360).toFixed(1)}, 85%, 45%)`
          : '#2563EB';
        ctx.beginPath();
        ctx.arc(toX(last.a), toY(last.b), 2.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#71717A';
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        const label =
          paramsNow.mode === 'double' ? 'θ1,θ2' : 'θ2,θ3 | hue=θ1';
        ctx.fillText(label, x0 + 10, y0 + 16);

        if (isTriple) {
          const legendW = 70;
          const legendH = 6;
          const lx = x0 + boxW - legendW - 10;
          const ly = y0 + 10;
          const grad = ctx.createLinearGradient(lx, 0, lx + legendW, 0);
          grad.addColorStop(0, 'hsl(0, 85%, 45%)');
          grad.addColorStop(1 / 6, 'hsl(60, 85%, 45%)');
          grad.addColorStop(2 / 6, 'hsl(120, 85%, 45%)');
          grad.addColorStop(3 / 6, 'hsl(180, 85%, 45%)');
          grad.addColorStop(4 / 6, 'hsl(240, 85%, 45%)');
          grad.addColorStop(5 / 6, 'hsl(300, 85%, 45%)');
          grad.addColorStop(1, 'hsl(360, 85%, 45%)');
          ctx.fillStyle = grad;
          ctx.fillRect(lx, ly, legendW, legendH);
          ctx.strokeStyle = '#E4E4E7';
          ctx.lineWidth = 1;
          ctx.strokeRect(lx, ly, legendW, legendH);
          ctx.fillStyle = '#71717A';
          ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          ctx.fillText('θ1', lx + legendW + 6, ly + legendH - 1);
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('touchstart', preventTouch);
      canvas.removeEventListener('touchmove', preventTouch);
    };
  }, [simRef, totalLength]);

  return (
    <div className="w-full">
      <div className="w-full aspect-16/10 rounded-lg overflow-hidden bg-gray-50 border border-gray-200">
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <div className="mt-2 text-xs text-gray-500">
        参数可实时调节。能量曲线用于观察数值误差。
      </div>
    </div>
  );
}
