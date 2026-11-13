'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastItem = { id: number; message: string };
type ToastFn = (message: string) => void;

const ToastContext = createContext<ToastFn>(() => {});

// 문제가 생겼을 때 화면 구성에 적지 않고 잠깐 띄우는 토스트
export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const TOAST_MS = 4000;
const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const toast = useCallback<ToastFn>((message) => {
    const id = ++seq.current;
    setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_MS);
    timers.current.add(timer);
  }, []);

  // 언마운트되면 아직 남아 있는 제거 타이머를 정리한다
  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const t of set) clearTimeout(t);
      set.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="w-fit max-w-full rounded-full bg-error px-5 py-3 text-sm font-semibold text-white shadow-lg">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
