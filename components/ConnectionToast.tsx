'use client';

import type { Status } from '@/lib/realtime/useRealtime';

// 실시간 연결이 끊겼을 때만 화면 아래에 잠깐 안내를 띄운다
export default function ConnectionToast({ status }: { status: Status }) {
  if (status !== 'offline') return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900/90 px-5 py-3 text-sm font-semibold text-white shadow-lg"
    >
      와이파이가 불안정해요. 연결되면 자동으로 다시 불러와요.
    </div>
  );
}
