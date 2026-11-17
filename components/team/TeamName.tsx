'use client';

import { teamName, useContest } from '@/lib/contest';

// 팀 ID → 팀 이름 (명단에 없으면 ID 그대로). 팀 이름 표기는 전부 이 컴포넌트를 쓴다.
export default function TeamName({ id }: { id: string }) {
  const { config } = useContest();
  return <>{teamName(config?.teams ?? [], id)}</>;
}
