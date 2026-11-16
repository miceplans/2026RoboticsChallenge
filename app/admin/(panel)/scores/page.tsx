import type { Metadata } from 'next';
import ScoreList from '@/components/admin/ScoreList';

export const metadata: Metadata = {
  title: '채점 목록 | 관리자',
};

export default function AdminScoresPage() {
  return <ScoreList />;
}
