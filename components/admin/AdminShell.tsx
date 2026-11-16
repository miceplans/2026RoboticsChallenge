'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon } from './shared';

export const adminNav: { href: string; label: string; icon: string }[] = [
  { href: '/admin', label: '대시보드', icon: 'dashboard' },
  { href: '/admin/users', label: '심사 점수', icon: 'leaderboard' },
  { href: '/admin/scores', label: '채점 목록', icon: 'fact_check' },
  { href: '/admin/template', label: '채점표 템플릿', icon: 'table_chart' },
  { href: '/admin/draw', label: '토너먼트 배정', icon: 'shuffle' },
  { href: '/admin/ops', label: '운영 순서', icon: 'order_approve' },
  { href: '/admin/teams', label: '팀 · 계정', icon: 'group' },
  { href: '/admin/accounts', label: '사용자 현황', icon: 'badge' },
  { href: '/admin/settings', label: '설정', icon: 'settings' },
];

export default function AdminShell({ name, children }: { name: string; children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  // 영역 서브도메인에선 브라우저 주소에서 /admin 접두사가 감춰져 /users 처럼 보인다.
  // 활성 메뉴 판별용으로 /admin 기준 경로로 정규화한다.
  const current = pathname === '/admin' || pathname.startsWith('/admin/') ? pathname : `/admin${pathname === '/' ? '' : pathname}`;
  return (
    <div className="min-h-screen bg-surface text-gray-900">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-white p-3 lg:flex">
          <Image src="/images/logo.png" alt="전국민 AI 경진대회" width={200} height={40} priority className="mb-4 h-8 w-auto self-start px-3 box-content" />
          {adminNav.map((item) => (
            <Link key={item.href} href={item.href} className={`mb-0.5 flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm ${current === item.href ? 'bg-surface-secondary font-medium text-heading' : 'text-gray-600 hover:bg-surface'}`}>
              <Icon name={item.icon} />{item.label}
            </Link>
          ))}
          <p className="mt-auto flex items-center gap-1 px-3 py-2 text-sm text-gray-600"><Icon name="person" />{name}</p>
          <a href="/password" className="px-3 pb-2 text-sm text-gray-500 hover:text-heading">비밀번호 변경</a>
        </aside>
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <Image src="/images/logo.png" alt="전국민 AI 경진대회" width={200} height={40} className="mb-4 h-8 w-auto lg:hidden" />
          <div className="mb-6 flex gap-2 overflow-x-auto lg:hidden">
            {adminNav.map((x) => (
              <Link key={x.href} href={x.href} className={`whitespace-nowrap rounded-2xl border px-3 py-1.5 text-sm ${current === x.href ? 'border-accent bg-accent text-white' : 'border-line bg-white text-gray-600'}`}>{x.label}</Link>
            ))}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
