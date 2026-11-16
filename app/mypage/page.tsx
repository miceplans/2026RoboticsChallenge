import { requireRole } from '@/lib/auth';
import Header from '@/components/Header';
import ParticipantPortal from '@/components/ParticipantPortal';

export default async function MyPage() {
  const session = await requireRole(['user', 'judge', 'admin']);
  return (
    <>
      <Header />
      <ParticipantPortal name={session.name} teamId={session.teamId} />
    </>
  );
}
