import type { HansungPageContext } from "../shared/messages";

const API_BASE_URL = "http://127.0.0.1:8000";

type StreamChatParams = {
  question: string;
  pageContext: HansungPageContext | null;
  onToken: (token: string) => void;
};

type StreamPayload = {
  content?: string;
  done?: boolean;
};

function formatPageContext(pageContext: HansungPageContext | null): string | undefined {
  if (!pageContext) {
    return undefined;
  }

  return [
    `Source: ${pageContext.source}`,
    `Title: ${pageContext.title}`,
    `Heading: ${pageContext.heading}`,
    `Date: ${pageContext.date || "unknown"}`,
    `URL: ${pageContext.url}`,
    pageContext.selection ? `Selected text: ${pageContext.selection}` : "",
    pageContext.notices.length
      ? `Academic notice/link candidates:\n${pageContext.notices
          .map((link, index) => `${index + 1}. ${link.text} (${link.url})`)
          .join("\n")}`
      : "",
    pageContext.links.length
      ? `Visible page links:\n${pageContext.links
          .slice(0, 10)
          .map((link, index) => `${index + 1}. ${link.text} (${link.url})`)
          .join("\n")}`
      : "",
    `Body: ${pageContext.bodyText}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseSsePayload(line: string): StreamPayload | null {
  if (!line.startsWith("data:")) {
    return null;
  }

  const rawData = line.replace(/^data:\s*/, "");

  if (!rawData || rawData === "[DONE]") {
    return { done: true };
  }

  try {
    return JSON.parse(rawData) as StreamPayload;
  } catch {
    return { content: rawData };
  }
}

export async function streamChatResponse({ question, pageContext, onToken }: StreamChatParams) {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      question,
      context: formatPageContext(pageContext),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Backend request failed with HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Backend response did not include a readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const payload = parseSsePayload(line.trim());

      if (!payload || payload.done) {
        continue;
      }

      if (payload.content) {
        onToken(payload.content);
      }
    }
  }

  const finalPayload = parseSsePayload(buffer.trim());

  if (finalPayload?.content) {
    onToken(finalPayload.content);
  }
}
