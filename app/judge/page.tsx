import JudgeConsole from '@/components/JudgeConsole';
import { logout } from '@/app/login/actions';
import { requireRole } from '@/lib/auth';

export default async function JudgePage() {
  const session = await requireRole(['judge', 'admin']);
  return (
    <main className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        <b className="font-extrabold text-accent">2026 로보틱스 챌린지</b>
        <span className="text-sm text-gray-500">문제해결 · 심판</span>
        <span className="flex-1" />
        <span className="text-sm text-gray-500">{session.name} ({session.id})</span>
        <form action={logout}>
          <button type="submit" className="rounded-xl border border-line px-3 py-1.5 text-sm font-bold text-gray-600">로그아웃</button>
        </form>
      </header>
      <div className="px-4 py-6">
        <JudgeConsole judgeId={session.id} judgeName={session.name} />
      </div>
    </main>
  );
}
