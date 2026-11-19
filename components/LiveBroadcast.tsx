'use client';

import { useEffect, useState } from 'react';
import { useContest } from '@/lib/contest';

const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;

// 관리자가 붙여 넣은 유튜브 시청 주소(watch?v=, youtu.be/, /live/, /shorts/)를 iframe 용 embed 주소로 바꾼다.
// 그 밖의 http(s) 주소는 그대로 쓰고, http(s)가 아니면 쓰지 않는다.
export function toEmbedUrl(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(live|shorts|embed)\/([^/?#]+)/.exec(u.pathname);
      if (m) id = m[2];
    }
  }
  return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1` : u.toString();
}

// 본선 경기 중계 영상. 주소는 관리자 설정 > 경기 중계 주소에서 바꾸며, 비어 있으면 NEXT_PUBLIC_BROADCAST_URL 을 쓴다.
export default function LiveBroadcast() {
  const { config } = useContest();
  const fromConfig = config?.settings.broadcastUrl;
  // 비로그인 + 순위판 비공개면 config 를 받을 수 없으므로 공개 엔드포인트에서 따로 읽는다
  const [fetched, setFetched] = useState<string | null>(null);
  useEffect(() => {
    if (config) return;
    let alive = true;
    fetch(`${serverUrl()}/broadcast`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { ok?: boolean; url?: string }) => alive && d.ok && setFetched(d.url ?? ''))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [config]);
  const url = toEmbedUrl(config ? fromConfig : fetched) ?? toEmbedUrl(process.env.NEXT_PUBLIC_BROADCAST_URL);
  return url ? (
    <div className="aspect-video overflow-hidden rounded-2xl bg-gray-900">
      <iframe key={url} src={url} title="본선 경기 라이브" className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
    </div>
  ) : (
    <div className="flex aspect-video items-center justify-center rounded-2xl bg-gray-900 text-center text-white">
      <div>
        <b className="text-4xl">▶</b>
        <p className="mt-3">본선 경기 라이브</p>
        <small className="text-gray-400">중계 URL이 등록되면 재생됩니다.</small>
      </div>
    </div>
  );
}
