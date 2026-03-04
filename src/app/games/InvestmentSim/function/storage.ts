import type { InvestmentState } from '../types';
import { getCurrentSecond } from './market';

const STORAGE_KEY = 'investment_sim_state';
const STORAGE_VERSION = 2 as const;

export const DEFAULT_CASH = 10000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidState(value: unknown): value is InvestmentState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as InvestmentState;
  return (
    v.version === STORAGE_VERSION &&
    isFiniteNumber(v.cash) &&
    v.cash >= 0 &&
    isFiniteNumber(v.shares) &&
    v.shares >= 0
  );
}

export function defaultState(_nowSecond = getCurrentSecond()): InvestmentState {
  return {
    version: STORAGE_VERSION,
    cash: DEFAULT_CASH,
    shares: 0,
  };
}

export function saveState(state: InvestmentState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save InvestmentSim state:', error);
  }
}

export function loadState(_nowSecond = getCurrentSecond()): InvestmentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed: unknown = JSON.parse(raw);
    if (isValidState(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) {
      const v = parsed as { cash?: unknown; shares?: unknown };
      if (isFiniteNumber(v.cash) && isFiniteNumber(v.shares)) {
        return {
          version: STORAGE_VERSION,
          cash: Math.max(0, v.cash),
          shares: Math.max(0, v.shares),
        };
      }
    }
    return defaultState();
  } catch (error) {
    console.warn('Failed to load InvestmentSim state:', error);
    return defaultState();
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear InvestmentSim state:', error);
  }
}
