import type { Metadata } from 'next';
import StaffLoginForm from '@/app/login/StaffLoginForm';

export const metadata: Metadata = {
  title: '심판 로그인 | 로보틱스 챌린지',
};

export default function JudgeLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
      <StaffLoginForm area="judge" title="심판 로그인" description="심사표 작성과 경기 진행은 발급받은 심판 계정으로 로그인해 주세요." />
    </main>
  );
}
