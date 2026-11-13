import type { Metadata } from 'next';
import StaffLoginForm from '@/app/login/StaffLoginForm';

export const metadata: Metadata = {
  title: '관리자 로그인 | 로보틱스 챌린지',
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
      <StaffLoginForm area="admin" title="관리자 로그인" description="대회 운영 설정과 계정 관리는 관리자 계정으로 로그인해 주세요." />
    </main>
  );
}
