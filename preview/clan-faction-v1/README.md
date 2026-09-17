# 클랜 본부 · 서울 세력전 검수

실제 운영 컴포넌트와 로컬 합성 계정 DB를 사용한다. 개발 서버는 `127.0.0.1`에만 바인딩하며 운영 DB·인증정보를 로드하지 않는다.

```sh
node scripts/serve-clan-faction-preview.mjs
```

주소: http://127.0.0.1:8960/preview/clan-faction-v1/

## 확인 항목

1. 25개 자치구 선택 → 상권·점령 클랜·방어대·보호 시각 확인.
2. 부대 편성 → 클랜원 해제·추가 → 저장.
3. 강남구 공격 → 공유 HP 교전 → 서버 V3 결과 반영.
4. 징수세 → 전원 분배 → 내 전용 잔액 확인.
5. 상단 **침공 알림 시연** → T1 출정자 팝업 → 마포구 방어 진입.
6. 상단 정규 클랜전·본부·클랜원·챔피언스리그 전환.

이 독립 화면은 서버 V3 계산 뒤 간단한 결과를 표시한다. 실제 V3 화면은 별도의 실제 `index.html` 입장 검사에서 공용 렌더러로 확인한다. 시연 계정의 점령지·닉네임·재화는 운영 데이터가 아니다.

## 재현 가능한 검사

```sh
node --test tests/clan-faction-v1.test.mjs
node tests/clan-faction-v1.browser.mjs
node tests/clan-faction-live-entry.browser.mjs
```

브라우저 검사는 Playwright가 필요하다. 번들 런타임을 쓰는 경우 `PLAYWRIGHT_MODULE`에 모듈 절대 경로, `CHROMIUM_PATH`에 Chromium 경로, `FACTION_QA_DIR`에 저장 경로를 지정한다. 배포된 프런트엔드를 같은 합성 API로 검수하려면 `FACTION_LIVE_ORIGIN`을 지정한다.

지도 원본과 라이선스: `assets/ui/clan/seoul/NOTICE.md`. 확정 규칙·서버 원자 처리·출시 절차: `docs/clan-faction-war-20260917.md`.
