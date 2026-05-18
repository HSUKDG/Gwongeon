# Hansung-Link

한성대학교 AI Academic Assistant Chatbot 프로젝트입니다. 루트 아래를 `frontend/`와 `backend/`로 나누어 Chrome Extension과 FastAPI RAG 서버를 분리했습니다.

## 폴더 구조

- `frontend/` — Manifest V3, React + TypeScript, Vite, Tailwind CSS 기반 Chrome Extension
- `backend/` — FastAPI, LangChain, OpenAI, ChromaDB 기반 RAG API 서버
- `extension/` — 이전 정적 HTML/JS 프로토타입 보관용

## Frontend 실행

```bash
cd frontend
npm install
npm run build
```

Chrome에서 `chrome://extensions` → `개발자 모드` → `압축해제된 확장 프로그램을 로드합니다` → `frontend/dist` 폴더를 선택합니다.

## Backend 실행

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

`backend/.env`에 OpenAI API 키를 입력합니다.

```env
OPENAI_API_KEY=your_api_key_here
```

기본 채팅 엔드포인트는 `POST http://127.0.0.1:8000/api/chat`입니다. 요청 본문은 다음 형식입니다.

```json
{
  "question": "졸업요건 알려줘",
  "context": "현재 웹페이지에서 추출한 제목/본문 텍스트"
}
```

응답은 Server-Sent Events 형식으로 스트리밍됩니다.
