import type { Metadata } from 'next';
import Dashboard from '@/components/admin/Dashboard';

export const metadata: Metadata = {
  title: '대시보드 | 관리자',
};

export default function AdminDashboardPage() {
  return <Dashboard />;
}
