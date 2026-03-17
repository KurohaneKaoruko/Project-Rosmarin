'use client';

import type { RefObject } from 'react';

type Props = {
  open: boolean;
  script: string;
  highlighted: string;
  error: string | null;
  preRef: RefObject<HTMLPreElement | null>;
  onClose: () => void;
  onChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

export default function AIScriptModal({
  open,
  script,
  highlighted,
  error,
  preRef,
  onClose,
  onChange,
  onApply,
  onReset,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl bg-white border border-zinc-200 shadow-2xl relative">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <div className="text-sm font-bold uppercase tracking-widest text-zinc-600">AI Script Editor</div>
          <button onClick={onClose} className="text-xs font-mono text-zinc-500 hover:text-zinc-900">
            关闭
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative h-64 border border-zinc-200 bg-white">
            <pre
              ref={preRef}
              className="absolute inset-0 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-5 text-zinc-700"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <textarea
              value={script}
              onChange={(event) => onChange(event.target.value)}
              onScroll={(event) => {
                if (preRef.current) {
                  preRef.current.scrollTop = event.currentTarget.scrollTop;
                  preRef.current.scrollLeft = event.currentTarget.scrollLeft;
                }
              }}
              spellCheck={false}
              className="absolute inset-0 overflow-auto resize-none bg-transparent px-3 py-2 font-mono text-[12px] leading-5 text-transparent caret-zinc-900 outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-zinc-400">
              返回对象或数组，例如 <span className="font-mono">{'{ dx: 0, dy: 0 }'}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onApply}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-zinc-900 text-white hover:bg-zinc-800 transition"
              >
                应用
              </button>
              <button
                onClick={onReset}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest border border-zinc-200 text-zinc-600 hover:text-zinc-900 transition"
              >
                重置
              </button>
            </div>
          </div>
          {error && (
            <div className="text-[11px] text-red-600">
              脚本错误：{error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
