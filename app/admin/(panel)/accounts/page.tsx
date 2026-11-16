import type { Metadata } from 'next';
import Accounts from '@/components/admin/Accounts';

export const metadata: Metadata = {
  title: '사용자 현황 | 관리자',
};

export default function AdminAccountsPage() {
  return <Accounts />;
}
