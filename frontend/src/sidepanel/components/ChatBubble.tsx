import type { ChatMessage } from "../types";
import type { ReactNode } from "react";

type ChatBubbleProps = {
  message: ChatMessage;
};

function linkifyPlainText(text: string, isUser: boolean, keyPrefix: string): ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<>()]+)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    const [rawUrl] = match;

    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const trailingPunctuation = rawUrl.match(/[.,!?;:)]$/)?.[0] ?? "";
    const url = trailingPunctuation ? rawUrl.slice(0, -trailingPunctuation.length) : rawUrl;

    nodes.push(
      <a
        className={[
          "font-semibold underline underline-offset-2",
          isUser ? "text-white" : "text-hansung-navy",
        ].join(" ")}
        href={url}
        key={`${keyPrefix}-url-${match.index}`}
        rel="noreferrer"
        target="_blank"
      >
        {url}
      </a>,
    );

    if (trailingPunctuation) {
      nodes.push(trailingPunctuation);
    }

    lastIndex = match.index + rawUrl.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMessageContent(text: string, isUser: boolean): ReactNode[] {
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const [rawMarkdown, label, url] = match;

    if (match.index > lastIndex) {
      nodes.push(...linkifyPlainText(text.slice(lastIndex, match.index), isUser, `plain-${match.index}`));
    }

    nodes.push(
      <a
        className={[
          "font-semibold underline underline-offset-2",
          isUser ? "text-white" : "text-hansung-navy",
        ].join(" ")}
        href={url}
        key={`markdown-${match.index}-${url}`}
        rel="noreferrer"
        target="_blank"
      >
        {label}
      </a>,
    );

    lastIndex = match.index + rawMarkdown.length;
  }

  if (lastIndex < text.length) {
    nodes.push(...linkifyPlainText(text.slice(lastIndex), isUser, `plain-${lastIndex}`));
  }

  return nodes;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";

  return (
    <article className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={[
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          isUser ? "bg-[#C8102E] text-white" : "bg-[#003087] text-white",
        ].join(" ")}
      >
        {isUser ? "나" : "AI"}
      </div>
      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div
          className={[
            "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-5 shadow-sm",
            isUser
              ? "rounded-br bg-[#003087] text-white"
              : "rounded-bl border border-slate-200 bg-white text-slate-800 shadow-[0_2px_8px_rgba(0,48,135,0.10)]",
          ].join(" ")}
        >
          {renderMessageContent(message.content, isUser)}
        </div>

        {!isUser && message.citations?.length ? (
          <div className="flex flex-wrap gap-1 pt-1">
              {message.citations.map((citation) => (
                <span key={`${citation.label}-${citation.url ?? citation.ref ?? ""}`}>
                  {citation.url ? (
                    <a
                      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-[#003087] transition hover:bg-[#003087] hover:text-white"
                      href={citation.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {citation.label}
                    </a>
                  ) : (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-[#003087]">
                      {citation.label}
                    </span>
                  )}
                  {citation.ref ? <span className="ml-1 text-[10px] text-slate-400">({citation.ref})</span> : null}
                </span>
              ))}
          </div>
        ) : null}
        <span className="px-1 text-[10px] text-slate-400">
          {new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </article>
  );
}
