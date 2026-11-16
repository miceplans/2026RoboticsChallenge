import type { Metadata } from 'next';
import RoundScores from '@/components/admin/RoundScores';

export const metadata: Metadata = {
  title: '심사 점수 | 관리자',
};

export default function AdminUsersPage() {
  return <RoundScores />;
}
