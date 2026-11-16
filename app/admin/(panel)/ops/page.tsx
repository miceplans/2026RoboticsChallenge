import type { Metadata } from 'next';
import Ops from '@/components/admin/Ops';

export const metadata: Metadata = {
  title: '운영 순서 | 관리자',
};

export default function AdminOpsPage() {
  return <Ops />;
}
