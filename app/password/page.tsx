import { requireRole } from '@/lib/auth';
import PasswordForm from './PasswordForm';

export default async function PasswordPage() {
  const session = await requireRole(['user', 'judge', 'admin']);
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <PasswordForm id={session.id} />
    </main>
  );
}
