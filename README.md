# SkyRide — 로드 자전거 동호회 강의용 샘플

순수 HTML/CSS/JavaScript + Supabase JS v2로 구성한 샘플입니다.

## 1. 파일
- `index.html` — 화면/모달
- `style.css` — 스카이블루 기반 반응형 디자인
- `app.js` — Supabase Auth + CRUD
- `config.js` — Supabase URL / publishable key
- `supabase.sql` — 접두어 `rc_`를 사용하는 전체 DB/RLS 설정

## 2. Supabase 설정
1. Supabase 프로젝트의 SQL Editor에서 `supabase.sql` 전체 실행
2. Authentication > Providers에서 Email 활성화
3. 이메일 인증을 사용할 경우 Site URL / Redirect URL에 GitHub Pages 주소를 등록
4. 본인 계정을 회원가입
5. SQL Editor에서 본인 계정을 관리자로 지정:
   update public.rc_profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');

## 3. 권한 구조
- 로그인 사용자: 게시판 CRUD(본인 글), 소모임 등록/수정/삭제(본인 등록), 모임 신청/취소
- 관리자: 정기모임 CRUD, 모든 게시글/모임 관리
- 모든 DB 테이블 RLS 활성화
- `service_role` 키는 사용하지 않음

## 4. GitHub Pages
저장소 루트에 파일을 올리고 Settings > Pages에서 Deploy from branch를 선택합니다.
`config.js`가 브라우저에서 로드되므로 publishable/anon 키만 넣어야 합니다.

## 5. 강의에서 설명하기 좋은 포인트
- BaaS 구조
- Supabase Auth
- PostgreSQL
- RLS와 CRUD
- 사용자/관리자 권한 분리
- 순수 JS로 REST API 사용
