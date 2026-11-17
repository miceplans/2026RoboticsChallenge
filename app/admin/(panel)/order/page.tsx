import type { Metadata } from 'next';
import MatchOrder from '@/components/MatchOrder';

export const metadata: Metadata = {
  title: '경기 순서 | 관리자',
};

export default function AdminOrderPage() {
  return (
    <div className="rounded-2xl border border-line bg-white p-6 [&>section]:mt-0">
      <MatchOrder />
    </div>
  );
}
