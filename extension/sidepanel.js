const STORAGE_KEY = "apiBaseUrl";
const STORAGE_BACKEND = "backendType";
const STORAGE_OLLAMA_MODEL = "ollamaModel";

const DEFAULT_OLLAMA_MODEL = "llama3.2";

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("btn-send");
const settingsBtn = document.getElementById("btn-settings");
const settingsPanel = document.getElementById("settings-panel");
const apiBaseEl = document.getElementById("api-base");
const backendTypeEl = document.getElementById("backend-type");
const ollamaModelWrap = document.getElementById("ollama-model-wrap");
const ollamaModelEl = document.getElementById("ollama-model");
const hintCustom = document.getElementById("hint-custom");
const hintOllama = document.getElementById("hint-ollama");
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

async function getStoredSettings() {
  const data = await chrome.storage.sync.get([
    STORAGE_KEY,
    STORAGE_BACKEND,
    STORAGE_OLLAMA_MODEL,
  ]);
  const apiBase = (data[STORAGE_KEY] || "").trim().replace(/\/$/, "");
  const backendType = data[STORAGE_BACKEND] === "ollama" ? "ollama" : "custom";
  let ollamaModel = (data[STORAGE_OLLAMA_MODEL] || "").trim();
  if (!ollamaModel) ollamaModel = DEFAULT_OLLAMA_MODEL;
  return { apiBase, backendType, ollamaModel };
}

function syncBackendTypeUI() {
  const isOllama = backendTypeEl.value === "ollama";
  ollamaModelWrap.classList.toggle("hidden", !isOllama);
  hintCustom.classList.toggle("hidden", isOllama);
  hintOllama.classList.toggle("hidden", !isOllama);
  apiBaseEl.placeholder = isOllama ? "http://127.0.0.1:11434" : "http://127.0.0.1:8000";
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

async function sendToOllama(apiBase, model, message) {
  const url = `${apiBase}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: message }],
      stream: false,
    }),
  });
  const raw = await res.text().catch(() => "");
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(raw || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(json.error || raw || `HTTP ${res.status}`);
  }
  if (json.error) {
    throw new Error(typeof json.error === "string" ? json.error : JSON.stringify(json.error));
  }
  const content =
    json.message && typeof json.message.content === "string" ? json.message.content : "";
  const metaModel = json.model || model;
  return {
    text: content,
    citations: [],
    meta: `Ollama · ${metaModel}`,
  };
}

function normalizeBackendPayload(json, rawText) {
  if (typeof json === "string") {
    return { text: json, citations: [], meta: "백엔드 응답" };
  }
  const nested =
    json.message && typeof json.message === "object" && typeof json.message.content === "string"
      ? json.message.content
      : "";
  const stringMessage = typeof json.message === "string" ? json.message : "";
  const text =
    json.answer ??
    json.reply ??
    json.text ??
    (stringMessage || null) ??
    (nested || null) ??
    rawText ??
    "";
  const citations = Array.isArray(json.citations)
    ? json.citations
    : Array.isArray(json.sources)
      ? json.sources
      : [];
  const meta = json.meta ?? json.mode ?? "";
  return { text, citations, meta: meta || "백엔드 응답" };
}

function errorCitations(apiBase, backendType) {
  if (!apiBase) {
    return [{ label: "⚙에서 백엔드 URL 저장" }];
  }
  if (backendType === "ollama") {
    return [
      { label: "Ollama 로컬 API", url: `${apiBase}/api/tags` },
      { label: "모델 목록 확인", url: "https://github.com/ollama/ollama/blob/main/docs/api.md" },
    ];
  }
  return [{ label: "OpenAPI 문서(있다면)", url: `${apiBase}/docs` }];
}

async function handleSend() {
  const message = inputEl.value.trim();
  if (!message) return;

  inputEl.value = "";
  sendBtn.disabled = true;
  appendMessage("user", message);

  const { apiBase, backendType, ollamaModel } = await getStoredSettings();

  try {
    if (apiBase) {
      if (backendType === "ollama") {
        const { text, citations, meta } = await sendToOllama(apiBase, ollamaModel, message);
        appendMessage("assistant", text || "(빈 응답)", citations, meta);
      } else {
        const json = await sendToBackend(apiBase, message);
        const { text, citations, meta } = normalizeBackendPayload(json);
        appendMessage("assistant", text || "(빈 응답)", citations, meta);
      }
    } else {
      const { text, citations, meta } = mockReply(message);
      appendMessage("assistant", text, citations, meta);
    }
  } catch (e) {
    appendMessage(
      "assistant",
      "백엔드 요청에 실패했습니다.\n\n" + (e && e.message ? e.message : String(e)),
      errorCitations(apiBase, backendType),
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
    "한성대 학사 비서 프로토타입입니다.\n\n학칙·장학·졸업요건처럼 물어보시면 모의 응답과 예시 근거 링크를 보여 드립니다. 상단 ⚙에서 백엔드 종류·URL을 설정하세요. Ollama는 주소 http://127.0.0.1:11434 과 모델 이름을 넣으면 POST /api/chat 으로 연결됩니다.",
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

backendTypeEl.addEventListener("change", syncBackendTypeUI);

saveSettingsBtn.addEventListener("click", async () => {
  const v = apiBaseEl.value.trim().replace(/\/$/, "");
  const backendType = backendTypeEl.value === "ollama" ? "ollama" : "custom";
  let model = ollamaModelEl.value.trim();
  if (backendType === "ollama" && !model) model = DEFAULT_OLLAMA_MODEL;
  const toSave = {
    [STORAGE_KEY]: v,
    [STORAGE_BACKEND]: backendType,
  };
  if (backendType === "ollama") {
    toSave[STORAGE_OLLAMA_MODEL] = model;
  }
  await chrome.storage.sync.set(toSave);
  settingsPanel.classList.add("hidden");
  if (!v) {
    appendMessage("assistant", "백엔드를 비웠습니다. 모의 응답 모드입니다.", [], "설정");
    return;
  }
  const detail =
    backendType === "ollama"
      ? `Ollama · ${v} · 모델 ${model || DEFAULT_OLLAMA_MODEL}`
      : `커스텀 API · ${v} · POST /chat`;
  appendMessage("assistant", `설정을 저장했습니다.\n\n${detail}`, [], "설정");
});

sendBtn.addEventListener("click", handleSend);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

(async () => {
  const s = await getStoredSettings();
  apiBaseEl.value = s.apiBase;
  backendTypeEl.value = s.backendType;
  ollamaModelEl.value = s.ollamaModel;
  syncBackendTypeUI();
  initWelcome();
})();
