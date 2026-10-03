# 인천 온누리교회 장소 사용 현황

교회 홀·방 사용 현황을 **누구나 실시간으로** 보고, **관리자(admin1~3)만** 예약을 등록·수정·삭제하는 웹입니다.

- 홈 `/` : 일 / 주 / 월 보기, 층 필터, 장소 검색, "지금 비어 있는 장소", 실시간 반영
- 관리자 `/admin` : 예약 등록(달력 → 장소 → 시간), 반복 예약, 장소 관리, 변경 이력, 접속 기록, 비밀번호 변경, 엑셀 다운로드
- 중복 예약은 **DB 레벨(EXCLUDE 제약)** 에서 차단, 모든 변경은 **DB 트리거** 가 이력으로 기록
- 예약이 바뀔 때마다 **Google 스프레드시트** 에 자동 반영

**비용 0원**: Supabase Free + Vercel Hobby + Google Sheets API(무료 할당량). 모든 시각은 Asia/Seoul.

## 기술 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Realtime) · Vercel · googleapis · exceljs · vitest

---

## 처음 설정하기 (초보자용 단계별 안내)

### 0. 준비물

- [Node.js](https://nodejs.org) 20 이상, git
- [Supabase CLI](https://supabase.com/docs/guides/cli): `brew install supabase/tap/supabase`
- GitHub 계정, Vercel 계정(GitHub 로 가입), 구글 계정

```bash
git clone https://github.com/tjdals-sudo/onnuri-rooms.git
cd onnuri-rooms
npm install
cp .env.example .env.local
```

### 1. Supabase 프로젝트 만들기

1. https://supabase.com/dashboard → **New project** → 이름 `onnuri-rooms`, Region **Northeast Asia (Seoul)**, DB 비밀번호를 정해서 메모
2. 생성 후 **Project Settings → API** 에서
   - `Project URL` → `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL`
   - `Publishable key` (sb_publishable_…) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `Secret key` (sb_secret_…, "Reveal" 클릭) → `SUPABASE_SECRET_KEY` ← **절대 공개 금지**
3. 터미널에서 프로젝트를 연결하고 스키마를 올립니다.

```bash
supabase login                      # 브라우저로 로그인
supabase link --project-ref <프로젝트 ref>   # ref 는 대시보드 URL 의 20자 문자열
supabase db push                    # supabase/migrations/*.sql 적용 (테이블·제약·트리거·RLS·장소 15곳 seed)
supabase config push                # 공개 회원가입 차단 등 인증 설정 반영 (supabase/config.toml)
```

> 이미 운영 중인 프로젝트(ref `kpwxddwxlfujfjizwfwd`)가 있다면 1~2단계는 건너뛰고 `.env.local` 값만 받아서 쓰면 됩니다.

### 2. 환경변수 채우기 (`.env.local`)

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개 키 (브라우저에 노출돼도 되는 키) |
| `SUPABASE_SECRET_KEY` | 서버 전용 비밀 키 (시트 동기화 상태 기록, Cron, 관리자 생성 스크립트) |
| `ADMIN_ID_DOMAIN` | 아이디 → 내부 이메일 변환용 도메인. 기본 `onnuri-incheon.local` |
| `ADMIN1_PASSWORD` ~ `ADMIN3_PASSWORD` | 관리자 초기 비밀번호 (8자 이상). 계정 생성 때 1회 사용 |
| `GOOGLE_APPS_SCRIPT_URL` | (5-A) Apps Script 웹 앱 URL |
| `GOOGLE_APPS_SCRIPT_SECRET` | (5-A) `Code.gs` 의 SECRET 과 같은 값 |
| `GOOGLE_SHEET_ID` | (5-B) 스프레드시트 URL 의 `/d/` 와 `/edit` 사이 문자열 |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | (5-B) 서비스 계정 키 JSON 을 base64 로 인코딩한 값 |
| `CRON_SECRET` | Vercel Cron 호출 보호용 아무 긴 문자열 |
| `TEST_ADMIN_LOGIN_ID`, `TEST_ADMIN_PASSWORD` | 통합 테스트용 (선택) |

### 3. 관리자 3계정 만들기

`.env.local` 에 `ADMIN1_PASSWORD`~`ADMIN3_PASSWORD` 를 넣고:

```bash
npm run create-admins
# 비밀번호를 다시 설정하려면: npx tsx scripts/create-admins.ts --reset-password
```

- 아이디는 `admin1`, `admin2`, `admin3` 세 개뿐이고 회원가입 화면은 없습니다.
- 내부적으로 `admin1@onnuri-incheon.local` 형식의 이메일로 저장되지만 화면에는 아이디만 보입니다.
- 로그인 후 **내 계정** 메뉴에서 각자 비밀번호를 바꾸세요.

### 4. 로컬에서 실행

```bash
npm run dev
# http://localhost:3000        → 사용 현황(누구나)
# http://localhost:3000/admin  → 관리자 로그인
```

### 5. Google 스프레드시트 연동 (개인 구글 계정 권장)

두 가지 방식 중 **하나만** 설정하면 됩니다. 둘 다 있으면 Apps Script 를 씁니다.

#### 5-A. Apps Script 방식 (쉬움, 추천)

Google Cloud 콘솔 없이 스프레드시트 안에서 끝납니다.

1. 구글 드라이브에서 **새 스프레드시트** 를 만듭니다(이름 예: `장소 예약 현황`).
2. 메뉴 **확장 프로그램 → Apps Script** 를 엽니다.
3. 편집기에 있는 내용을 모두 지우고, 이 저장소의 `google-apps-script/Code.gs` 내용을 통째로 붙여 넣습니다.
   맨 위 `var SECRET = "..."` 값은 서버의 `GOOGLE_APPS_SCRIPT_SECRET` 과 같아야 합니다.
4. 저장(⌘S) → 오른쪽 위 **배포 → 새 배포** → 유형 선택(톱니바퀴)에서 **웹 앱**
   - 다음 사용자 인증 정보로 실행: **나**
   - 액세스 권한이 있는 사용자: **모든 사용자**
5. **배포** → 처음 한 번 권한 허용(「고급 → (프로젝트 이름)(으)로 이동」을 눌러야 할 수 있음)
6. 표시된 **웹 앱 URL**(`https://script.google.com/macros/s/…/exec`)을 복사해 `GOOGLE_APPS_SCRIPT_URL` 에 넣습니다.
7. 브라우저로 그 URL 을 열어 `{"ok":true,...}` 가 보이면 준비 완료. 관리자 화면 배너의 **시트 다시 동기화** 를 누릅니다.

코드를 고친 뒤에는 **배포 → 배포 관리 → 연필 아이콘 → 버전: 새 버전 → 배포** 를 해야 반영됩니다(URL 은 그대로).

#### 5-B. 서비스 계정 방식 (Google Cloud 콘솔 사용)


1. https://console.cloud.google.com → 새 프로젝트(예: `onnuri-rooms`)
2. **API 및 서비스 → 라이브러리** 에서 **Google Sheets API** 사용 설정
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → 서비스 계정** 생성 (역할은 없어도 됨)
4. 만든 서비스 계정 → **키** 탭 → **키 추가 → JSON** → 파일 다운로드
5. 터미널에서 base64 로 변환해 `.env.local` 의 `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` 에 붙여넣기

   ```bash
   base64 -i ~/Downloads/<키파일>.json | tr -d '\n'
   ```

6. 구글 드라이브에서 **새 스프레드시트** 를 만들고(이름 예: `장소 예약 현황`), **공유** 버튼 → 서비스 계정 이메일(`xxx@xxx.iam.gserviceaccount.com`)을 **편집자** 로 추가
7. 스프레드시트 URL 의 ID 를 `GOOGLE_SHEET_ID` 에 입력
8. 관리자 화면 상단 배너의 **시트 다시 동기화** 를 누르면 `YYYY-MM` 월 탭과 `변경이력` 탭이 만들어집니다.

동작 방식(두 방식 공통): 예약·장소가 바뀔 때마다 영향받은 월 탭 전체를 DB 기준으로 다시 씁니다(헤더 고정, 층별 행 색). 실패하면 관리자 화면에 빨간 배너가 뜨고, 매일 새벽 5시 Cron 이 이번 달을 다시 동기화합니다. 환경변수를 비워 두면 시트 연동만 건너뛰고 나머지는 정상 동작합니다.

### 6. Vercel 배포

> 현재 운영 주소: **https://onnuri-rooms.vercel.app** (Vercel 프로젝트 `onnuri-rooms`, 계정 tjdals-sudo). 아래는 처음부터 다시 배포할 때의 안내입니다.


1. 이 저장소를 본인 GitHub 에 올립니다(이미 올라가 있다면 생략).
2. https://vercel.com → **Add New → Project** → GitHub 저장소 import (Framework: Next.js 자동 인식)
3. **Environment Variables** 에 `.env.local` 의 값을 모두 입력 (`TEST_*` 는 제외해도 됨)
4. **Deploy** → 발급된 주소(예: `https://onnuri-rooms.vercel.app`)로 접속
5. Supabase 대시보드 **Authentication → URL Configuration** 의 Site URL 을 배포 주소로 바꾸거나, `supabase/config.toml` 의 `site_url` 을 수정하고 `supabase config push`
6. `vercel.json` 의 Cron(`/api/keepalive`, 매일 UTC 20:00 = KST 05:00)은 자동 등록됩니다. Supabase 무료 프로젝트는 7일간 요청이 없으면 일시정지되는데, 이 Cron 이 매일 DB 를 깨워 둡니다.

이후에는 `main` 브랜치에 push 할 때마다 자동 배포됩니다.

---

## 데이터 구조 (Supabase)

| 테이블 | 내용 |
| --- | --- |
| `admins` | 관리자(user_id, login_id admin1~3) |
| `rooms` | 장소(층, 이름, 수용 인원, 좌석 형태, 정렬, 활성 여부) — 삭제 대신 숨김 |
| `reservations` | 예약. `EXCLUDE USING gist (room_id WITH =, tstzrange(start_at,end_at,'[)') WITH &&)` 로 겹침 차단 |
| `audit_logs` | 변경 이력(누가·언제·무엇을·변경 전/후 jsonb). 트리거가 기록, 수정·삭제 불가 |
| `login_logs` | 관리자 로그인/로그아웃 |
| `sheet_sync_status` | 시트 동기화 상태 |
| `reservations_public` (뷰) | 연락처·담당자·메모를 뺀 공개용 |

- 비로그인은 `rooms` 와 `reservations_public` 만 조회. 쓰기와 이력 조회는 관리자만(RLS).
- 실시간: 트리거가 `realtime.send()` 로 공개 채널 `rooms-public` 에 "바뀌었다" 신호만 보내고, 화면이 다시 조회합니다(개인정보가 실시간 페이로드로 새지 않음).
- 반복 예약: `preview_recurring` / `create_recurring` / `update_recurring_from` / `delete_recurring_from` 함수.

## 테스트

```bash
npm run typecheck   # 타입 검사
npm run lint        # ESLint
npm test            # 단위 테스트 (시간 유틸: 자정 넘김, 24:00 표시, 주/월 계산)
npm run test:db     # 통합 테스트 (원격 Supabase, .env.local 의 TEST_ADMIN_* 필요)
```

통합 테스트가 확인하는 것: 1분 겹침 거부·맞닿은 예약 허용, 자정 넘김 예약 충돌, 반복 예약 충돌 미리보기·건너뛰기·이후 전체 수정/삭제, 이력 트리거 누락 없음·이력 불변, 비로그인 RLS, 접속 기록, 실시간 신호 수신. 테스트 데이터는 2031년에 `[TEST]` 접두사로 만들고 끝나면 지웁니다.

## 폴더 구조

```
app/                 페이지 (홈, admin/login, admin/(protected)/{예약,rooms,history,access,account}, api/{export,keepalive})
components/public/   일/주/월 뷰, 모바일 카드, 빈 장소 패널
components/admin/    예약 관리(달력·장소·슬롯·폼·목록), 장소 관리, 내비, 시트 배너
lib/                 time(서울 시간 유틸), sheets(구글 시트: Apps Script/서비스 계정), excel, audit-format, actions/(서버 액션), supabase/
google-apps-script/  스프레드시트에 붙여 넣는 Code.gs
supabase/migrations/ DB 스키마 (테이블·제약·트리거·RLS·seed)
scripts/             create-admins.ts
tests/               vitest
proxy.ts             /admin 보호 (Next 16 의 middleware)
```

## 운영 팁

- 장소를 없애야 하면 **숨기기** 를 쓰세요. 과거 예약과 이력이 보존됩니다.
- 반복 예약을 수정·삭제할 때 "이 건만 / 이후 전체" 를 고를 수 있습니다.
- 엑셀 백업: 관리자 예약 화면의 **엑셀 다운로드** (월별 .xlsx).
- 비밀번호를 잊으면 `.env.local` 에 새 비밀번호를 넣고 `npx tsx scripts/create-admins.ts --reset-password`.
