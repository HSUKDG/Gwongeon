import { useEffect, useMemo, useRef, useState } from "react";
import { streamChatResponse } from "./api";
import { ChatBubble } from "./components/ChatBubble";
import { getLocalGuardrailReply } from "./guardrails";
import type { HansungLinkMessage, HansungPageContext } from "../shared/messages";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import type { ChatMessage } from "./types";

const TOP_PANEL_DEFAULT_HEIGHT = 220;
const TOP_PANEL_MIN_HEIGHT = 120;
const TOP_PANEL_BOTTOM_GAP = 260;

const starterPrompts = [
  {
    label: "📋 복학",
    query: "복학 절차를 알려줘",
  },
  {
    label: "💰 장학금",
    query: "장학금 신청 일정을 알려줘",
  },
  {
    label: "📚 수강신청",
    query: "수강신청 방법 알려줘",
  },
  {
    label: "🎓 졸업",
    query: "졸업요건을 어떻게 확인하나요?",
  },
  {
    label: "🏃 비교과",
    query: "비교과 프로그램 추천해줘",
  },
  {
    label: "🧾 현재 페이지",
    query: "현재 페이지 내용을 요약해줘",
  },
];

const academicSites = [
  {
    label: "Hansung",
    url: "https://hansung.ac.kr/",
  },
  {
    label: "Info",
    url: "https://info.hansung.ac.kr/jsp_21/index.jsp",
  },
  {
    label: "HS Portal",
    url: "https://hsportal.hansung.ac.kr/",
  },
  {
    label: "e-Class",
    url: "https://learn.hansung.ac.kr/",
  },
];

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "안녕하세요, Hansung-Link입니다. 한성대학교 학사 일정, 졸업요건, 장학, 수강신청처럼 학교 생활에 필요한 질문을 해보세요.",
    citations: [
      {
        label: "Hansung University",
        url: "https://www.hansung.ac.kr/hansung/index.do",
      },
      {
        label: "Hansung Portal",
        url: "https://hsportal.hansung.ac.kr/",
      },
    ],
  },
];

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [pageContext, setPageContext] = useState<HansungPageContext | null>(null);
  const [topPanelHeight, setTopPanelHeight] = useState(TOP_PANEL_DEFAULT_HEIGHT);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);

  const statusLabel = isStreaming
    ? "AI 답변 생성 중"
    : pageContext
      ? "현재 페이지 연결됨"
      : "AI 서버 연결됨";
  const statusClassName = isStreaming
    ? "bg-amber-50 text-amber-700"
    : pageContext
      ? "bg-emerald-50 text-emerald-700"
      : "bg-blue-50 text-hansung-navy";

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    const handleMessage = (message: HansungLinkMessage) => {
      if (message.type === "HANSUNG_LINK_PAGE_CONTEXT") {
        setPageContext(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    chrome.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        { type: "HANSUNG_LINK_GET_PAGE_CONTEXT" },
        (response?: HansungPageContext) => {
          if (chrome.runtime.lastError || !response) {
            return;
          }

          setPageContext(response);
        },
      );
    });

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  async function sendMessage(nextInput = input) {
    const question = nextInput.trim();

    if (!question || isStreaming) {
      return;
    }

    const assistantMessageId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
    };
    const localReply = getLocalGuardrailReply(question, pageContext);

    setMessages((current) => [
      ...current,
      userMessage,
      localReply ? { ...assistantMessage, content: localReply } : assistantMessage,
    ]);
    setInput("");

    if (localReply) {
      return;
    }

    setIsStreaming(true);

    try {
      await streamChatResponse({
        question,
        pageContext,
        onToken: (token) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: `${message.content}${token}` }
                : message,
            ),
          );
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages((current) =>
        current.map((chatMessage) =>
          chatMessage.id === assistantMessageId
            ? {
                ...chatMessage,
                content: `백엔드 요청에 실패했습니다.\n\n${message}\n\nFastAPI 서버가 http://127.0.0.1:8000 에서 실행 중인지 확인하세요.`,
              }
            : chatMessage,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function clearChat() {
    setMessages(initialMessages);
    setInput("");
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = topPanelHeight;
    const maxHeight = Math.max(TOP_PANEL_MIN_HEIGHT, window.innerHeight - TOP_PANEL_BOTTOM_GAP);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextHeight = startHeight + pointerEvent.clientY - startY;
      setTopPanelHeight(Math.min(Math.max(nextHeight, TOP_PANEL_MIN_HEIGHT), maxHeight));
    }

    function handlePointerUp() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <main className="flex h-screen min-h-0 flex-col bg-hansung-gray text-slate-900">
      <header className="flex flex-shrink-0 items-center justify-between gap-3 bg-gradient-to-br from-[#001D5C] via-[#003087] to-[#1A4FA8] px-4 py-3 text-white shadow-md">
        <div className="flex items-center justify-between gap-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-lg font-black text-[#003087] shadow-md">
            H
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight">한성 AI 학사 비서</h1>
            <p className="text-[10px] tracking-wide text-white/70">Hansung-Link Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="언어 선택"
            className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-[11px] text-white outline-none [&>option]:bg-[#003087]"
            defaultValue="ko"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/30 bg-white/10 text-xs transition hover:bg-white/20"
            onClick={clearChat}
            title="대화 초기화"
            type="button"
          >
            🗑
          </button>
        </div>
      </header>

      <div className={`flex flex-shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-[11px] ${statusClassName}`}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
        <span>{statusLabel}</span>
        <span className="ml-auto text-[10px] opacity-70">AI 답변은 참고용입니다.</span>
      </div>

      <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {starterPrompts.map((prompt) => (
          <button
            className="whitespace-nowrap rounded-full border border-slate-200 bg-hansung-gray px-3 py-1.5 text-[11px] font-semibold text-[#003087] transition hover:-translate-y-0.5 hover:border-[#003087] hover:bg-[#003087] hover:text-white"
            key={prompt.query}
            onClick={() => sendMessage(prompt.query)}
            type="button"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      <section
        className="flex-shrink-0 overflow-y-auto border-b border-slate-200 bg-white/80 px-4 py-3"
        style={{ height: topPanelHeight }}
      >
        <p className="text-xs leading-5 text-slate-500">
          로그인한 현재 페이지의 학사 정보를 읽고, 필요한 경우 한성대 공식 사이트를 함께 탐색합니다.
        </p>
        {pageContext ? (
          <div className="mt-3 rounded-2xl border border-hansung-navy/10 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-hansung-navy">
                Current Page
              </p>
              <span className="rounded-full bg-hansung-navy/10 px-2 py-1 text-[11px] font-semibold text-hansung-navy">
                {pageContext.source}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-800">
              {pageContext.heading || pageContext.title}
            </p>
            {pageContext.date ? (
              <p className="mt-1 text-xs text-slate-500">Date: {pageContext.date}</p>
            ) : null}
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">
              {pageContext.bodyText}
            </p>
            {pageContext.notices.length ? (
              <div className="mt-3 rounded-xl bg-hansung-gray p-2">
                <p className="text-xs font-semibold text-slate-700">Detected academic links</p>
                <ul className="mt-1 space-y-1">
                  {pageContext.notices.slice(0, 4).map((link) => (
                    <li className="line-clamp-1 text-xs" key={`${link.text}-${link.url}`}>
                      <a
                        className="text-hansung-navy underline-offset-2 hover:underline"
                        href={link.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {link.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          {academicSites.map((site) => (
            <a
              className="rounded-full bg-hansung-navy/10 px-3 py-1.5 text-xs font-semibold text-hansung-navy transition hover:bg-hansung-navy/15"
              href={site.url}
              key={site.url}
              rel="noreferrer"
              target="_blank"
            >
              Open {site.label}
            </a>
          ))}
        </div>
      </section>

      <button
        aria-label="Resize top panel and chat area"
        className="group flex h-3 flex-shrink-0 cursor-row-resize items-center justify-center border-b border-slate-200 bg-white transition hover:bg-hansung-navy/5"
        onPointerDown={handleResizePointerDown}
        type="button"
      >
        <span className="h-1 w-12 rounded-full bg-slate-300 transition group-hover:bg-hansung-navy/50" />
      </button>

      <section className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          <div ref={scrollRef} />
        </div>
      </section>

      {isStreaming ? (
        <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#003087] text-[10px] font-bold text-white">
            AI
          </div>
          <div className="flex gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
          </div>
        </div>
      ) : null}

      <form className="flex-shrink-0 border-t border-slate-200 bg-white px-3 pb-2 pt-3" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-input">
          Ask Hansung-Link
        </label>
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-24 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-hansung-gray px-3 py-2 text-[13px] leading-5 text-slate-800 outline-none transition placeholder:text-xs placeholder:text-slate-400 focus:border-[#003087] focus:bg-white"
            id="chat-input"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            disabled={isStreaming}
            maxLength={500}
            placeholder={
              isStreaming
                ? "Hansung-Link is answering..."
                : "궁금한 학사 정보를 입력하세요... (Enter: 전송)"
            }
            rows={2}
            value={input}
          />
          <button
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#003087] text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#1A4FA8] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:translate-y-0"
            disabled={!canSend}
            type="submit"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
          <span>{input.length} / 500</span>
          <span>중요 사항은 학교 공식 페이지에서 한 번 더 확인하세요.</span>
        </div>
      </form>
    </main>
  );
}
