'use client';

import { useRef, useState } from 'react';
import type { Match, Team } from '@/lib/judge/data';
import { calc } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';
import SignaturePad, { type PadHandle } from './SignaturePad';
import { btnGhost, btnPrimary, inputCls } from './ui';

const OTHER = '__other__';

type Props = {
  match: Match;
  team: Team;
  sheet: Sheet;
  judgeName: string;
  step: 0 | 1;
  onRefSigned: (patch: Partial<Sheet>) => void;
  onFinish: (patch: Partial<Sheet>) => void;
  onBack: () => void;
};

export default function SignView({ match, team, sheet, judgeName, step, onRefSigned, onFinish, onBack }: Props) {
  const pad = useRef<PadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [signer, setSigner] = useState(team.members[0]);
  const [custom, setCustom] = useState('');
  const [exception, setException] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const total = calc(sheet.values, match.cat).total;

  const next = () => {
    const img = pad.current!.toDataURL();
    if (step === 0) {
      setHasInk(false);
      onRefSigned({ refSig: img, refSignedAt: Date.now() });
      return;
    }
    const name = signer === OTHER ? custom.trim() : signer;
    if (!name) return setError('대표 이름을 입력해 주세요.');
    onFinish({ teamSig: img, teamSigner: name, teamSignedAt: Date.now() });
  };

  const finishWithException = () => {
    if (!reason.trim()) return setError('서명 예외 사유를 입력해 주세요.');
    onFinish({ signException: reason.trim(), teamSig: undefined, teamSigner: undefined, teamSignedAt: undefined });
  };

  const stepCls = (i: number) => (step === i ? 'bg-accent text-white' : step > i ? 'bg-accent/10 text-accent' : 'bg-surface-secondary text-gray-500');

  return (
    <main className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-6">
      <div className="grid grid-cols-2 gap-2 text-center text-sm font-bold">
        <b className={`rounded-xl p-3 ${stepCls(0)}`}>① 심판 서명</b>
        <b className={`rounded-xl p-3 ${stepCls(1)}`}>② 참가팀 대표 서명</b>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[300px_1fr]">
        <div>
          <p className="text-sm text-gray-500">{team.id} {team.name} · {match.round}차</p>
          <p className="my-3 text-6xl font-extrabold">{total}<span className="text-xl">점</span></p>
          <p className="text-sm text-gray-500">
            {step === 0 ? `${judgeName} 님, 점수를 확인했으면 오른쪽에 서명해 주세요.` : '참가팀 대표 이름을 고르고 서명해 주세요.'}
          </p>

          {step === 1 && (
            <>
              <select className={`${inputCls} mt-3 w-full`} value={signer} onChange={(e) => setSigner(e.target.value)}>
                {team.members.map((m) => <option key={m}>{m}</option>)}
                <option value={OTHER}>직접 입력</option>
              </select>
              {signer === OTHER && (
                <input className={`${inputCls} mt-2 w-full`} placeholder="이름 직접 입력" value={custom} onChange={(e) => setCustom(e.target.value)} />
              )}
              {sheet.refSig && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500">심판 서명 완료</p>
                  <img src={sheet.refSig} alt="심판 서명" className="mt-1 h-[70px] rounded-lg border border-line bg-white" />
                </div>
              )}
            </>
          )}
        </div>

        <div>
          {exception ? (
            <div className="rounded-2xl border border-error/30 bg-error/5 p-5">
              <p className="font-bold text-error">서명 예외 처리</p>
              <p className="mt-1 text-sm text-gray-600">참가팀 대표가 서명할 수 없는 경우에만 사용하세요. 사유는 기록에 남습니다.</p>
              <input className={`${inputCls} mt-3 w-full`} placeholder="사유 (예: 참가팀 대표 부재)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="mt-3 flex gap-2">
                <button type="button" className={btnGhost} onClick={() => { setException(false); setError(''); }}>취소</button>
                <button type="button" className={`${btnPrimary} bg-error`} onClick={finishWithException}>예외 처리하고 전달</button>
              </div>
            </div>
          ) : (
            <>
              {/* step 이 바뀌면 패드를 새로 만들어 서명이 지워지게 한다 */}
              <SignaturePad key={step} ref={pad} onInk={setHasInk} />
              <div className="mt-3 flex gap-2">
                <button type="button" className={btnGhost} onClick={() => pad.current?.clear()}>지우기</button>
                <span className="flex-1" />
                {step === 1 && (
                  <button type="button" className={`${btnGhost} text-error`} onClick={() => { setException(true); setError(''); }}>서명 예외</button>
                )}
                <button type="button" className={btnPrimary} disabled={!hasInk} onClick={next}>
                  {step === 0 ? '다음' : '완료 · 관리자에게 전달'}
                </button>
              </div>
            </>
          )}
          {error && <p className="mt-2 text-sm text-error">{error}</p>}
        </div>
      </div>

      <button type="button" className="mt-6 text-sm font-bold" onClick={onBack}>← 확인 화면으로</button>
    </main>
  );
}
