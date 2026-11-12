'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signup } from './actions';

export default function SignupForm() {
  const [error, action, pending] = useActionState(signup, null);

  return (
    <form action={action} className="w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-3xl font-extrabold text-heading">회원가입</h1>
        <p className="mt-2 text-sm text-gray-500">
          본선 참가 명단에 등록된 <b>팀 이름</b>과 <b>본인 이름</b>을 입력하세요.
          명단과 일치하면 가입 후 바로 우리 팀의 채점 표와 팀 정보를 확인할 수 있습니다.
        </p>
      </div>
      <input name="teamName" placeholder="팀 이름 (예: 골든타임)" required className="w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent" />
      <input name="memberName" placeholder="참가자 이름 (명단에 등록된 본인 이름)" required className="w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent" />
      <input name="id" placeholder="아이디 (4~32자 영문/숫자/._-)" required className="w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent" />
      <input name="password" type="password" placeholder="비밀번호 (6자 이상)" required className="w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent" />
      {error && <p className="text-sm text-error">{error}</p>}
      <button disabled={pending} className="w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent-soft transition-colors disabled:opacity-50">
        {pending ? '가입 중...' : '가입하기'}
      </button>
      <p className="text-center text-sm text-gray-500">
        이미 계정이 있으신가요? <Link href="/login" className="font-semibold text-accent hover:underline">로그인</Link>
      </p>
    </form>
  );
}
