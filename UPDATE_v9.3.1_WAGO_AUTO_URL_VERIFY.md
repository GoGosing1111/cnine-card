# v9.3.1 와고 댓글·회원번호 프로필 자동 인증

- 인증코드 댓글 주소와 회원번호 프로필 주소를 함께 입력
- 댓글의 인증코드 및 작성자 회원번호와 프로필 URL 회원번호를 서버에서 대조
- 모두 일치하면 CMS 승인 없이 자동 VERIFIED 처리
- 기존 OWNER/ADMIN 권한 로직과 완전 분리
- 신규 컬럼은 safe_runtime_upgrade_v931_wago_auto_urls에서 ADD COLUMN 방식으로만 추가
- 와고가 Cloudflare Worker 요청을 403으로 차단하면 자동 확인은 실패 메시지를 반환함
