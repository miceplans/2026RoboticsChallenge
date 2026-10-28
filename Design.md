# Design.md

전국민 AI 경진대회 브랜드 기반 디자인 가이드.
Accent 컬러는 공식 로고, 폰트는 Paperlogy, 나머지 값은 aichallenge4all.or.kr 실제 적용 스타일에서 추출.

---

## 1. 디자인 원칙

- **밝고 가볍게**: 흰 배경 위에 블루 하나만 강조색으로 쓴다.
- **둥글게**: 카드 16px, 버튼 16px, 상태 칩은 완전한 pill.
- **그림자 대신 선**: 구분은 1px 보더로 하고, 그림자는 모달·오버레이에만 쓴다.
- **굵은 제목, 차분한 본문**: 제목 800, 본문 400~500으로 위계를 만든다.

---

## 2. Color

### Accent (로고 블루)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--accent` | `#258EED` (hsl 209 85% 54%) | 링크, 포커스, 주요 버튼, 강조 텍스트 |
| `--accent-soft` | `#4AADF7` | 상태 칩 "접수중" 배경, 밝은 강조 |
| `--accent-tint` | `#258EED` 10% 투명도 | 선택 배경, 뱃지 배경 |

> 사이트 CSS의 `--primary` 값 기준이다. 로고 파일에서 스포이드로 뽑은 HEX가 다르면 `--accent`만 교체하면 된다.

### Neutral

| 토큰 | 값 | 용도 |
|---|---|---|
| `--background` | `#FFFFFF` | 페이지 배경 |
| `--surface` | `#F9FAFB` | 섹션 배경 |
| `--surface-secondary` | `#F3F4F6` | 카드·인풋 배경, 비활성 영역 |
| `--surface-tertiary` | `#E5E7EB` | 구분 영역, 스켈레톤 |
| `--border` | `#DDE2E9` | 기본 1px 보더 |
| `--border-hover` | `#B8C0CC` | 호버 보더 |
| `--text-primary` | `#171717` | 본문 |
| `--text-heading` | `#111827` | 제목 |
| `--text-secondary` | `#666666` | 보조 텍스트 |
| `--text-muted` | `#6B7280` | 비활성 칩 텍스트, 메타 정보 |
| `--text-tertiary` | `#9E9E9E` | 플레이스홀더, 캡션 |

### Semantic

| 토큰 | 값 |
|---|---|
| `--success` | `#258EED` (accent와 동일) |
| `--warning` | `#FF9500` |
| `--error` | `#FF3B3B` |

### Overlay

- 이미지 위 텍스트용 그라디언트: `linear-gradient(to top, rgba(0,0,0,.75) 0, rgba(0,0,0,.25) 50%, rgba(0,0,0,.1) 100%)`
- 딤 배경: `rgba(0,0,0,.6)`
- 글래스 버튼(어두운 배경 위): `rgba(255,255,255,.15)`

---

## 3. Typography

**Font family**

```css
--font-sans: "Paperlogy", "Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono: "SF Mono", "JetBrains Mono", monospace;
```

Paperlogy는 weight 100~900을 모두 로드해서 쓴다.

| 역할 | 크기 / 행간 | Weight | 비고 |
|---|---|---|---|
| Section title (h2) | 30px / 37.5px | 800 | 색 `--text-heading` |
| Nav / 헤더 링크 | 15px | 600 | |
| 칩·필터 | 17px | 600 | |
| 버튼 | 14px | 500~700 | |
| Body | 16px / 24px | 400 | 색 `--text-primary` |
| Caption | 12~14px | 400~500 | 색 `--text-tertiary` |

- 자간은 기본값(`normal`)을 쓴다. 한글은 자간을 건드리지 않는다.
- 제목에는 `word-break: keep-all`을 적용한다.

---

## 4. Spacing

| 토큰 | 값 |
|---|---|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-2xl` | 48px |
| `--space-3xl` | 64px |
| `--space-4xl` | 96px |

- 섹션 상하 패딩은 40px 이상으로 한다.
- 헤더 높이는 73px, 상단 고정, 하단에 1px 보더를 둔다.

---

## 5. Radius

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-sm` | 8px | 인풋, 작은 뱃지 |
| `--radius-md` | 12px | 작은 카드 |
| `--radius-lg` | 16px | **기본**: 카드, 버튼, 모달 |
| `--radius-xl` | 24px | 큰 카드, 히어로 블록 |
| `--radius-2xl` | 32px | 강조 패널 |
| `--radius-full` | 9999px | 상태 칩, 필터 |

---

## 6. Elevation & Motion

- 기본 카드는 그림자 없이 `1px solid var(--border)`로 구분한다.
- 모달/팝업만 `0 8px 40px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.15)`를 쓴다.
- 트랜지션은 `.15s ease`(fast), `.2s ease`(base), `.3s ease`(slow)로 통일한다.

---

## 7. Components

### Button

| 변형 | 배경 | 텍스트 | 보더 |
|---|---|---|---|
| Primary | `--accent` | `#FFF` | 없음 |
| Secondary | `#FFF` | `--text-heading` | `--border` |
| Ghost on dark | `rgba(255,255,255,.15)` | `#FFF` | 없음 |

공통: 높이 40px, 패딩 `10px 16px`, radius 16px, 폰트 14px / 600.

### Status Chip (pill)

높이 약 40px, 패딩 `6px 16px`, 17px / 600, radius full.

| 상태 | 배경 | 텍스트 | 보더 |
|---|---|---|---|
| 접수중 (active) | `--accent-soft` | `#FFF` | 없음 |
| 진행중 / 준비중 / 종료 | `#FFF` | `--text-muted` | 1px `--border` |

### Card

- 배경 `#FFF`, radius 16px, 패딩은 내용에 맞춰 0~24px.
- 썸네일은 카드 상단에 꽉 채우고, 이미지 위 텍스트는 오버레이 그라디언트를 쓴다.
- 호버 시 보더를 `--border-hover`로 바꾸고 `.2s ease`로 전환한다.

### Header

- 흰 배경, 73px, 로고 좌측, 메뉴는 15px / 600.
- 하단 1px `--border`, 그림자 없음.

---

## 8. Layout

- 섹션 순서: 히어로(영상) → 핵심 지표 → 대회 목록(상태 필터) → 아카이브 → 사례 → 소셜 → 소식 → 파트너 로고 마퀴 → 푸터.
- 섹션 제목은 h2(30px / 800) 하나에 "전체보기" 링크를 우측에 붙인다.
- 지표 숫자는 카운트업 애니메이션으로 보여준다.
- 파트너 로고는 가로 무한 스크롤로 보여준다.

---

## 9. 로고 사용

- 로고: 파란 "AI"와 "전국민 / 경진대회" 워드마크, 서브카피 "AI Challenge for All".
- 흰 배경에서만 컬러 로고를 쓴다. 어두운 배경에서는 흰색 단색 버전으로 바꾼다.
- 로고 주변에는 로고 높이의 50% 이상 여백을 둔다.
