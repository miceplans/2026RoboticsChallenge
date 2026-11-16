import Header from '@/components/Header';
import Hero from '@/components/Hero';
import NoticeBanner from '@/components/NoticeBanner';
import TrackTabs from '@/components/TrackTabs';

export default function Page() {
  return (
    <>
      <Header />
      <main className="mt-[73px]">
        <NoticeBanner className="mx-auto mt-8 max-w-[1232px] px-5 sm:mt-12 sm:px-6" />
        <Hero />
        <TrackTabs />
      </main>
    </>
  );
}
