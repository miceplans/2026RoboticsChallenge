'use client';

import { useActionState } from 'react';
import { changeMyPassword } from './actions';

const input = 'w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-accent focus:ring-4 focus:ring-blue-100';

export default function PasswordForm({ id }: { id: string }) {
  const [msg, action, pending] = useActionState(changeMyPassword, null);
  return (
    <section className="w-full max-w-md">
      <div className="mb-8 border-b border-line pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-heading">비밀번호 변경</h1>
        <p className="mt-3 text-sm text-gray-500">{id} 계정의 비밀번호를 바꿉니다. 다른 기기에서는 로그아웃됩니다.</p>
      </div>
      <form action={action} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-heading">현재 비밀번호</span>
          <input name="current" type="password" autoComplete="current-password" required className={input} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-heading">새 비밀번호 (8자 이상)</span>
          <input name="next" type="password" autoComplete="new-password" minLength={8} required className={input} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-heading">새 비밀번호 확인</span>
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className={input} />
        </label>
        {msg && <p role="status" className={`text-sm ${msg === 'ok' ? 'text-green-600' : 'text-error'}`}>{msg === 'ok' ? '비밀번호를 변경했습니다.' : msg}</p>}
        <button disabled={pending} className="h-12 w-full rounded-2xl bg-accent font-semibold text-white hover:bg-accent-soft disabled:opacity-50">{pending ? '변경 중…' : '비밀번호 변경'}</button>
      </form>
    </section>
  );
}
