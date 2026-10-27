import Header from '@/components/Header';
import Hero from '@/components/Hero';
import TrackTabs from '@/components/TrackTabs';

export default function Page() {
  return (
    <>
      <Header />
      <main className="mt-[72px]">
        <Hero />
        <TrackTabs />
      </main>
    </>
  );
}
