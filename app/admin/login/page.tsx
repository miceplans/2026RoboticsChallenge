import LoginForm from '@/app/login/LoginForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '관리자 로그인 | 로보틱스 챌린지',
};

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <LoginForm area="admin" />
    </main>
  );
}
