'use client';

// 관리자 페이지(라우트)들이 공유하는 상수와 헬퍼.

export const card = 'rounded-2xl border border-line bg-white';
export const btn = 'rounded-2xl border border-line px-3 py-2 text-sm font-semibold hover:border-line-hover';
export const btnPrimary = 'rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-soft';

export const STATUS_LABEL: Record<string, string> = { pending: '확정 대기', confirmed: '확정', modified: '수정됨', rejected: '반려' };

const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;

export async function adminFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${serverUrl()}${path}`, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as ({ ok: boolean; error?: string } & T) | null;
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `요청 실패 (${res.status})`);
  return data;
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const timeAgo = (ts: number) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};

export const fmtDate = (ts?: number) => (ts ? new Date(ts).toLocaleString('ko-KR') : '-');

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined select-none ${className}`} style={{ fontSize: 20 }} aria-hidden>{name}</span>;
}
