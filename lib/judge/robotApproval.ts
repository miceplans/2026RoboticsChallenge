'use client';

import { useCallback, useEffect, useState } from 'react';

export const ROBOT_IDS = ['R1', 'R2', 'R3', 'R4', 'R5'] as const;
export type RobotId = (typeof ROBOT_IDS)[number];
export type RobotApproval = { teamId: string; approvedRobotIds: RobotId[]; updatedAt: number };

const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;
const isRobotId = (value: unknown): value is RobotId => typeof value === 'string' && (ROBOT_IDS as readonly string[]).includes(value);

export function useRobotApproval(teamId: string) {
  const [approval, setApproval] = useState<RobotApproval | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl()}/robot-approval?teamId=${encodeURIComponent(teamId)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json() as { approval: RobotApproval | null };
      setApproval(data.approval && Array.isArray(data.approval.approvedRobotIds)
        ? { ...data.approval, approvedRobotIds: data.approval.approvedRobotIds.filter(isRobotId) }
        : null);
    } catch {
      // 네트워크가 없을 때는 심판이 잘못된 승인 상태를 보지 않도록 결과를 비운다.
      setApproval(null);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { approval, loading, refresh };
}

export async function saveRobotApproval(teamId: string, approvedRobotIds: RobotId[]) {
  const res = await fetch(`${serverUrl()}/robot-approval`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ teamId, approvedRobotIds }),
  });
  if (!res.ok) throw new Error('robot approval save failed');
  const data = await res.json() as { approval: RobotApproval };
  return data.approval;
}
