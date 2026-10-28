import Image from 'next/image';

export default function Hero() {
  return (
    <section className="max-w-[1280px] mx-auto px-6 py-8 sm:py-12">
      <h1 className="sr-only">로보틱스 챌린지 2026</h1>
      <div className="relative w-full aspect-[2.5] rounded-2xl overflow-hidden bg-surface">
        <Image
          src="/images/hero-banner.png"
          alt="로보틱스 챌린지 - YOUTH ROBOTICS CHALLENGE 2026"
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1232px"
          className="object-contain"
        />
      </div>
    </section>
  );
}
