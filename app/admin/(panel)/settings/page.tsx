import type { Metadata } from 'next';
import SettingsPanel from '@/components/admin/SettingsPanel';

export const metadata: Metadata = {
  title: '설정 | 관리자',
};

export default function AdminSettingsPage() {
  return <SettingsPanel />;
}
