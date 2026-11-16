'use client';

// 축하 스프링클(색종이). 의존성 없이 전체 화면 캔버스에 잠깐 뿌리고 스스로 제거한다.
const COLORS = ['#258EED', '#FF6B6B', '#FFD93D', '#6BCB77', '#B983FF', '#FF9F45'];

type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string };

export function fireConfetti(durationMs = 3200) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '9999' });
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  // 양쪽 아래 모서리에서 위로 쏘아 올린다
  const pieces: Piece[] = Array.from({ length: 160 }, (_, i) => {
    const left = i % 2 === 0;
    const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.6;
    const speed = 12 + Math.random() * 10;
    return {
      x: left ? W * 0.1 : W * 0.9,
      y: H * 0.85,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();
  const tick = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    const fade = Math.max(0, Math.min(1, (durationMs - t) / 800));
    for (const p of pieces) {
      p.vy += 0.35; // 중력
      p.vx *= 0.99;
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
