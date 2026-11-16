import type { Metadata } from 'next';
import TemplateEditor from '@/components/admin/TemplateEditor';

export const metadata: Metadata = {
  title: '채점표 템플릿 | 관리자',
};

export default function AdminTemplatePage() {
  return <TemplateEditor />;
}
