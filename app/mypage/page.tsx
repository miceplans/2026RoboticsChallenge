import { requireRole } from '@/lib/auth';
import ParticipantPortal from '@/components/ParticipantPortal';

export default async function MyPage() {
  const session = await requireRole(['user', 'judge', 'admin']);
  return <ParticipantPortal name={session.name} teamId={session.teamId} />;
}
