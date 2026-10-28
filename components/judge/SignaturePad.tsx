'use client';

import { useEffect, useImperativeHandle, useRef, type PointerEvent, type Ref } from 'react';

export type PadHandle = { toDataURL: () => string; clear: () => void };

// 태블릿에서 손가락/펜으로 서명한다. 서명이 한 획이라도 그려지면 onInk(true).
export default function SignaturePad({ onInk, ref }: { onInk: (hasInk: boolean) => void; ref: Ref<PadHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    const cv = canvas.current!;
    const { width, height } = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr;
    cv.height = height * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';

    // 서명하는 동안 화면이 꺼지지 않게 한다
    let released = false;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        if (released) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      released = true;
      void lock?.release();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      toDataURL: () => canvas.current!.toDataURL('image/png'),
      clear: () => {
        const cv = canvas.current!;
        cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height);
        inked.current = false;
        onInk(false);
      },
    }),
    [onInk],
  );

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top] as const;
  };

  return (
    <canvas
      ref={canvas}
      className="block h-[280px] w-full touch-none rounded-2xl border-2 border-dashed border-line-hover bg-white"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        const [x, y] = pos(e);
        const ctx = e.currentTarget.getContext('2d')!;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.1, y + 0.1);
        ctx.stroke();
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const [x, y] = pos(e);
        const ctx = e.currentTarget.getContext('2d')!;
        ctx.lineWidth = e.pressure && e.pointerType === 'pen' ? 1.5 + e.pressure * 3 : 3;
        ctx.lineTo(x, y);
        ctx.stroke();
        if (!inked.current) {
          inked.current = true;
          onInk(true);
        }
      }}
      onPointerUp={() => (drawing.current = false)}
      onPointerCancel={() => (drawing.current = false)}
    />
  );
}
