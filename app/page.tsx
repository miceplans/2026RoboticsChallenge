import Header from '@/components/Header';
import Hero from '@/components/Hero';
import TrackTabs from '@/components/TrackTabs';

export default function Page() {
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
