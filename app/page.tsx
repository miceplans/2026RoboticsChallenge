import Header from '@/components/Header';
import Hero from '@/components/Hero';
import TrackTabs from '@/components/TrackTabs';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function Page() {
  const session = await getSession();

  // 참가자가 로고나 루트 URL로 돌아와도 대회 랭킹을 계속 보여준다.
  if (session?.role === 'user') redirect('/contest');

  return (
    <>
      <Header />
      <main className="mt-[73px]">
        <Hero />
        <TrackTabs />
      </main>
    </>
  );
}
