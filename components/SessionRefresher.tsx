'use client';

import { useEffect } from 'react';

// 토큰은 발급 24시간 후부터 갱신 대상이다. 실시간 경기 화면처럼 페이지
// 이동 없이 오래 열어 두는 경우에도 만료되지 않도록, 열려 있는 탭에서
// 주기적으로 same-origin 갱신 요청을 보낸다.
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export default function SessionRefresher() {
  useEffect(() => {
    const refresh = () => {
      void fetch('/api/session/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(() => {
        // 오프라인/일시적 서버 장애는 다음 주기 또는 화면 복귀 시 재시도한다.
      });
    };
    const onVisibilityChange = () => {
      if (!document.hidden) refresh();
    };

    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
