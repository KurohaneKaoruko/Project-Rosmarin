import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InvestmentState } from '../types';
import { clearState, defaultState, loadState, saveState, DEFAULT_CASH } from './storage';
import { getCurrentSecond, livePriceAtSecond } from './market';

type TradeResult = { ok: boolean; reason?: string };

export function useInvestmentSim() {
  const [state, setState] = useState<InvestmentState>(() => defaultState(getCurrentSecond()));
  const [currentSecond, setCurrentSecond] = useState(() => getCurrentSecond());

  useEffect(() => {
    setState(loadState(getCurrentSecond()));
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSecond(getCurrentSecond());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentPrice = useMemo(() => {
    if (!Number.isFinite(currentSecond)) return 0;
    return livePriceAtSecond(currentSecond);
  }, [currentSecond]);
  const portfolioValue = useMemo(() => state.cash + state.shares * currentPrice, [state.cash, state.shares, currentPrice]);
  const profit = useMemo(() => portfolioValue - DEFAULT_CASH, [portfolioValue]);

  const syncNow = useCallback(() => {
    setCurrentSecond(getCurrentSecond());
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
    currentPrice,
    portfolioValue,
    profit,
    syncNow,
    buy,
    sell,
    reset,
  };
}
