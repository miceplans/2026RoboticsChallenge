import Header from '@/components/Header';
import ContestView from '@/components/ContestView';
import NoticeBanner from '@/components/NoticeBanner';

export default function ContestPage() {
  return (
    <>
      <Header />
      <main className="mt-[73px]">
        <NoticeBanner className="mx-auto mt-6 max-w-6xl" />
        <ContestView />
      </main>
    </>
  );
}
