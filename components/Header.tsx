import Image from 'next/image';
import Link from 'next/link';
import NavButton from '@/components/NavButton';
import { logout } from '@/app/login/actions';
import { getSession } from '@/lib/auth';

const sns = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/aichallenge4all/',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    ),
  },
  {
    label: 'YouTube',
    href: 'https://buly.kr/4bjjT3E',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    label: 'Naver Blog',
    href: 'https://blog.naver.com/aichallenge4all',
    icon: (
      <svg viewBox="0 0 924.43 1000" fill="currentColor" className="w-4 h-4">
        <path d="M344.06 286.98c-70.27 0-135.39 22.03-188.86 59.55V70.18H0v858.3h155.2v-42.62c53.47 37.51 118.59 59.55 188.86 59.55 181.82 0 329.21-147.39 329.21-329.21s-147.4-329.22-329.21-329.22zm-14.78 514.64c-99.13 0-179.49-83.08-179.49-185.56S230.15 430.5 329.28 430.5s179.49 83.08 179.49 185.56-80.36 185.56-179.49 185.56zM862.35 0h62.08v1000h-62.08z" />
      </svg>
    ),
  },
];

export default async function Header() {
  const session = await getSession();
  const linkClass = 'whitespace-nowrap text-[15px] font-semibold text-gray-700 hover:text-heading';
  const snsClass = 'text-gray-400 hover:text-heading transition-colors';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-line">
      <div className="max-w-[1280px] mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-[73px]">
          <Link href="/" className="flex items-center">
            <Image src="/images/logo.svg" alt="전국민 AI 경진대회" width={200} height={74} priority className="h-7 sm:h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/contest" className="whitespace-nowrap text-[15px] font-semibold text-heading hover:text-accent transition-colors">대회 진행</Link>
            <Link href="/live" className="whitespace-nowrap text-[15px] font-semibold text-heading hover:text-accent transition-colors">경기 중계</Link>
            {session ? (
              <>
                <Link href="/mypage" className={linkClass}>
                  내 정보{session.teamId ? ` (${session.name})` : ''}
                </Link>
                <Link href="/password" className={`${linkClass} hidden sm:block`}>비밀번호 변경</Link>
                <form action={logout}>
                  <button aria-label="로그아웃" className={`flex items-center ${linkClass}`}>
                    <span className="hidden sm:inline">로그아웃</span>
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px] sm:hidden">
                      <path d="M5,21q-0.83,0-1.41-0.59T3,19V5Q3,4.17 3.59,3.59T5,3h7V5H5V19h7v2H5Zm11-4l-1.38-1.45L17.18,13H9V11h8.18L14.63,8.45L16,7l5,5l-5,5Z" />
                    </svg>
                  </button>
                </form>
              </>
            ) : (
              <>
                <NavButton href="/login" className="cursor-pointer whitespace-nowrap rounded-full bg-accent px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-accent-soft sm:px-4">로그인</NavButton>
              </>
            )}
            {/* 모바일에서는 헤더 공간이 부족하므로 SNS 링크를 숨긴다 */}
            <span aria-hidden className="hidden h-4 w-px bg-line sm:block" />
            <div className="hidden items-center gap-4 sm:flex">
              {sns.map(({ label, href, icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`flex items-center ${snsClass}`}
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
