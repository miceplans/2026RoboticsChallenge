'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login } from './actions';

type LoginArea = 'judge' | 'admin';

export default function LoginForm({ area }: { area?: LoginArea }) {
  const [error, action, pending] = useActionState(login, null);
  const isStaff = Boolean(area);
  const title = area === 'admin' ? '관리자 로그인' : area === 'judge' ? '심판 로그인' : '로그인';
  const description = area
    ? '발급받은 운영 계정으로 로그인하세요.'
    : '발급받은 계정 또는 회원가입한 계정으로 로그인하세요.';

  return (
    <form action={action} className="w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-3xl font-extrabold text-heading">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
      </div>
      {area && <input type="hidden" name="area" value={area} />}
      <input name="id" placeholder="이메일 또는 아이디" required className="w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent" />
      <input name="password" type="password" placeholder="비밀번호" required className="w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent" />
      {/* 사라지지 않는 자리에 에러를 적어야 스크린리더·느린 독자도 놓치지 않는다 */}
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <button disabled={pending} className="w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent-soft transition-colors disabled:opacity-50">
        {pending ? '로그인 중...' : '로그인'}
      </button>
      <p className="text-center text-sm text-gray-500">
        {isStaff ? <Link href="/login" className="font-semibold text-accent hover:underline">공용 로그인으로 이동</Link> : <>참가팀이신가요? <Link href="/signup" className="font-semibold text-accent hover:underline">회원가입</Link></>}
      </p>
    </form>
  );
}
