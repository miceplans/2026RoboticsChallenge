import { requireRole } from '@/lib/auth';

export default async function AdminPage() {
  const session = await requireRole(['admin']);
  return (
    <main className="mx-auto max-w-[1280px] px-6 py-12">
      <h1 className="text-2xl font-bold">관리자 페이지</h1>
      <p className="mt-2 text-gray-600">{session.name}님, 환영합니다.</p>
    </main>
  );
}
