'use client';

import { useActionState } from 'react';
import { login } from './actions';

type StaffLoginFormProps = {
  area: 'judge' | 'admin';
  title: string;
  description: string;
};

export default function StaffLoginForm({ area, title, description }: StaffLoginFormProps) {
  const [error, action, pending] = useActionState(login, null);

  return (
    <section className="w-full max-w-md">
      <div className="mb-8 border-b border-line pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-heading">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">{description}</p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="area" value={area} />
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-heading">아이디</span>
          <input name="id" autoComplete="username" placeholder="운영 계정 아이디" required className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-accent focus:ring-4 focus:ring-blue-100" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-heading">비밀번호</span>
          <input name="password" type="password" autoComplete="current-password" placeholder="비밀번호" required className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-accent focus:ring-4 focus:ring-blue-100" />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
        <button type="submit" disabled={pending} className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-white transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? '로그인 중...' : `${title} 계속하기`}
        </button>
      </form>
    </section>
  );
}
