'use client';

import { useMemo, useState } from 'react';
import Navigation from '../../components/Navigation';
import { useInvestmentSim } from './function/useInvestmentSim';
import { buildHistorySeries, HISTORY_INTERVAL_SECONDS, HISTORY_POINTS, Candle } from './function/market';

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function PriceChart(props: { candles: Candle[]; minute: number; livePrice: number }) {
  const width = 520;
  const height = 220;
  const windowSize = Math.min(40, props.candles.length);
  const data = props.candles.slice(-windowSize);

  const { bars, min, max } = useMemo(() => {
    const minValue = Math.min(...data.map(c => c.low));
    const maxValue = Math.max(...data.map(c => c.high));
    const range = Math.max(1e-6, maxValue - minValue);
    const barWidth = width / Math.max(1, windowSize);
    const barItems = data.map((candle, index) => {
      const x = index * barWidth;
      const bodyTop = Math.max(candle.open, candle.close);
      const bodyBottom = Math.min(candle.open, candle.close);
      const yHigh = height - ((candle.high - minValue) / range) * height;
      const yLow = height - ((candle.low - minValue) / range) * height;
      const yBodyTop = height - ((bodyTop - minValue) / range) * height;
      const yBodyBottom = height - ((bodyBottom - minValue) / range) * height;
      return {
        x,
        wickTop: yHigh,
        wickBottom: yLow,
        bodyTop: yBodyTop,
        bodyBottom: yBodyBottom,
        up: candle.close >= candle.open,
        w: Math.max(3, barWidth * 0.55),
      };
    });
    return { bars: barItems, min: minValue, max: maxValue };
  }, [data, height, width, windowSize]);

  const liveY = useMemo(() => {
    const range = Math.max(1e-6, max - min);
    const y = height - ((props.livePrice - min) / range) * height;
    return Math.min(height, Math.max(0, y));
  }, [height, max, min, props.livePrice]);

  return (
    <div className="bg-white border border-zinc-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-zinc-500 font-mono">最近 {windowSize * 5} 分钟</div>
        <div className="text-xs text-zinc-400 font-mono">MIN {String(props.minute).padStart(5, '0')}</div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
        {bars.map((bar, index) => {
          const x = bar.x + (width / windowSize - bar.w) / 2;
          const bodyHeight = Math.max(2, bar.bodyBottom - bar.bodyTop);
          return (
            <g key={index}>
              <line x1={bar.x + width / windowSize / 2} y1={bar.wickTop} x2={bar.x + width / windowSize / 2} y2={bar.wickBottom} stroke="#0f172a" strokeWidth="1" />
              <rect
                x={x}
                y={bar.bodyTop}
                width={bar.w}
                height={bodyHeight}
                fill={bar.up ? '#16a34a' : '#dc2626'}
                opacity={0.85}
              />
            </g>
          );
        })}
        <line x1="0" y1={liveY} x2={width} y2={liveY} stroke="#0f172a" strokeDasharray="4 4" />
        <circle cx={width - 6} cy={liveY} r="4" fill="#0f172a" />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-zinc-500 font-mono">
        <span>MIN {formatMoney(min)}</span>
        <span>MAX {formatMoney(max)}</span>
      </div>
    </div>
  );
}

export default function Page() {
  const { state, currentSecond, syncedNowMs, clockSource, currentPrice, portfolioValue, profit, syncNow, buy, sell, reset } = useInvestmentSim();
  const [quantity, setQuantity] = useState(1);
  const [hint, setHint] = useState<string | null>(null);

  const history = useMemo(() => {
    return buildHistorySeries(currentSecond, HISTORY_POINTS, HISTORY_INTERVAL_SECONDS);
  }, [currentSecond]);

  const intervalChange = useMemo(() => {
    if (history.candles.length < 2) return 0;
    const prev = history.candles[history.candles.length - 2]?.close ?? currentPrice;
    if (prev === 0) return 0;
    return ((currentPrice - prev) / prev) * 100;
  }, [currentPrice, history.candles]);

  const maxBuyable = useMemo(() => {
    if (currentPrice <= 0) return 0;
    return Math.floor(state.cash / currentPrice);
  }, [state.cash, currentPrice]);

  function handleBuy(qty: number) {
    const result = buy(qty);
    setHint(result.ok ? null : result.reason ?? '操作失败');
  }

  function handleSell(qty: number) {
    const result = sell(qty);
    setHint(result.ok ? null : result.reason ?? '操作失败');
  }

  return (
    <main className="min-h-screen">
      <Navigation title="INVESTMENT_SIM" />

      <div className="pt-24 pb-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="bg-white border border-zinc-200 p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">模拟投资</h1>
                <p className="text-xs text-zinc-500 font-mono mt-2">
                  {'// 使用时间秒序号生成行情，价格每秒更新，保证所有玩家看到一致序列'}
                </p>
              </div>
              <div className="text-right text-xs text-zinc-500 font-mono">
                <div>本地存档: ON</div>
                <div className="text-zinc-400">CLOCK: {clockSource === 'server' ? 'SERVER_SYNCED' : 'LOCAL_FALLBACK'}</div>
                <div className="text-zinc-400">{new Date(syncedNowMs).toISOString().replace('T', ' ').slice(0, 19)}Z</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <PriceChart candles={history.candles} minute={Math.floor(currentSecond / 60)} livePrice={currentPrice} />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-200 border border-zinc-200">
                <StatCard label="当前价格" value={`$${formatMoney(currentPrice)}`} sub={formatPercent(intervalChange)} tone={intervalChange >= 0 ? 'blue' : 'red'} />
                <StatCard label="现金余额" value={`$${formatMoney(state.cash)}`} sub="可用现金" />
                <StatCard label="持仓股数" value={`${state.shares}`} sub="单位: 股" />
                <StatCard label="资产总值" value={`$${formatMoney(portfolioValue)}`} sub={`收益: ${formatMoney(profit)}`} tone={profit >= 0 ? 'blue' : 'red'} />
              </div>
            </div>

            <aside className="space-y-6">
              <div className="bg-white border border-zinc-200 p-6">
                <h2 className="text-sm font-bold text-zinc-900 mb-4">交易面板</h2>
                <label className="block text-[10px] text-zinc-500 font-mono mb-2">下单数量</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value || 1))))}
                  className="w-full border border-zinc-200 px-3 py-2 text-sm font-mono text-zinc-900"
                />

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleBuy(quantity)}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-widest uppercase"
                  >
                    买入
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSell(quantity)}
                    className="px-3 py-2 bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-bold tracking-widest uppercase"
                  >
                    卖出
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBuy(maxBuyable)}
                    className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold tracking-widest uppercase"
                    disabled={maxBuyable <= 0}
                  >
                    买入最大
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSell(state.shares)}
                    className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold tracking-widest uppercase"
                    disabled={state.shares <= 0}
                  >
                    全部卖出
                  </button>
                </div>

                {hint && <div className="mt-3 text-[10px] text-red-600 font-mono">{hint}</div>}

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={syncNow}
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-widest uppercase"
                  >
                    同步当前秒
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="px-3 py-2 border border-zinc-200 text-zinc-500 text-[10px] font-bold tracking-widest uppercase hover:text-zinc-900 hover:border-zinc-400"
                  >
                    重置
                  </button>
                </div>

                <div className="mt-4 text-[10px] text-zinc-400 font-mono">
                  {'// 行情每秒自动推进，重置仅清空本地持仓'}
                </div>
              </div>

              <div className="bg-white border border-zinc-200 p-6">
                <h2 className="text-sm font-bold text-zinc-900 mb-4">最近行情</h2>
                <div className="space-y-2 text-[10px] font-mono text-zinc-500">
                  {history.candles
                    .slice(Math.max(0, history.candles.length - 10))
                    .map((candle, index, arr) => {
                      const globalIndex = history.candles.length - arr.length + index;
                      const secondMark = history.seconds[globalIndex] ?? currentSecond;
                      const minuteIndex = Math.floor(secondMark / 60);
                      const prevClose = index === 0 ? candle.close : arr[index - 1].close;
                      const change = prevClose === 0 ? 0 : ((candle.close - prevClose) / prevClose) * 100;
                      return (
                        <div key={secondMark} className="flex items-center justify-between">
                          <span>MIN {String(minuteIndex).padStart(5, '0')}</span>
                          <span className={change >= 0 ? 'text-blue-600' : 'text-red-500'}>
                            ${formatMoney(candle.close)} ({formatPercent(change)})
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard(props: { label: string; value: string; sub: string; tone?: 'blue' | 'red' }) {
  const toneClass = props.tone === 'red' ? 'text-red-500' : props.tone === 'blue' ? 'text-blue-600' : 'text-zinc-900';
  return (
    <div className="bg-zinc-50 p-4 text-center hover:bg-zinc-100 transition-colors">
      <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">{props.label}</p>
      <p className={`text-lg font-bold font-mono ${toneClass}`}>{props.value}</p>
      <p className="text-[10px] text-zinc-500 mt-1">{props.sub}</p>
    </div>
  );
}
