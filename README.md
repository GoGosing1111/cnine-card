# 씨켓몬 CNINE Card V2.0.1

V1의 UI와 카드 이미지 376장을 유지하면서 Cloudflare Pages Functions + D1 운영 구조로 정리한 버전입니다.

## 이번 버전 핵심

- D1 콘솔에 SQL을 복사할 필요 없음
- `/setup/` 설치 화면에서 테이블과 기본 데이터를 자동 생성
- 최초 OWNER 계정 자동 생성
- 사용자 가입/개인키 로그인/세션을 D1에 저장
- 코인, 출석, 보유 카드, 중복 수량, 뽑기 기록을 D1에 저장
- 뽑기 결과와 코인 차감을 서버에서 처리
- 카드 등급 점수 합산 전체 랭킹
- `/admin/` 카드명·등급·초점 수정 CMS
- 관리자 수정 기록 저장

## 배포 전 Cloudflare 설정

Pages 프로젝트 `cnine-card`에서 다음 두 항목만 확인합니다.

### 1. D1 바인딩

Settings → Bindings

- Variable name: `DB`
- D1 database: `cnine-card-db`

### 2. 설치 암호 환경 변수

Settings → Variables and Secrets → Add

- Variable name: `SETUP_KEY`
- Value: 본인만 아는 긴 암호
- Production에 적용

예: `cnine-v2-setup-본인만아는문자열`

## 설치 순서

1. 이 압축 파일 내용을 GitHub `GoGosing1111/cnine-card` 저장소에 덮어쓰기
2. Git push 후 Cloudflare Pages 배포 완료 대기
3. `https://cnine-card.pages.dev/setup/` 접속
4. Cloudflare에 등록한 `SETUP_KEY`와 최고 관리자 닉네임 입력
5. `V2 데이터베이스 초기화` 클릭
6. 화면에 한 번만 표시되는 OWNER 개인키 저장
7. `/admin/`에서 OWNER 개인키로 관리자 기능 사용

## 주요 경로

- 게임: `/`
- 최초 설치: `/setup/`
- 관리자 CMS: `/admin/`
- API 상태: `/api/health`

## DB 수동 확인용

`database/schema_v2.sql`은 구조 확인과 비상용 수동 생성 파일입니다. 정상 설치에서는 실행할 필요가 없습니다.

## 테스트 지급량

- 일반 신규 사용자: 10,000코인
- 최초 OWNER: 100,000코인
- 오늘의 접속 보상: 500코인


## 404 대응
- `/setup/`와 `/setup` 모두 지원
- 직접 확인용 `/setup.html` 추가
- `_redirects`로 Pages 정적 경로 강제 연결
