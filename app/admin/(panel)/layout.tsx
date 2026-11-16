import { requireRole } from '@/lib/auth';
import AdminShell from '@/components/admin/AdminShell';

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(['admin']);
  return <AdminShell name={session.name}>{children}</AdminShell>;
}
