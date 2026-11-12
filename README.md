# 생태몬스터 바이브코딩 부서 (웹앱)

서버 없이 동작하는 웹앱이에요. `index.html` 파일 하나가 전부라서 GitHub Pages에 그대로 올리면 됩니다.

## GitHub Pages로 올리기
1. GitHub에서 새 저장소 만들기 (예: `ecomonster-vibecoding`)
2. `index.html`을 업로드 (Add file → Upload files)
3. Settings → Pages → Branch를 `main` / `(root)`로 두고 Save
4. 1~2분 뒤 `https://내아이디.github.io/ecomonster-vibecoding/` 에서 열림

## 처음 쓸 때
1. [API 키] 탭 → Gemini 키 입력 → [연결 테스트]
2. [맥락] 탭 → 폴더 구조, 엔진, 코딩 규칙 채우고 저장
3. [작업] 탭 → 개발 요청 입력 → 작업 시작
4. 결과는 [기록] 탭에서 보기 / .md 받기 / 복사

## API 키 보안
- 키는 내 브라우저(localStorage 또는 sessionStorage)에만 저장돼요. 코드, GitHub 저장소, 다른 사람 브라우저에는 없어요.
- 브라우저에서 Google로 직접 요청을 보내요. 중간 서버는 없어요.
- **꼭 해 두세요:** Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보에서 이 키에
  - 애플리케이션 제한: "웹사이트" → `https://내아이디.github.io/*`
  - API 제한: Generative Language API만
  를 걸어 두면, 키가 새어 나가도 다른 사이트에서는 못 써요.
- 공용 PC에서는 "이 기기에 저장"을 끄고, 다 쓰면 [삭제].
- **절대 index.html 안에 키를 직접 적어서 올리지 마세요.**
