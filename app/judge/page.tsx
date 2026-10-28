import { requireRole } from '@/lib/auth';

export default async function JudgePage() {
  const session = await requireRole(['judge', 'admin']);
  return (
    <main className="min-h-screen bg-[#f4f7fb]">
      <iframe
        title="로보틱스 챌린지 심사 MVP"
        src="/judge/mvp#ref"
        className="h-screen w-full border-0"
      />
    </main>
  );
}
