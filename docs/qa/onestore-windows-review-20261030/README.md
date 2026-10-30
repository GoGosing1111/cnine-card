# 원스토어 Windows 설치 파일

사용자 `윈도우용 도 원스토어용 만들어`에 따라 Windows x64 1.0.0 EXE를 생성했다.
파일: `C:/Users/User/Downloads/ReverseCall-ONEstore-Windows-1.0.0-review-20261030/ReverseCall-ONEstore-Windows-Setup-1.0.0-x64.exe`.

원스토어 Android와 같은 상시 제외 정책을 적용했다. 승부예측·포로수용소/데스게임·후원·시즌패스의 메뉴, 직접 진입, 네이티브 요청을 차단한다. 기존 메시지는 화면에서만 걸러 공유 계정 기록을 보존한다. 일반 Windows 클라이언트와 설치 ID/경로/프로필을 구분하고 기존 GitHub 실행 파일 업데이트 연결을 제거했다.

관련 단위검사32개, 실제 Electron28개, 한글·공백 경로 실제 설치/삭제 통과. 운영 등록 정보 보존, ASAR 동일 해시 확인. 최종 네이티브 검사에서 페이지 오류0·누락 자원0·실서버 쓰기0. 네이티브 테스트의 초기 축약 파일 목록과 loopback CORS 응답 누락을 수정하여 실제 리소스 검증 경로로 재검수했다.

ASAR41파일·7개 상시 정책 파일과 공개14,404파일 목록 병합 검증. EXE118,350,848bytes, SHA-256 `5650e22e40688d194d9cbd5b60a2b2dfd3931c69719860b3d15cb0d1a7e787ef`. Authenticode는 NotSigned. 실제 OAuth/신규 가입·원스토어 업로드·심사 완료로 표현하지 않는다. 후속 APK 가입 실패 제보는 공유 서버의 IP 계정 생성 제한이며 별도 요청으로 처리한다.

기존 체크아웃·Windows 빌드 경로·의존성 재사용. 게임 운영 재배포·계정 조작·메시지 발송·저장공간 유지관리·예약 없음. 재빌드 방법은 `packaging/onestore/windows/README.md`, 증거는 전달 폴더 `qa/`.
