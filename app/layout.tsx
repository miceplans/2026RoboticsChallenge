import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '로보틱스 챌린지 | 전국민 AI 경진대회',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0"
        />
      </head>
      <body className="font-sans antialiased text-gray-900 bg-white">{children}</body>
    </html>
  );
}
