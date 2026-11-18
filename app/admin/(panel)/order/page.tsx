import type { Metadata } from 'next';
import Ops from '@/components/admin/Ops';

export const metadata: Metadata = {
  title: '경기 순서 · 운영 | 관리자',
};

export default function AdminOrderPage() {
  return <Ops />;
}
