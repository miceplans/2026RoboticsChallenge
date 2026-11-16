import type { Metadata } from 'next';
import Draw from '@/components/admin/Draw';

export const metadata: Metadata = {
  title: '토너먼트 배정 | 관리자',
};

export default function AdminDrawPage() {
  return <Draw />;
}
