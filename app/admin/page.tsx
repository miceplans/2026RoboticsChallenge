import { requireRole } from '@/lib/auth';
import AdminDashboard from '@/components/AdminDashboard';

export default async function AdminPage() {
  const session = await requireRole(['admin']);
  return <AdminDashboard name={session.name} />;
}
