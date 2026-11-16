'use client';

// 본선 경기 중계 영상. 마이페이지 탭과 메인 보기 전환에서 함께 사용한다.
export default function LiveBroadcast() {
  const url = process.env.NEXT_PUBLIC_BROADCAST_URL;
  return url ? (
    <div className="aspect-video overflow-hidden rounded-2xl bg-gray-900">
      <iframe src={url} title="본선 경기 라이브" className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
    </div>
  ) : (
    <div className="flex aspect-video items-center justify-center rounded-2xl bg-gray-900 text-center text-white">
      <div>
        <b className="text-4xl">▶</b>
        <p className="mt-3">본선 경기 라이브</p>
        <small className="text-gray-400">중계 URL이 등록되면 재생됩니다.</small>
      </div>
    </div>
  );
}
