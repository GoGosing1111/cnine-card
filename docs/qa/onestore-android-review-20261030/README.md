# 원스토어 Android 상품등록용 APK — 2026-10-30

## 최신 제출 파일: 1.0.2 / code 3

사용자 신규 가입 오류 제보와 `일단 생성 제한 풀어`, `APK 업데이트해서 내놔`에 따라 공통 서버 IP 가입 제한을 해제하고 **1.0.2/code3**을 새로 빌드했다. 운영 소스2573ff34a·Pages af3011cb·두Worker100% 확인. 신규 가입/기존 로그인9검사와 원스토어/포장7검사 통과. 기존 계정/재화/닉네임 중복/개인키/세션 유지.

새 파일: `C:/Users/User/Downloads/ReverseCall-ONEstore-1.0.2-review-20261030/ReverseCall-ONEstore-1.0.2.apk`, 4,306,383bytes, SHA-256 `d4ab7f15a90307f6fbf723b71d811d7dc49f2990b2ae58ff6b928d22bf909bae`. 기존 YAKCODE 인증서·패키지·상시 제외 유지, assemble/lint·서명·정렬·최종7파일 검증. 1.0.1과 구현 소스 해시·번들 바이트 동일 확인 후31native/33browser 증거를 재사용했다. 실기기 미연결·스토어 업로드 미실시. 아래1.0.1 기록은 보존 이력이다.

## 앞선 1.0.1 빌드 기록

사용자 요청: 원스토어 안드로이드 상품등록 심사를 위한 APK 준비.

리버스콜 **1.0.1 / versionCode 2**, 패키지 **kr.yakcode.reversecall.onestore**의 서명된 release APK를 준비했다. 최신 원격 main `da521b0415cc14dac61b5b6e360a853d56d31781`에서 APK에 포함하는 7개 게임 문서를 다시 생성했다. 원래 YAKCODE 인증서와 패키지를 유지하고, 이전 1.0.0 / code 1 파일은 보존했다.

전달 파일: `C:/Users/User/Downloads/ReverseCall-ONEstore-1.0.1-review-20261030/ReverseCall-ONEstore-1.0.1.apk`

- 크기 4,306,383 bytes, Android 7.0 이상(min API 24), target/compile API 36.
- SHA-256 `a6ff9d76a16528cc6af7491ec308d2768ddc756b44707ec2a7207a9acf2678df`.
- 인증서 SHA-256 `1a164dea3a2be5f9fa53ae107ed0b75e5ea56586237bddf273e476286c241e15`.
- APK v2 서명과 zipalign 확인. INTERNET 권한만 사용, debuggable/평문 HTTP/외부 APK 설치 권한 없음. 키·암호 파일 미포함, 네이티브 ELF 라이브러리 없음.
- 기존 상시 배포 정책 유지: 승부예측·포로수용소/데스게임·후원/시즌패스 UI와 관련 요청 제외. 계정별 또는 심사 전후 전환 없음. 계정·재화·보유·쪽지 원본 보존.
- 네이티브 WebView Android 상품이다. 별도의 H5 SDK 웹게임 `/onestore/` 등록/연동은 변경하지 않았다. 새 광고·결제 SDK는 추가하지 않았다.

## 검증

Release assemble와 Android lint 완료: 오류 0, 경고 56. 템플릿·이전 API·리소스 경고 상세는 전달 폴더의 `qa/android-lint.xml`에 보존했다.

정책 검사 5개, 실제 생성된 Java의 정책·공개 리소스 목록 병합·내장 파일 저장 검사 31개, 실제 APK용 웹 파일의 Chromium PC/모바일 검사 33개, 총 69개 통과. 브라우저 API는 격리 fixture, 모든 WebSocket 연결 차단, 음소거. 전체 메뉴·쪽지·일반 인벤토리·제한 직접 진입·Android 뒤로가기 스크립트를 확인했다.

첫 시각 검수에서 희소 체크아웃의 미존재 이미지와 오래된 지갑 fixture가 발견되어 필요한 tracked 이미지 29개만 복원하고 응답을 보완했다. 최종 브라우저 결과는 요청 자산 누락 0, 페이지 오류 0이며 PC/모바일 화면을 직접 확인했다. 운영 게임 수정이 아닌 검수 환경 보완이다.

APK 내부 7개 오버라이드의 길이/SHA-256, 뒤로가기 스크립트, 빌드 원본 16개 해시, 시작 URL, 인증서/권한/버전/정렬을 최종 전달 APK에서 검증했다. `apk-verification.json`과 외부 전달 폴더의 재실행 가능한 `qa/verify-apk.py`에 기록했다.

**Android 기기 연결 0대**: 실기기 설치·실제 계정 로그인·OS 뒤로가기 검수는 미실시다. Chromium/JVM 검사를 실기기 검수로 간주하지 않는다. 원스토어 업로드·검증요청·심사 통과는 미실시다.

## 등록 경로와 범위

ONEconsole의 해당 상품에서 **상품관리 → Android 상품관리 → 바이너리 → 신규 바이너리 업로드**에 전달 APK를 사용한다. 새 상품을 개발자 보유 키로 직접 서명하는 구성에서는 바이너리 유형 APK와 “앱 서명 사용 안함” 옵션이 대응한다. 기존 등록 상품의 서명 설정은 임의 변경하지 않는다. 이미 AAB로 설정된 상품에는 APK로 유형을 되돌릴 수 없으므로 현재 상품 설정과 파일 유형을 일치시켜야 한다. 근거: [원스토어 공식 바이너리 안내](https://onestore-dev.gitbook.io/dev/docs/apps/product/android/binary), 2026-10-30 확인.

소스 변경은 배포판 버전·검수 도구·기록뿐이다. 기존 체크아웃과 Android 빌드 폴더, 설치된 JDK/SDK/Gradle 의존성을 재사용했다. 웹/Worker 재배포·운영 DB/API 쓰기·메시지 발송·유지관리·예약 실행 없음. 개인 서명 정보는 비공개 기존 위치에 보존하고 전달 파일에 포함하지 않았다.
