'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { refreshContest, useContest } from '@/lib/contest';
import { adminFetch, btnPrimary, card } from './shared';

export default function SettingsPanel() {
  const toast = useToast();
  const { config, loaded } = useContest();
  const [flags, setFlags] = useState({ autoConfirm: true, boardPublic: true, hideScores: false });
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setFlags({
      autoConfirm: config?.settings.autoConfirm ?? true,
      boardPublic: config?.settings.boardPublic ?? true,
      hideScores: false,
    });
    setNotice(config?.settings.notice.message ?? '');
    adminFetch<{ settings: { hideScores: boolean } }>('/admin/settings')
      .then((d) => {
        setFlags((f) => ({ ...f, hideScores: d.settings.hideScores }));
      })
      .catch(() => {});
  }, [loaded, config]);

  const items: { key: keyof typeof flags; label: string; hint: string }[] = [
    { key: 'autoConfirm', label: '자동 확정', hint: '서명 완료 즉시 순위에 반영합니다. 끄면 관리자 확정이 필요합니다.' },
    { key: 'boardPublic', label: '보드 공개', hint: '순위판을 로그인한 모든 참가자에게 공개합니다. 끄면 관리자만 봅니다.' },
    { key: 'hideScores', label: '점수 가리기', hint: '참가자의 내 점수표 탭 조회를 막습니다.' },
  ];

  const save = async () => {
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { autoConfirm: flags.autoConfirm, boardPublic: flags.boardPublic, hideScores: flags.hideScores, notice: { message: notice } } });
      setDirty(false);
      toast('설정을 저장했습니다. 접속 중인 화면에 즉시 반영됩니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">설정</h1>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-medium">공지</span>
          <textarea value={notice} onChange={(e) => { setNotice(e.target.value); setDirty(true); }} className="mt-2 h-24 w-full rounded-lg border border-line bg-white p-3 text-sm" placeholder="참가자 화면 상단에 표시할 공지 (비우면 숨김)" />
        </label>
        {items.map(({ key, label, hint }) => (
          <label key={label} className="flex cursor-pointer items-center justify-between gap-4 pt-4 text-sm">
            <span>
              {label}
              <span className="mt-0.5 block text-xs text-gray-400">{hint}</span>
            </span>
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-accent"
              checked={flags[key]}
              onChange={() => { setFlags((f) => ({ ...f, [key]: !f[key] })); setDirty(true); }}
            />
          </label>
        ))}
      </div>
      <button className={`${btnPrimary} mt-6 disabled:opacity-40`} disabled={!dirty} onClick={save}>{dirty ? '저장' : '저장됨'}</button>
    </section>
  );
}
