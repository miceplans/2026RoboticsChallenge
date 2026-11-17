import { db } from './connection.ts';

// --- 감사 로그 ---

export type AuditAction =
  | 'submit'
  | 'confirm'
  | 'modify'
  | 'reject'
  | 'teams'
  | 'matches'
  | 'settings'
  | 'template'
  | 'issue'
  | 'reset_password'
  | 'tournament'
  | 'login';
export type AuditEntry = { id: number; ts: number; actorId: string; actorName?: string | null; action: AuditAction; entity: string; entityId: string | null; detail: unknown };

const insertAudit = db.prepare('INSERT INTO score_audit (ts, actor_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)');
export function logAudit(actorId: string, action: AuditAction, entity: string, entityId: string | null, detail: unknown): void {
  insertAudit.run(Date.now(), actorId, action, entity, entityId, detail === undefined ? null : JSON.stringify(detail));
}
export function getActivity(limit: number): AuditEntry[] {
  const rows = db.prepare(`SELECT a.id, a.ts, a.actor_id AS actorId, u.name AS actorName, a.action, a.entity, a.entity_id AS entityId, a.detail
    FROM score_audit a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?`).all(Math.min(limit, 500)) as (Omit<AuditEntry, 'detail'> & { detail: string | null })[];
  return rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}
