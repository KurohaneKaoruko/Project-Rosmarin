import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InvestmentState } from '../types';
import { clearState, defaultState, loadState, saveState, DEFAULT_CASH } from './storage';
import { getCurrentSecond, livePriceAtMs } from './market';

type TradeResult = { ok: boolean; reason?: string };
type ClockSource = 'server' | 'local';

export function useInvestmentSim() {
  const [state, setState] = useState<InvestmentState>(() => defaultState(getCurrentSecond()));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [clockSource, setClockSource] = useState<ClockSource>('local');

  const syncedNowMs = useMemo(() => nowMs + clockOffsetMs, [nowMs, clockOffsetMs]);
  const currentSecond = useMemo(() => getCurrentSecond(syncedNowMs), [syncedNowMs]);

  useEffect(() => {
    setState(loadState(getCurrentSecond()));
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const syncServerClock = async () => {
      const t0 = Date.now();
      try {
        const response = await fetch('/api/server-time', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Clock sync failed: ${response.status}`);
        const data: { nowMs?: unknown } = await response.json();
        const t1 = Date.now();
        if (!active) return;
        const serverNow = data.nowMs;
        if (!Number.isFinite(serverNow)) throw new Error('Invalid server time payload');
        const midpoint = t0 + (t1 - t0) / 2;
        setClockOffsetMs((serverNow as number) - midpoint);
        setClockSource('server');
      } catch {
        if (active) setClockSource('local');
      }
    };

    void syncServerClock();
    const timer = setInterval(() => {
      void syncServerClock();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const currentPrice = useMemo(() => {
    if (!Number.isFinite(syncedNowMs)) return 0;
    return livePriceAtMs(syncedNowMs);
  }, [syncedNowMs]);
  const portfolioValue = useMemo(() => state.cash + state.shares * currentPrice, [state.cash, state.shares, currentPrice]);
  const profit = useMemo(() => portfolioValue - DEFAULT_CASH, [portfolioValue]);

  const syncNow = useCallback(() => {
    setNowMs(Date.now());
  }, []);

  const buy = useCallback((qty: number): TradeResult => {
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '数量无效' };
    const cost = qty * currentPrice;
    if (cost > state.cash) return { ok: false, reason: '余额不足' };
    setState(prev => ({ ...prev, cash: prev.cash - cost, shares: prev.shares + qty }));
    return { ok: true };
  }, [currentPrice, state.cash]);

  const sell = useCallback((qty: number): TradeResult => {
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '数量无效' };
    if (qty > state.shares) return { ok: false, reason: '持仓不足' };
    const revenue = qty * currentPrice;
    setState(prev => ({ ...prev, cash: prev.cash + revenue, shares: prev.shares - qty }));
    return { ok: true };
  }, [currentPrice, state.shares]);

  const reset = useCallback(() => {
    clearState();
    setState(defaultState());
  }, []);

  return {
    state,
    currentSecond,
    syncedNowMs,
    clockSource,
    currentPrice,
    portfolioValue,
    profit,
    syncNow,
    buy,
    sell,
    reset,
  };
}
