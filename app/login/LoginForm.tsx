'use client';

import { useActionState } from 'react';
import { login } from './actions';

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);

  return (
    <form action={action} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">로그인</h1>
      <input name="id" placeholder="아이디" required className="w-full rounded-lg border border-gray-200 px-4 py-3" />
      <input name="password" type="password" placeholder="비밀번호" required className="w-full rounded-lg border border-gray-200 px-4 py-3" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-gray-900 py-3 text-white disabled:opacity-50">
        {pending ? '로그인 중...' : '로그인'}
      </button>
    </form>
  );
}
