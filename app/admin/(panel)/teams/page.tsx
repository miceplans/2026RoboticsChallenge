import type { Metadata } from 'next';
import Teams from '@/components/admin/Teams';

export const metadata: Metadata = {
  title: '팀 · 계정 | 관리자',
};

export default function AdminTeamsPage() {
  return <Teams />;
}
