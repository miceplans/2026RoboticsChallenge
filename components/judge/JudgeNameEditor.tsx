'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { renameAccount } from '@/app/login/actions';
import { btnGhost, btnPrimary, inputCls } from '@/components/judge/ui';

// 서명에 찍히는 심판 이름을 심판이 직접 바꾼다.
export default function JudgeNameEditor({ name, id }: { name: string; id: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const err = await renameAccount(value);
      if (err) return setError(err);
      setError('');
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    return (
      <span className="flex items-center gap-2 text-sm text-gray-500">
        {name} ({id})
        <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs font-bold text-gray-600" onClick={() => { setValue(name); setEditing(true); }}>
          이름 변경
        </button>
      </span>
    );
  }

  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <input className={`${inputCls} w-32`} value={value} maxLength={20} autoFocus placeholder="심판 이름" onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className={`${btnPrimary} !px-3 !py-1.5 text-sm`} disabled={pending}>저장</button>
      <button type="button" className={`${btnGhost} !px-3 !py-1.5 text-sm`} onClick={() => { setEditing(false); setError(''); }}>취소</button>
      {error && <span className="text-xs text-error">{error}</span>}
    </form>
  );
}
