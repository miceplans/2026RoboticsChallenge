import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { logout } from '@/app/login/actions';
import { getSession } from '@/lib/auth';
import { hostFor } from '@/lib/hosts';

const sns = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/aichallenge4all/',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#E4405F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
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
      <svg viewBox="0 0 24 24" fill="#FF0000" className="w-[18px] h-[18px]">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    label: 'Naver Blog',
    href: 'https://blog.naver.com/aichallenge4all',
    icon: (
      <svg viewBox="0 0 924.43 1000" fill="#03C75A" className="w-4 h-4">
        <path d="M344.06 286.98c-70.27 0-135.39 22.03-188.86 59.55V70.18H0v858.3h155.2v-42.62c53.47 37.51 118.59 59.55 188.86 59.55 181.82 0 329.21-147.39 329.21-329.21s-147.4-329.22-329.21-329.22zm-14.78 514.64c-99.13 0-179.49-83.08-179.49-185.56S230.15 430.5 329.28 430.5s179.49 83.08 179.49 185.56-80.36 185.56-179.49 185.56zM862.35 0h62.08v1000h-62.08z" />
      </svg>
    ),
  },
];

export default async function Header() {
  const session = await getSession();
  const host = (await headers()).get('host') ?? '';
  const proto = (await headers()).get('x-forwarded-proto') ?? 'http';
  const linkClass = 'text-sm text-gray-700 hover:text-gray-900';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="flex items-center justify-between h-[72px]">
          <Link href="/" className="flex items-center">
            <Image src="/images/logo.png" alt="전국민 AI 경진대회" width={200} height={40} priority className="h-8 sm:h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            {session ? (
              <>
                <Link href="/mypage" className={linkClass}>{session.name}</Link>
                {session.role !== 'user' && (
                  <a href={`${proto}://${hostFor('judge', host)}/`} className={linkClass}>심판</a>
                )}
                {session.role === 'admin' && (
                  <a href={`${proto}://${hostFor('admin', host)}/`} className={linkClass}>관리자</a>
                )}
                <form action={logout}>
                  <button className={linkClass}>로그아웃</button>
                </form>
              </>
            ) : (
              <Link href="/login" className={linkClass}>로그인</Link>
            )}
            {sns.map(({ label, href, icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                {icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
