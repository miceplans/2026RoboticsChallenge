'use client';

import { useActionState } from 'react';
import { login } from './actions';

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);

  return (
    <form action={action} className="w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-3xl font-extrabold text-heading">로그인</h1>
        <p className="mt-2 text-sm text-gray-500">아무 아이디와 비밀번호로도 화면을 확인할 수 있습니다.</p>
      </div>
      <input name="id" placeholder="아이디 (표시 이름)" required className="w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent" />
      <input name="password" type="password" placeholder="비밀번호" required className="w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent" />
      <label className="block text-sm font-medium text-gray-700">
        확인할 화면
        <select name="role" defaultValue="admin" className="mt-1.5 w-full rounded-lg border border-line bg-white px-4 py-3">
          <option value="admin">관리자</option>
          <option value="judge">심판</option>
          <option value="user">참가팀</option>
        </select>
      </label>
      {error && <p className="text-sm text-error">{error}</p>}
      <button disabled={pending} className="w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent-soft transition-colors disabled:opacity-50">
        {pending ? '로그인 중...' : '로그인'}
      </button>
    </form>
  );
}
