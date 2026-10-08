# 헬리오스 SSS 리미티드 도감 등록 · 2026-10-09

사용자 지시: “칭호는 나중에, 헬리오스로 하고 SSS리미티드에 올려”.

이름 **헬리오스**, 코드 **V-999**, 등급 **SSS LIMITED**를 확정한다. 칭호는 빈 값과 `DEFERRED_BY_USER`로 보존하며 임의 칭호나 가칭을 도감에 표시하지 않는다. 기존 리미티드 목록에 추가되어 총 9종, SSS는 발테르와 헬리오스 2종이다.

승인 원화 `assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png`는 SHA-256 `BE6BF7819C24C53A7CDB0C2C86D85802AFA1E39FDF62D8F4306B8013CCE62492`의 원본 그대로 사용한다. 준비된 V2 SD는 `assets/ui/project-v/mercenaries/limited-20261009/helios-sd.png`, SHA-256 `6F80501F8D37753E9CBF624554381399287FBF6BCADD94EAD964AD15E271EB8A`이며 보존된 `qa/held-sword-v2.png`의 바이트 복사본이다. 전체 리미티드 공통 승인 V3 프레임을 재사용한다.

도감의 원화/SD 선택·확대와 SSS 필터를 연결했다. 칭호 보류를 명시한 리미티드에만 빈 칭호를 허용하며 빈 설명 태그는 렌더링하지 않는다. 공개 HTML 빌더에 현재 운영 페이지의 리미티드 탭·프레임 CSS·성장 링크·내비게이션을 동기화해 재빌드 시 사라지지 않게 했다. 페이지와 모델 로더 캐시를 갱신했다.

헬리오스 전투 수치·스킬 정책은 미정이고 동작/무기 시각 검수는 대기다. 획득·편성·전투 활성화는 열지 않는다. 기존 출시 8종의 전투 정책과 편성은 유지한다. 미출시 프로필의 보유 행이 있더라도 계정 조회가 실패하거나 편성 가능으로 표시되지 않도록 읽기 투영의 null 처리를 보완했다. 저장된 기존 확률·발행 한도는 그대로 읽고, 새 항목은 가중치 0·한도 미정으로 보충한다. 운영 DB를 수정하지 않는다.

## 검수 및 배포 범위

- PC 1440×1050·모바일 390×844 도감에서 원화/SD 디코딩, SSS 목록 2종·전체 리미티드 9종, 이름·칭호 공백 처리, 확대/닫기, 편성 버튼 비노출을 확인했다. JS 오류·로컬 요청 누락·가로 넘침 0. 증빙: `preview/mercenary-limited-solar-sword-20261009-v1/qa/registration/report.json` 및 캡처.
- 배포 회귀 대상으로 `tests/helios-sss-limited-registration-20261009.test.mjs`를 선정했다. 이름/등급/원본·SD·프레임 불변, 기존 저장 초안 호환, PostgreSQL 계정 조회/미출시 편성 차단, 공개 HTML 빌더 보존을 검증한다.
- `check:worker` 및 공식 배포의 출시 플래그·캐시·Hyperdrive 보호 검사를 수행한다. 기존 검증된 몸/이펙트·전투 시뮬레이션·무관한 콘텐츠 전수 검사는 반복하지 않는다.
- 직전 운영 기준: `2e258f428edb7cab05f3a0efebf34678130e349f`, Pages `aea6e48b-6cbc-4316-848a-f9fe4d4e62e6`.
- 사유: 리미티드 도감 1종 등록, 빈 칭호 표시, 미출시 계정 조회 처리 및 정적 자산 연결 변경이다. 인증·DB 구조·거래·의존성·전투 계산 변경이 없어 `npm run deploy:production -- --scoped`를 적용한다.

## 운영 반영 결과

2026-10-09 04:27 KST, 공식 scoped 배포 완료(종료 코드 0). 배포 커밋은 `ae278a5a7b27899041e2aa74de433590dc45f861`, Pages는 `https://96c77f53.cnine-card.pages.dev`다. 선택 회귀 5/5, Worker 문법·컴파일, 출시 보호·Hyperdrive 캐시 검사 통과.

운영 `https://cnine-card.pages.dev/api/mercenary-codex`에서 V-999 이름 헬리오스, 빈 칭호, SSS LIMITED, 리미티드 총 9종, 획득/편성 잠금을 확인했다. 도감 HTML의 새 캐시 태그 및 원화·SD HTTP 200과 원본 해시 일치를 확인했다. 전체 검수는 반복하지 않았다. 자세한 결과는 `helios-sss-limited-registration-20261009-release.json`에 보존한다.

검수 결과만 기록한 후속 문서 커밋은 운영 재배포 대상이 아니다.
