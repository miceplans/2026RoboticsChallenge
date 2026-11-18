import type { Metadata } from 'next';
import Homologation from '@/components/admin/Homologation';

export const metadata: Metadata = {
  title: '로봇 승인 등록 | 관리자',
};

export default function AdminHomologationPage() {
  return <Homologation />;
}
