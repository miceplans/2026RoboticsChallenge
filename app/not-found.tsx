import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';

export const metadata = {
  title: '페이지를 찾을 수 없습니다 | 로보틱스 챌린지',
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mt-[73px] min-h-[calc(100vh-73px)] flex items-center justify-center bg-surface px-6">
        <div className="text-center py-16">
          <Image
            src="/images/404-robot.png"
            alt="404 - 페이지를 찾을 수 없음"
            width={768}
            height={512}
            priority
            className="mx-auto w-full max-w-[480px] h-auto"
          />
          <h1 className="mt-6 text-3xl font-extrabold text-heading">페이지를 찾을 수 없습니다</h1>
          <p className="mt-3 text-gray-600">
            요청하신 페이지가 삭제되었거나 주소가 변경되었어요.
            <br className="hidden sm:block" />
            주소를 다시 확인하거나 홈으로 돌아가 주세요.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/"
              className="rounded-2xl bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-soft transition-colors"
            >
              홈으로 돌아가기
            </Link>
            <Link
              href="/contest"
              className="rounded-2xl border border-line bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 hover:border-line-hover hover:text-heading transition-colors"
            >
              대회 진행 보기
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
