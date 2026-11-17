'use client';

// 축하 폭죽(색종이). 의존성 없이 캔버스를 잠깐 띄우고 스스로 제거한다.
// target 을 주면 그 요소 안에서만 터진다(요소 중심에서 사방으로, 요소 주변 영역에만 그려짐). 없으면 화면 전체.
const COLORS = ['#258EED', '#FF6B6B', '#FFD93D', '#6BCB77', '#B983FF', '#FF9F45'];

type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string };

export function fireConfetti(target?: Element | null, durationMs = 2200) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = window.devicePixelRatio || 1;
  // 요소 사각형 + 사방 여백. 요소가 없으면 화면 전체.
  const PAD = 70;
  const r = target?.getBoundingClientRect();
  const box = r ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  Object.assign(canvas.style, { position: 'fixed', left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, pointerEvents: 'none', zIndex: '9999' });
  canvas.width = box.w * dpr;
  canvas.height = box.h * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const W = box.w;
  const H = box.h;
  const local = Boolean(r);
  // 요소 중심에서 사방으로 터진다. 전체 화면이면 양쪽 아래 모서리에서 위로 쏜다.
  const pieces: Piece[] = Array.from({ length: local ? 90 : 160 }, (_, i) => {
    const left = i % 2 === 0;
    const angle = local ? Math.random() * Math.PI * 2 : (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.6;
    const speed = local ? 3 + Math.random() * 6 : 12 + Math.random() * 10;
    return {
      x: local ? W / 2 : left ? W * 0.1 : W * 0.9,
      y: local ? H / 2 : H * 0.85,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (local ? 2 : 0),
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();
  const tick = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    const fade = Math.max(0, Math.min(1, (durationMs - t) / 700));
    for (const p of pieces) {
      p.vy += local ? 0.18 : 0.35; // 중력
      p.vx *= local ? 0.97 : 0.99;
      p.vy *= local ? 0.99 : 1;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < durationMs) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
