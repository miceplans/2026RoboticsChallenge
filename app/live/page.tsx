import Header from '@/components/Header';
import LiveBroadcast from '@/components/LiveBroadcast';

export default function LivePage() {
  return (
    <>
      <Header />
      <main className="mx-auto min-h-screen max-w-[1280px] px-6 pt-[121px] pb-24">
        <h1 className="mb-6 text-3xl font-extrabold text-heading [word-break:keep-all]">경기 중계</h1>
        <LiveBroadcast />
      </main>
    </>
  );
}
