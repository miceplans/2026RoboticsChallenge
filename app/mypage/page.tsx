import { requireRole } from '@/lib/auth';

export default async function MyPage() {
  const session = await requireRole(['user', 'judge', 'admin']);
  return (
    <main className="mx-auto max-w-[1280px] px-6 py-12">
      <h1 className="text-2xl font-bold">마이페이지</h1>
      <p className="mt-2 text-gray-600">{session.name}님 ({session.id})</p>
    </main>
  );
}
