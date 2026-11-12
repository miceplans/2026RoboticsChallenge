import LoginForm from '@/app/login/LoginForm';

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <LoginForm area="admin" />
    </main>
  );
}
