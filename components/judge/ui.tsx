import type { ReactNode } from 'react';

export const btnPrimary = 'rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40';
export const btnGhost = 'rounded-2xl border border-line px-4 py-3 text-sm font-bold text-gray-600 disabled:cursor-not-allowed disabled:opacity-40';
export const inputCls = 'rounded-lg border border-line px-3 py-2.5';

const tones = {
  neutral: 'bg-surface-secondary text-gray-500',
  warn: 'bg-warning/10 text-warning',
  info: 'bg-accent/10 text-accent',
  bad: 'bg-error/10 text-error',
};
export type Tone = keyof typeof tones;

export const Chip = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>
);

export const Card = ({ title, children }: { title?: string; children: ReactNode }) => (
  <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
    {title && <h2 className="border-b border-line px-5 py-4 font-extrabold">{title}</h2>}
    {children}
  </section>
);
