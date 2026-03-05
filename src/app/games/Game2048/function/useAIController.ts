/**
 * AI controller hook for 2048.
 * Keeps AI running state, mode switching and speed control.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getBestMove, type AIMode } from './aiEngine';
import type { Direction } from '../types';

/** Move speed presets */
export type MoveSpeed = 'turbo' | 'fast' | 'normal' | 'slow';

/** Move interval map (ms) */
export const MOVE_SPEEDS: Record<MoveSpeed, number> = {
  turbo: 0,
  fast: 100,
  normal: 300,
  slow: 500,
};

/** Hook options */
export interface AIControllerOptions {
  board: number[][];
  gameOver: boolean;
  onMove: (direction: Direction) => void;
  onMoveImmediate?: (direction: Direction) => void;
}

/** Hook return shape */
export interface AIControllerReturn {
  isRunning: boolean;
  currentMode: AIMode;
  currentSpeed: MoveSpeed;
  startAI: () => void;
  stopAI: () => void;
  setMode: (mode: AIMode) => void;
  setSpeed: (speed: MoveSpeed) => void;
}

export function useAIController(options: AIControllerOptions): AIControllerReturn {
  const { board, gameOver, onMove, onMoveImmediate } = options;

  const [isRunning, setIsRunning] = useState(false);
  const [currentMode, setCurrentMode] = useState<AIMode>('balanced');
  const [currentSpeed, setCurrentSpeed] = useState<MoveSpeed>('normal');

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const turboRunningRef = useRef(false);

  const boardRef = useRef(board);
  const modeRef = useRef(currentMode);
  const onMoveRef = useRef(onMove);
  const onMoveImmediateRef = useRef(onMoveImmediate);
  const speedRef = useRef(currentSpeed);
  const isRunningRef = useRef(false);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    modeRef.current = currentMode;
  }, [currentMode]);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    onMoveImmediateRef.current = onMoveImmediate;
  }, [onMoveImmediate]);

  useEffect(() => {
    speedRef.current = currentSpeed;
  }, [currentSpeed]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    turboRunningRef.current = false;
  }, []);

  const executeAIMove = useCallback(() => {
    const bestMove = getBestMove(boardRef.current, modeRef.current);
    if (!bestMove) {
      return false;
    }

    if (speedRef.current === 'turbo' && onMoveImmediateRef.current) {
      onMoveImmediateRef.current(bestMove);
    } else {
      onMoveRef.current(bestMove);
    }

    return true;
  }, []);

  const turboLoop = useCallback(() => {
    if (!turboRunningRef.current || !isRunningRef.current) {
      return;
    }

    executeAIMove();
    timerRef.current = setTimeout(turboLoop, 0);
  }, [executeAIMove]);

  const scheduleNextMove = useCallback(() => {
    clearTimer();
    const interval = MOVE_SPEEDS[speedRef.current];

    if (interval === 0) {
      turboRunningRef.current = true;
      timerRef.current = setTimeout(turboLoop, 0);
      return;
    }

    timerRef.current = setTimeout(() => {
      executeAIMove();
      scheduleNextMove();
    }, interval);
  }, [clearTimer, executeAIMove, turboLoop]);

  const startAI = useCallback(() => {
    if (gameOver) {
      return;
    }

    setIsRunning(true);
    isRunningRef.current = true;
    executeAIMove();
    scheduleNextMove();
  }, [gameOver, executeAIMove, scheduleNextMove]);

  const stopAI = useCallback(() => {
    setIsRunning(false);
    isRunningRef.current = false;
    clearTimer();
  }, [clearTimer]);

  const setMode = useCallback((mode: AIMode) => {
    setCurrentMode(mode);
  }, []);

  const setSpeed = useCallback((speed: MoveSpeed) => {
    setCurrentSpeed(speed);
    if (isRunning) {
      scheduleNextMove();
    }
  }, [isRunning, scheduleNextMove]);

  useEffect(() => {
    if (gameOver && isRunning) {
      stopAI();
    }
  }, [gameOver, isRunning, stopAI]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    isRunning,
    currentMode,
    currentSpeed,
    startAI,
    stopAI,
    setMode,
    setSpeed,
  };
}

export default useAIController;
