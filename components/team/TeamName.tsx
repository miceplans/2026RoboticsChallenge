'use client';

import { teamName, useContest } from '@/lib/contest';
import HomologationBadge from './HomologationBadge';

// 팀 ID → 팀 이름 (명단에 없으면 ID 그대로). 팀 이름 표기는 전부 이 컴포넌트를 쓴다.
// 로봇 승인서 결과가 있으면 이름 옆에 체크·X 를 붙인다 (badge={false} 로 끌 수 있다).
export default function TeamName({ id, badge = true }: { id: string; badge?: boolean }) {
  const { config } = useContest();
  return (
    <>
      {teamName(config?.teams ?? [], id)}
      {badge && <HomologationBadge teamId={id} />}
    </>
  );
}
