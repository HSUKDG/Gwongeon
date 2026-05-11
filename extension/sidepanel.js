const STORAGE_KEY = "apiBaseUrl";

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("btn-send");
const settingsBtn = document.getElementById("btn-settings");
const settingsPanel = document.getElementById("settings-panel");
const apiBaseEl = document.getElementById("api-base");
const saveSettingsBtn = document.getElementById("btn-save-settings");

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appendMessage(role, text, citations, meta) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrap.appendChild(bubble);

  if (citations && citations.length) {
    const cite = document.createElement("div");
    cite.className = "citations";
    cite.innerHTML = `<strong>근거</strong><ul>${citations
      .map((c) => {
        const label = escapeHtml(c.label || c.title || "문서");
        const href = c.url ? escapeHtml(c.url) : "";
        const ref = c.ref ? ` <span>(${escapeHtml(c.ref)})</span>` : "";
        const link = href
          ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
          : label;
        return `<li>${link}${ref}</li>`;
      })
      .join("")}</ul>`;
    wrap.appendChild(cite);
  }

  if (meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = meta;
    wrap.appendChild(m);
  }

  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function mockReply(userText) {
  if (/장학|scholarship/i.test(userText)) {
    return {
      text:
        "프로토타입 모의 응답입니다.\n\n장학금은 규정상 자격(성적, 소득, 신청 기한)이 항목마다 다릅니다. 실제 서비스에서는 장학 규정 PDF·공지를 RAG로 검색한 뒤, 본인 학적·성적과 맞는 항목만 골라 요약합니다.",
      citations: [
        {
          label: "한성대학교 메인",
          url: "https://hansung.ac.kr/hansung/index.do",
          ref: "홈 > 장학 안내(예시)",
        },
        {
          label: "종합정보시스템",
          url: "https://info.hansung.ac.kr/",
          ref: "로그인 후 장학/성적 메뉴(예시)",
        },
      ],
      meta: "백엔드 미연동 · 모의 데이터",
    };
  }
  if (/졸업|요건|이수/i.test(userText)) {
    return {
      text:
        "프로토타입 모의 응답입니다.\n\n졸업요건은 입학년도·전공별로 교양·전공·총학점·필수 이수 등이 다릅니다. 실제 서비스에서는 학칙·교육과정표·학과 공지를 인용해 표로 정리합니다.",
      citations: [
        {
          label: "한성대학교 메인",
          url: "https://hansung.ac.kr/hansung/index.do",
          ref: "학사안내 > 학칙/교육과정(예시)",
        },
      ],
      meta: "백엔드 미연동 · 모의 데이터",
    };
  }
  return {
    text:
      "프로토타입 모의 응답입니다.\n\n질문을 받았습니다: 「" +
      userText.trim().slice(0, 200) +
      (userText.trim().length > 200 ? "…" : "") +
      "」\n\n백엔드(FastAPI + RAG)를 연결하면 학칙·공지·FAQ에서 관련 조항을 찾아 요약하고, 아래처럼 원문 링크·조항 번호를 붙여 드립니다.",
    citations: [
      {
        label: "종합정보시스템",
        url: "https://info.hansung.ac.kr/",
        ref: "FAQ/공지(예시)",
      },
    ],
    meta: "백엔드 미연동 · 모의 데이터",
  };
}

async function getStoredApiBase() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  return (data[STORAGE_KEY] || "").trim().replace(/\/$/, "");
}

async function sendToBackend(apiBase, message) {
  const url = `${apiBase}/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

function normalizeBackendPayload(json, rawText) {
  if (typeof json === "string") {
    return { text: json, citations: [], meta: "백엔드 응답" };
  }
  const text =
    json.answer ?? json.reply ?? json.message ?? json.text ?? rawText ?? "";
  const citations = Array.isArray(json.citations)
    ? json.citations
    : Array.isArray(json.sources)
      ? json.sources
      : [];
  const meta = json.meta ?? json.mode ?? "";
  return { text, citations, meta: meta || "백엔드 응답" };
}

async function handleSend() {
  const message = inputEl.value.trim();
  if (!message) return;

  inputEl.value = "";
  sendBtn.disabled = true;
  appendMessage("user", message);

  const apiBase = await getStoredApiBase();

  try {
    if (apiBase) {
      const json = await sendToBackend(apiBase, message);
      const { text, citations, meta } = normalizeBackendPayload(json);
      appendMessage("assistant", text || "(빈 응답)", citations, meta);
    } else {
      const { text, citations, meta } = mockReply(message);
      appendMessage("assistant", text, citations, meta);
    }
  } catch (e) {
    appendMessage(
      "assistant",
      "백엔드 요청에 실패했습니다.\n\n" + (e && e.message ? e.message : String(e)),
      [
        apiBase
          ? {
              label: "OpenAPI 문서(있다면)",
              url: `${apiBase}/docs`,
            }
          : {
              label: "⚙에서 백엔드 URL 저장",
            },
      ],
      "오류 · URL·CORS·서버 기동 여부를 확인하세요",
    );
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function initWelcome() {
  appendMessage(
    "assistant",
    "한성대 학사 비서 프로토타입입니다.\n\n학칙·장학·졸업요건처럼 물어보시면 모의 응답과 예시 근거 링크를 보여 드립니다. 상단 ⚙에서 백엔드 URL을 넣으면 POST /chat 으로 연동합니다.",
    [
      {
        label: "한성대 메인",
        url: "https://hansung.ac.kr/hansung/index.do",
      },
      {
        label: "종합정보시스템",
        url: "https://info.hansung.ac.kr/",
      },
    ],
    "시연용 · 실제 규정은 학교 공식 문서를 확인하세요",
  );
}

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

saveSettingsBtn.addEventListener("click", async () => {
  const v = apiBaseEl.value.trim().replace(/\/$/, "");
  await chrome.storage.sync.set({ [STORAGE_KEY]: v });
  settingsPanel.classList.add("hidden");
  appendMessage("assistant", v ? `백엔드 URL을 저장했습니다: ${v}` : "백엔드를 비웠습니다. 모의 응답 모드입니다.", [], "설정");
});

sendBtn.addEventListener("click", handleSend);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

(async () => {
  const base = await getStoredApiBase();
  apiBaseEl.value = base;
  initWelcome();
})();
