import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// DB 경로를 임시 파일로 정한 뒤 db 모듈을 불러온다 (모듈이 열 때 파일을 연다).
const dir = mkdtempSync(join(tmpdir(), 'contest-db-test-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.DEFAULT_PASSWORD = 'test-default-pw';
const db = await import('./db.ts');
const { submitScore } = await import('./routes/score.ts');

before(() => {
  db.seedIfEmpty();
  db.seedDefaultAccounts();
});

test('관리자는 예선 점수를 제출할 수 없다', () => {
  const result = submitScore(
    { id: 'admin', name: '관리자', role: 'admin', exp: Date.now() + 60_000, v: 2 },
    { matchId: 'R1-J-YYE-197', teamId: 'J-YYE-197', points: 100, ts: Date.now() },
  );
  assert.deepEqual(result, { ok: false, error: 'forbidden' });
});

test('기본 계정은 DEFAULT_PASSWORD 로 만들어지고 mustChange 상태다', async () => {
  const admin = await db.verifyUser('admin', process.env.DEFAULT_PASSWORD!);
  assert.ok(admin);
  assert.equal(admin.role, 'admin');
  assert.equal(admin.mustChange, true);

  const team = await db.verifyUser('J-YYE-197', process.env.DEFAULT_PASSWORD!);
  assert.ok(team);
  assert.equal(team.teamId, 'J-YYE-197');
  assert.equal(team.mustChange, true);

  // 심판 16명도 같은 기본 비밀번호로 만들어진다
  const ref16 = await db.verifyUser('REF16', process.env.DEFAULT_PASSWORD!);
  assert.ok(ref16);
  assert.equal(ref16.role, 'judge');
});

test('틀린 비밀번호는 null 이고, 비밀번호 변경은 세션(tv)을 끊는다', async () => {
  assert.equal(await db.verifyUser('admin', 'wrong-password'), null);

  const before = await db.verifyUser('admin2', process.env.DEFAULT_PASSWORD!);
  assert.ok(before);
  const tv = await db.changeOwnPassword('admin2', 'brand-new-pw-1');
  assert.equal(tv, before.tv + 1);

  assert.equal(await db.verifyUser('admin2', process.env.DEFAULT_PASSWORD!), null);
  const after = await db.verifyUser('admin2', 'brand-new-pw-1');
  assert.ok(after);
  assert.equal(after.mustChange, false); // 직접 바꾼 비밀번호는 더 이상 변경 강제가 아니다
});

test('비밀번호 재발급은 DEFAULT_PASSWORD 로 되돌리고 다시 변경을 강제한다', async () => {
  const [reset] = db.resetPasswords({ ids: ['REF01'] });
  assert.ok(reset);
  assert.equal(reset.password, process.env.DEFAULT_PASSWORD);

  const u = await db.verifyUser('REF01', process.env.DEFAULT_PASSWORD!);
  assert.ok(u);
  assert.equal(u.mustChange, true);
});

test('점수 제출은 ts 가 오래된 걸 무시하고, 확정 후엔 덮지 못한다', () => {
  const ts = Date.now();
  const first = db.saveScore({ matchId: 'R1-J-YYE-197', teamId: 'J-YYE-197', judgeId: 'REF05', points: 100, ts, sheet: null });
  assert.equal(first.written, true);
  assert.equal(first.status, 'pending');

  const older = db.saveScore({ matchId: 'R1-J-YYE-197', teamId: 'J-YYE-197', judgeId: 'REF05', points: 50, ts: ts - 1000, sheet: null });
  assert.equal(older.written, false);
  assert.equal(older.status, 'pending');

  assert.equal(db.confirmScore('R1-J-YYE-197', 'J-YYE-197', 'REF05', 'admin'), true);

  const resubmit = db.saveScore({ matchId: 'R1-J-YYE-197', teamId: 'J-YYE-197', judgeId: 'REF05', points: 999, ts: ts + 1000, sheet: null });
  assert.equal(resubmit.written, false);
  assert.equal(resubmit.status, 'confirmed');

  const scores = db.getTeamScores('J-YYE-197');
  const row = scores.find((s) => s.judgeId === 'REF05');
  assert.equal(row?.points, 100);
  assert.equal(row?.status, 'confirmed');
});

test('순위는 확정 점수 기준으로 높은 점수 → 조별 합계 → 감점 적은 순이다', () => {
  const ts = Date.now();
  db.saveScore({ matchId: 'R1-J-VOL-863', teamId: 'J-VOL-863', judgeId: 'REF05', points: 200, ts, sheet: null });
  db.saveScore({ matchId: 'R1-J-GYI-674', teamId: 'J-GYI-674', judgeId: 'REF06', points: 200, ts, sheet: null, penCnt: 3 });
  db.saveScore({ matchId: 'R1-J-ARB-743', teamId: 'J-ARB-743', judgeId: 'REF06', points: 200, ts, sheet: null, penCnt: 1 });
  db.confirmScore('R1-J-VOL-863', 'J-VOL-863', 'REF05', 'admin');
  db.confirmScore('R1-J-GYI-674', 'J-GYI-674', 'REF06', 'admin');
  db.confirmScore('R1-J-ARB-743', 'J-ARB-743', 'REF06', 'admin');

  const standings = db.getStandings().filter((s) => s.cat === 'J');
  const idxOf = (id: string) => standings.findIndex((s) => s.teamId === id);
  // J01(100) < J02=J03=J04(200). 동점이면 감점 적은 순: J02(0) → J04(1) → J03(3).
  assert.ok(idxOf('J-VOL-863') < idxOf('J-ARB-743'));
  assert.ok(idxOf('J-ARB-743') < idxOf('J-GYI-674'));
  assert.ok(idxOf('J-GYI-674') < idxOf('J-YYE-197'));
  const j01 = standings.find((s) => s.teamId === 'J-YYE-197');
  assert.equal(j01?.total, 100);
  assert.equal(j01?.r1, 100);
});

test('토너먼트: 슬롯 배정 → 8강 결과가 준결승에 진출자를 채운다', () => {
  const teams = ['J-YYE-197', 'J-VOL-863', 'J-GYI-674', 'J-ARB-743', 'J-XMO-695', 'J-TBW-085', 'J-DGX-223', 'J-SZM-451'];
  db.saveTournamentSlots('J', teams);
  const t = db.getTournament();
  const qf1 = t.games.find((g) => g.round === 'QF' && g.gameNo === 1);
  assert.equal(qf1?.teamA, 'J-YYE-197');
  assert.equal(qf1?.teamB, 'J-VOL-863');
  assert.equal(qf1?.status, 'scheduled');

  db.saveTournamentResult('J', 'QF', 1, 10, 5);
  const after = db.getTournament();
  const sf1 = after.games.find((g) => g.round === 'SF' && g.gameNo === 1);
  assert.equal(sf1?.teamA, 'J-YYE-197');
  assert.equal(after.games.find((g) => g.round === 'QF' && g.gameNo === 1)?.status, 'done');
});

test('토너먼트: 동점은 승자 지정(tb)이 있어야 승부가 갈리고, 준결승 패자는 3·4위전으로 간다', () => {
  db.saveTournamentResult('J', 'QF', 2, 7, 7); // tb 없음 — 예정 상태로 남는다
  let g = db.getTournament().games.find((x) => x.round === 'QF' && x.gameNo === 2);
  assert.equal(g?.status, 'scheduled');
  assert.equal(db.getTournament().games.find((x) => x.round === 'SF' && x.gameNo === 1)?.teamB, null);

  db.saveTournamentResult('J', 'QF', 2, 7, 7, 'A'); // J03 승
  const sf1 = db.getTournament().games.find((x) => x.round === 'SF' && x.gameNo === 1);
  assert.equal(sf1?.teamB, 'J-GYI-674');

  db.saveTournamentResult('J', 'QF', 3, 2, 8); // J06 승
  db.saveTournamentResult('J', 'QF', 4, 6, 1); // J07 승
  db.saveTournamentResult('J', 'SF', 1, 3, 1); // J01 승, J03 패 → 3·4위전 A
  const t = db.getTournament();
  assert.equal(t.games.find((x) => x.round === 'F' && x.gameNo === 1)?.teamA, 'J-YYE-197');
  assert.equal(t.games.find((x) => x.round === '3P' && x.gameNo === 1)?.teamA, 'J-GYI-674');
});

test('토너먼트: 이미 확정된 경기의 점수 재입력은 막는다', () => {
  db.saveTournamentResult('J', 'SF', 1, 5, 2);
  assert.throws(() => db.submitTournamentScore('J', 'SF', 1, 1, 1, 'REF01'), /확정된 경기/);
});

test('FK: 없는 심판·다른 팀 점수·없는 팀 슬롯은 DB 가 거부한다', () => {
  const conn = (db as unknown as { db: import('node:sqlite').DatabaseSync }).db;
  const ins = (m: string, t: string, j: string) => conn.prepare('INSERT INTO scores (match_id, team_id, judge_id, points, ts) VALUES (?, ?, ?, 1, 1)').run(m, t, j);
  assert.throws(() => ins('R1-J-YYE-197', 'J-YYE-197', 'NO-SUCH-JUDGE'), /FOREIGN KEY/);
  assert.throws(() => ins('R1-J-YYE-197', 'J-VOL-863', 'REF01'), /FOREIGN KEY/); // 그 대진의 팀이 아님
  assert.throws(() => conn.prepare("INSERT OR REPLACE INTO tournament_slots (cat, slot_no, team_id) VALUES ('S', 8, 'NO-TEAM')").run(), /FOREIGN KEY/);
});

test('대진 교체: 점수가 걸린 대진은 지우거나 바꿀 수 없고, 점수 없는 대진은 바뀐다', () => {
  const conn = (db as unknown as { db: import('node:sqlite').DatabaseSync }).db;
  conn.prepare("INSERT INTO scores (match_id, team_id, judge_id, points, ts) VALUES ('R1-J-YYE-197', 'J-YYE-197', 'REF01', 10, 1)").run();
  const all = db.listMatches();
  assert.throws(() => db.replaceMatches(all.filter((m) => m.id !== 'R1-J-YYE-197')), /matches_in_use/);
  assert.equal(db.listMatches().length, all.length); // 롤백됨
  db.replaceMatches(all.map((m) => (m.id === 'R1-J-VOL-863' ? { ...m, table: 7 } : m)));
  assert.equal(db.listMatches().find((m) => m.id === 'R1-J-VOL-863')?.table, 7);
  conn.prepare("DELETE FROM scores WHERE match_id = 'R1-J-YYE-197'").run();
});
