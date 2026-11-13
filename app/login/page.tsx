import { headers } from 'next/headers';
import StaffLoginForm from './StaffLoginForm';
import { areaOf } from '@/lib/hosts';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const host = (await headers()).get('host') ?? '';
  const area = areaOf(host);

  if (area === 'admin') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
        <StaffLoginForm area="admin" title="관리자 로그인" description="대회 운영 설정과 계정 관리는 관리자 계정으로 로그인해 주세요." />
      </main>
    );
  }

  if (area === 'judge') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
        <StaffLoginForm area="judge" title="심판 로그인" description="심사표 작성과 경기 진행은 발급받은 심판 계정으로 로그인해 주세요." />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <LoginForm />
    </main>
  );
}
