'use client';

import { useContest } from '@/lib/contest';

export default function NoticeBanner({ className = '' }: { className?: string }) {
  const { config } = useContest();
  const message = config?.settings.notice.message.trim();
  if (!message) return null;

  return (
    <div role="status" className={`rounded-2xl bg-accent-tint px-5 py-4 text-sm text-accent ${className}`}>
      {message}
    </div>
  );
}
