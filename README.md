# StayTalk

한국·일본 소형 숙박 사업자를 위한 다국어 AI 응대·예약 에이전트 SaaS (MVP).

> 개발 규칙과 아키텍처는 [CLAUDE.md](./CLAUDE.md)를 참고하세요.

## 요구 사항

- Node.js 22+
- pnpm 10+
- Docker (Docker Compose v2)

## 로컬 실행

```bash
# 1. 의존성 설치 (Prisma Client 생성 포함)
pnpm install

# 2. 환경 변수
cp .env.example .env
# AUTH_SECRET 채우기: openssl rand -base64 32

# 3. Postgres + Mailpit 실행
docker compose up -d

# 4. 마이그레이션 + 샘플 데이터
pnpm db:deploy
pnpm db:seed

# 5. 개발 서버
pnpm dev
```

브라우저에서 http://localhost:3000 을 열면 로그인 화면(`/ko/login`)으로 이동합니다.

### 샘플 계정 (개발 전용)

| 숙소                          | 이메일                  | 비밀번호        |
| ----------------------------- | ----------------------- | --------------- |
| 서촌 한옥 게스트하우스 (서울) | `owner@seoul.example`   | `staytalk-demo` |
| 〃 스태프                     | `staff@seoul.example`   | `staytalk-demo` |
| 博多 ゆらり庵 (후쿠오카)      | `owner@fukuoka.example` | `staytalk-demo` |

이메일 매직링크 로그인도 가능합니다. 로컬 메일은 Mailpit(http://localhost:8025)에서 확인합니다.

## 품질 검사

```bash
pnpm lint
pnpm typecheck
pnpm test        # Postgres 실행 필요 (staytalk_test DB 사용)
pnpm test:e2e    # Playwright. 처음이면: pnpm exec playwright install chromium
```

## 웹 위젯 데모

```bash
pnpm dev          # 앱 (위젯 loader도 함께 빌드)
pnpm demo:host    # 숙소 홈페이지 역할의 정적 페이지 → http://localhost:4173
```

데모 페이지 오른쪽 아래 버튼으로 게스트처럼 대화한 뒤, 대시보드 **인박스**에서 확인·답장할 수 있습니다.
위젯 설치 코드와 허용 도메인은 대시보드 **설정**에서 관리합니다.

## 예약 요청

게스트가 위젯에서 날짜·인원으로 문의하면 AI가 가용성과 예상 요금을 안내하고, 이름·연락처를 받아 **예약 요청**을 만듭니다.
대시보드 **예약 요청** 화면에서 승인/거절하면 게스트에게 자동으로 안내됩니다. 객실 타입·재고·요금은 **객실·재고**에서 관리합니다(CSV 업로드 지원).

대기 중인 요청은 24시간 후 만료됩니다. 로컬에서는 `pnpm job expire-bookings`, 배포 환경에서는 `/api/cron/expire-bookings`(Vercel Cron, `CRON_SECRET`)로 실행됩니다.

## AI 평가 (evals)

```bash
pnpm eval                   # mock 모드 (외부 API 불필요)
pnpm eval --mode=live       # 실제 Claude API (ANTHROPIC_API_KEY 필요, 비용 발생)
pnpm eval --filter=fukuoka  # 케이스 id 부분 일치
```

케이스는 `evals/cases/*.json`, 리포트는 `evals/reports/`에 생성됩니다.

## 주요 환경 변수

`.env.example` 참고. 외부 서비스 없이 개발할 수 있도록 기본값은 `AI_MODE=mock`, `LINE_MODE=mock`입니다.
실제 Claude API를 쓰려면 `AI_MODE=live`와 `ANTHROPIC_API_KEY`를 설정하세요.
