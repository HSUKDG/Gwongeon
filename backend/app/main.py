from typing import Annotated

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.chains import stream_chat_response
from app.guardrails import get_local_guardrail_reply, stream_static_reply


BACKEND_DASHBOARD_HTML = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hansung-Link Backend</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: #003087;
      --primary-light: #1a4fa8;
      --primary-dark: #001d5c;
      --accent: #c8102e;
      --bg: #f5f7fb;
      --surface: #ffffff;
      --border: #dde4f0;
      --text: #1a1a2e;
      --muted: #6b7280;
      --shadow: 0 2px 10px rgba(0, 48, 135, .08);
    }
    body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif;
      font-size: 14px;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px 28px;
      color: white;
      background: linear-gradient(135deg, var(--primary-dark), var(--primary), var(--primary-light));
      box-shadow: 0 4px 18px rgba(0, 48, 135, .2);
    }
    .logo {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: white;
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 21px;
      font-weight: 900;
      box-shadow: 0 2px 8px rgba(0, 0, 0, .22);
    }
    .topbar h1 { font-size: 18px; }
    .topbar p { margin-top: 3px; font-size: 11px; opacity: .75; }
    .page {
      max-width: 920px;
      margin: 28px auto 60px;
      padding: 0 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px 22px;
      box-shadow: var(--shadow);
    }
    .card.wide { grid-column: 1 / -1; }
    .card h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--primary);
      font-size: 14px;
      margin-bottom: 12px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #065f46;
      font-size: 12px;
      font-weight: 700;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
    p, li { color: var(--muted); line-height: 1.7; font-size: 13px; }
    ul { padding-left: 18px; }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    a.button {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: var(--primary);
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      transition: all .15s;
    }
    a.button:hover { background: var(--primary); color: white; transform: translateY(-1px); }
    code {
      display: inline-block;
      border-radius: 6px;
      background: #f0f4fb;
      color: var(--primary);
      padding: 2px 6px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="logo">H</div>
    <div>
      <h1>한성 AI 학사 비서 — Backend</h1>
      <p>FastAPI · RAG · Official Site Explorer · Chrome Extension API</p>
    </div>
  </header>
  <main class="page">
    <section class="card wide">
      <h2>🟢 서버 상태</h2>
      <div class="status"><span class="dot"></span><span>서버 정상 동작 중</span></div>
      <div class="links">
        <a class="button" href="/health">Health</a>
        <a class="button" href="/docs">API Docs</a>
        <a class="button" href="/redoc">ReDoc</a>
      </div>
    </section>
    <section class="card">
      <h2>💬 채팅 API</h2>
      <p><code>POST /api/chat</code> 으로 질문과 현재 페이지 context를 받아 SSE로 답변을 스트리밍합니다.</p>
      <p>짧은 오타, 이미지 생성 요청, 관련 페이지가 없는 개인 정보 질문은 AI 호출 전에 차단합니다.</p>
    </section>
    <section class="card">
      <h2>🔎 검색 라우팅</h2>
      <ul>
        <li>비교과 포인트·시간표·시험·수업 공지: HS Portal, 종합정보, e-Class 우선</li>
        <li>학교/학과 공지·공모전·대회: 한성대 홈페이지, HS Portal 우선</li>
      </ul>
    </section>
    <section class="card">
      <h2>🧭 연결 사이트</h2>
      <div class="links">
        <a class="button" href="https://hansung.ac.kr/">Hansung</a>
        <a class="button" href="https://hsportal.hansung.ac.kr/">HS Portal</a>
        <a class="button" href="https://info.hansung.ac.kr/jsp_21/index.jsp">Info</a>
        <a class="button" href="https://learn.hansung.ac.kr/">e-Class</a>
      </div>
    </section>
  </main>
</body>
</html>"""


class ChatRequest(BaseModel):
    question: Annotated[str, Field(min_length=1)]
    context: str | None = None


app = FastAPI(
    title="Hansung-Link RAG API",
    description="FastAPI backend for the Hansung University RAG chatbot Chrome Extension.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "Hansung-Link RAG API"}


@app.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    return BACKEND_DASHBOARD_HTML


@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard() -> str:
    return BACKEND_DASHBOARD_HTML


@app.post("/api/chat")
def chat(request: ChatRequest) -> StreamingResponse:
    question = request.question.strip()

    if not question:
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    local_reply = get_local_guardrail_reply(question, request.context)
    if local_reply:
        return StreamingResponse(
            stream_static_reply(local_reply),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return StreamingResponse(
        stream_chat_response(question=question, context=request.context),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
