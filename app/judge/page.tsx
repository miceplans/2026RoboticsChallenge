import { requireRole } from '@/lib/auth';

export default async function JudgePage() {
  const session = await requireRole(['judge', 'admin']);
  return (
    <main className="mx-auto max-w-[1280px] px-6 py-12">
      <h1 className="text-2xl font-bold">심판 페이지</h1>
      <p className="mt-2 text-gray-600">{session.name}님, 환영합니다.</p>
    </main>
  );
}
