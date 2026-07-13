# v9.3.3 와고 댓글 작성자 회원번호 인식 수정

- 와고 실제 댓글 HTML의 `YG_COMMON.show_nick_dropdown($(this), 현재회원번호, 작성자회원번호, ...)` 구조 대응
- 인증코드가 포함된 정확한 댓글 `<li>` 범위만 분석
- 두 번째 숫자 인자를 댓글 작성자 회원번호로 추출
- 댓글 작성자 닉네임과 입력 닉네임 대조
- 기존 minilog/data-member 방식은 보조 fallback으로 유지
- 기존 D1 테이블/데이터/API 구조 변경 없음
- 신규 app_meta: `safe_runtime_upgrade_v933_wago_dropdown_member_parse`
