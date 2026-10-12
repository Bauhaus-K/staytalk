# StayTalk 배포 가이드 (Vercel + Neon / Supabase)

MVP 운영 환경 구성을 위한 체크리스트입니다. 로컬 개발은 README를 참고하세요.

## 1. 데이터베이스 (PostgreSQL 16)

Neon 또는 Supabase에서 Postgres 16 프로젝트를 만듭니다. 마이그레이션이 두 확장을 생성합니다.

| 확장      | 용도                  | Neon | Supabase                                         |
| --------- | --------------------- | ---- | ------------------------------------------------ |
| `pg_trgm` | 지식 검색(트라이그램) | 지원 | 지원                                             |
| `vector`  | 임베딩 검색(선택)     | 지원 | 지원 (`extensions` 스키마 권장, `public`도 동작) |

연결 문자열은 두 가지를 준비합니다.

- **`DATABASE_URL`**: 앱 런타임용 **풀링** 연결
  - Neon: `-pooler`가 붙은 호스트
  - Supabase: Transaction pooler, 포트 6543
- **`MIGRATE_DATABASE_URL`**: 마이그레이션용 **직접** 연결
  - Neon: pooler 없는 호스트
  - Supabase: Session/Direct 연결, 포트 5432

`prisma.config.ts`는 `MIGRATE_DATABASE_URL`이 있으면 CLI에서 그 값을 씁니다.

## 2. Vercel 프로젝트

- Framework: Next.js / Node.js 22 / Package manager: pnpm
- **Build Command**: `pnpm db:deploy && pnpm build`
  - `build`에 위젯 loader 빌드(`pnpm widget:build`)가 포함되어 있습니다.
  - 마이그레이션은 빌드 시 `MIGRATE_DATABASE_URL`로 실행됩니다.
- **Install Command**: `pnpm install` (postinstall에서 Prisma Client 생성)
- Function 최대 실행 시간: 위젯 메시지 API와 LINE 웹훅은 `maxDuration = 60`으로 선언되어 있습니다(에이전트 타임아웃 30초 + 번역). 사용하는 플랜에서 60초 이상이 허용되는지 확인하세요.

## 3. 환경 변수

| 변수                                              | 필수 | 설명                                                                                                                       |
| ------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                         | ✓    | 서비스 URL (예: `https://app.staytalk.example`). 위젯 Origin 검사, 메일 링크, 설치 코드에 사용                             |
| `DATABASE_URL`                                    | ✓    | 풀링 연결                                                                                                                  |
| `MIGRATE_DATABASE_URL`                            | ✓    | 직접 연결 (마이그레이션 전용)                                                                                              |
| `AUTH_SECRET`                                     | ✓    | `openssl rand -base64 32` — 로그인 세션과 위젯 세션 토큰 서명                                                              |
| `AUTH_TRUST_HOST`                                 | ✓    | `true`                                                                                                                     |
| `EMAIL_SERVER`                                    | ✓    | SMTP URL. 예: Resend `smtps://resend:<API_KEY>@smtp.resend.com:465`                                                        |
| `EMAIL_FROM`                                      | ✓    | 발신 주소 (도메인 SPF/DKIM 설정 필요)                                                                                      |
| `AI_MODE`                                         | ✓    | `live`                                                                                                                     |
| `ANTHROPIC_API_KEY`                               | ✓    | Claude API 키                                                                                                              |
| `AI_MODEL_MAIN` / `AI_MODEL_FAST`                 |      | 기본 `claude-sonnet-5-5` / `claude-haiku-5-5`                                                                              |
| `AI_EFFORT`, `AI_MAX_TOOL_CALLS`, `AI_TIMEOUT_MS` |      | 기본 `medium` / 6 / 30000                                                                                                  |
| `CRON_SECRET`                                     | ✓    | `openssl rand -hex 32` — Vercel Cron이 `Authorization: Bearer`로 전송                                                      |
| `APP_ENCRYPTION_KEY`                              | ✓    | `openssl rand -base64 32` — LINE 자격 증명 암호화. **분실하면 저장된 자격 증명을 복호화할 수 없으니 안전하게 보관하세요.** |
| `LINE_MODE`                                       |      | `live` (실제 LINE API 호출)                                                                                                |
| `RETENTION_DAYS`                                  |      | 대화 로그 마스킹 기간, 기본 90                                                                                             |
| `EMBEDDING_PROVIDER`                              |      | 기본 `none`. `voyage` 사용 시 `VOYAGE_API_KEY` 필요 (아래 6절 참고)                                                        |

## 4. 배치 작업 (Vercel Cron)

`vercel.json`에 정의되어 있습니다. 경로는 `/api/cron/<job>`입니다.

| 작업                       | 주기           | 내용                                                |
| -------------------------- | -------------- | --------------------------------------------------- |
| `expire-bookings`          | 15분           | 기한이 지난 PENDING 예약 요청 만료 + 게스트 안내    |
| `close-idle-conversations` | 1시간          | 24시간 무응답 AI 대화를 종료(자동 처리율 집계 기준) |
| `mask-old-conversations`   | 매일 03:30 UTC | 보존 기간이 지난 대화·예약의 개인정보 마스킹        |

> Vercel Hobby 플랜은 Cron이 하루 1회로 제한됩니다. 15분·1시간 주기는 Pro 이상이 필요합니다.
> 수동 실행: `curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/expire-bookings`

## 5. 첫 계정과 숙소 만들기

가입 화면이 없으므로 운영자가 사업자와 사장 계정을 만듭니다.

```bash
DATABASE_URL=<직접 연결> pnpm admin:create-owner --org "서촌스테이" --email owner@example.com --name "김민지" --locale ko
```

비밀번호를 주지 않으면 사장은 이메일 매직링크로 로그인합니다. 로그인 후 **숙소 설정** 마법사에서 숙소 → 객실 → 지식 → 위젯 설치 순서로 진행합니다.

**허용 도메인**에 숙소 홈페이지 주소를 꼭 등록하세요. 등록하지 않으면 위젯 창이 열리지 않습니다.

## 6. 외부 서비스와 개인정보

운영 전 개인정보처리방침(`/legal/privacy`, 현재 TODO 자리)에 아래 처리 위탁·국외 이전 내용을 반영해야 합니다.

- **Anthropic** (Claude API): 게스트 메시지(카드·여권번호 마스킹 후), 지식베이스
- **이메일 발송 사업자** (예: Resend): 스태프 이메일 주소, 에스컬레이션 요약
- **LINE** (LINE 채널 사용 시)
- **Voyage AI** (`EMBEDDING_PROVIDER=voyage` 사용 시에만): 지식베이스 텍스트, 검색 질의

## 7. LINE 연결

1. LINE Developers 콘솔에서 Messaging API 채널을 만듭니다.
2. 대시보드 **설정 → LINE 공식 계정**에 채널 ID·채널 시크릿·액세스 토큰(장기)을 입력하고, 표시되는 웹훅 URL을 복사합니다.
3. LINE Developers 콘솔에서 Webhook URL을 등록하고 **Use webhook**을 켠 뒤 Verify를 누릅니다(200 응답).
4. LINE Official Account Manager에서 **자동 응답 메시지**를 끕니다(AI 응답과 중복되지 않도록).
5. 환경 변수 `LINE_MODE=live`를 설정합니다.

## 8. 운영 전 점검 목록

- [ ] `pnpm eval --mode=live`로 실제 모델 eval을 실행하고 결과를 검토(비용 발생)
- [ ] 메일 발송 도메인 인증(SPF/DKIM), 매직링크 수신 확인
- [ ] 숙소별 월 토큰 한도(`Property.monthlyTokenLimit`) 설정
- [ ] 이용약관·개인정보처리방침 정식 문안 반영
- [ ] 여러 인스턴스로 운영한다면 요청 빈도 제한을 공유 저장소(Upstash Redis 등)로 교체 (`src/server/security/rate-limit.ts`의 `RateLimiter` 인터페이스)
- [ ] DB 백업·PITR 설정 (Neon/Supabase 기본 기능)
- [ ] 오류 모니터링 연결 (예: Sentry, Vercel Log Drains)
