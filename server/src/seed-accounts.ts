// 기본 계정(팀별 1개 · 관리자 2 · 심판 REF01~REF16)을 만들고, 이미 있는 계정은 비밀번호를 기본값으로 되돌린다.
// 사용: pnpm seed:accounts
import { DEFAULT_PASSWORD, seedDefaultAccounts, seedIfEmpty } from './db.ts';

seedIfEmpty();
const r = seedDefaultAccounts(true);
console.log(`created ${r.created}, reset ${r.reset} (password: ${DEFAULT_PASSWORD})`);
