# Gwongeon — 한성대 학사 비서 (프로토타입)

크롬 확장 프로그램(Manifest V3)으로 **사이드 패널 챗 UI**를 제공합니다. 백엔드가 없을 때는 **모의 응답**으로 시연할 수 있고, FastAPI 등에서 `POST /chat` 을 열면 연동할 수 있습니다.

## 확장 프로그램 로드 방법

1. Chrome에서 `chrome://extensions` 를 엽니다.
2. 우측 상단 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 누르고, 이 저장소의 **`extension`** 폴더를 선택합니다.
4. 툴바의 **퍼즐 아이콘** → **한성대 학사 비서 (프로토타입)** 옆 **핀**으로 아이콘을 고정할 수 있습니다.
5. 확장 **아이콘을 클릭**하면 오른쪽에 **사이드 패널**이 열립니다. (Chrome 114+)

## 백엔드 연동 (선택)

1. 사이드 패널 상단 **⚙**에서 베이스 URL을 입력합니다. 예: `http://127.0.0.1:8000` (끝의 `/` 는 없어도 됩니다.)
2. 확장은 `POST {베이스URL}/chat` 으로 JSON `{"message":"사용자 질문"}` 을 보냅니다.
3. 응답은 JSON 권장 형식 예시입니다.

```json
{
  "answer": "요약 답변 텍스트",
  "citations": [
    { "label": "학칙", "url": "https://...", "ref": "제N조" }
  ],
  "meta": "RAG · gpt-4o-mini 등"
}
```

`answer` 대신 `reply`, `text` 필드만 있어도 동작합니다. `citations` 또는 `sources` 배열을 넣으면 패널에 **근거 링크**로 표시됩니다.

**CORS:** 로컬 FastAPI에서 허용하려면 예를 들어 `CORSMiddleware` 로 확장의 origin 또는 `chrome-extension://...` 을 허용해야 할 수 있습니다.

### Ollama (로컬 LLM)

1. [Ollama](https://ollama.com/)를 설치한 뒤 터미널에서 `ollama serve` 가 동작하는지 확인합니다. (기본 주소: `http://127.0.0.1:11434`)
2. 사용할 모델을 받습니다. 예: `ollama pull llama3.2`
3. 확장 ⚙에서 **백엔드 종류**를 **Ollama**로 바꾸고, **베이스 URL**에 `http://127.0.0.1:11434` 를 입력합니다.
4. **Ollama 모델 이름**에 `ollama list` 에 나오는 이름(예: `llama3.2`)을 넣고 저장합니다.
5. 확장은 `POST http://127.0.0.1:11434/api/chat` 로 `stream: false` 인 채팅 요청을 보냅니다. Ollama는 같은 머신에서 동작하므로 보통 CORS 설정이 필요 없습니다.

## 폴더 구조

- `extension/manifest.json` — MV3, 사이드 패널, `localhost` 호출 권한
- `extension/background.js` — 아이콘 클릭 시 사이드 패널 열기
- `extension/sidepanel.html` / `.css` / `.js` — 챗 UI 및 API 호출

## 참고 링크

- 한성대 종합정보시스템: https://info.hansung.ac.kr/
- 한성대 메인: https://hansung.ac.kr/hansung/index.do
