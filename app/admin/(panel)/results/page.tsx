import type { Metadata } from 'next';
import Results from '@/components/admin/Results';

export const metadata: Metadata = {
  title: '경기 결과 | 관리자',
};

export default function AdminResultsPage() {
  return <Results />;
}
