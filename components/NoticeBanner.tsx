'use client';

import { useContest } from '@/lib/contest';

export default function NoticeBanner({ className = '' }: { className?: string }) {
  const { config } = useContest();
  const message = config?.settings.notice.message.trim();
  if (!message) return null;

  return (
    <div role="status" className={`flex items-center gap-4 rounded-lg bg-accent/10 p-2.5 text-xs leading-normal text-black ${className}`}>
      <strong className="shrink-0 font-semibold">공지</strong>
      <span className="break-words">{message}</span>
    </div>
  );
}
