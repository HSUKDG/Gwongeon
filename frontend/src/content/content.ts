import type {
  HansungLinkMessage,
  HansungPageContext,
  HansungPageLink,
  HansungPageSource,
} from "../shared/messages";

const HANSUNG_HOSTS = new Set(["www.hansung.ac.kr", "hansung.ac.kr"]);
const INFO_HOST = "info.hansung.ac.kr";
const ECLASS_HOST = "learn.hansung.ac.kr";
const PORTAL_HOST = "hsportal.hansung.ac.kr";
const SUPPORTED_HOSTS = new Set([...HANSUNG_HOSTS, INFO_HOST, ECLASS_HOST, PORTAL_HOST]);
const MAX_BODY_LENGTH = 7000;
const MAX_LINKS = 20;
const MAX_NOTICES = 12;
const OVERLAY_ROOT_ID = "hansung-link-overlay-root";

const headingSelectors = [
  "h1",
  "h2",
  ".page-title",
  ".title",
  ".board-title",
  ".view-title",
  ".subject",
  "[class*='title']",
];

const dateSelectors = [
  "time",
  "[datetime]",
  ".date",
  ".reg-date",
  ".write-date",
  ".board-date",
  ".view-date",
  "[class*='date']",
  "[class*='Date']",
];

const bodySelectors = [
  "article",
  "main",
  ".contents",
  ".content",
  ".board-view",
  ".view-content",
  ".view_cont",
  ".board-content",
  ".notice-content",
  ".notice",
  ".board",
  ".bbs",
  ".list",
  ".course-content",
  ".region-main",
  ".dashboard",
  ".mypage",
  ".my-page",
  ".point",
  ".points",
  ".portfolio",
  ".program",
  ".lecture",
  ".course",
  ".timetable",
  ".schedule",
  ".assignment",
  "#contents",
  "#content",
  "#region-main",
  "#page-content",
];

const priorityTextPattern =
  /비교과|포인트|인재인증|마이페이지|시간표|교시|강의실|담당교수|시험|중간고사|기말고사|수업공지|강의공지|과제|강의자료|공지/i;

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function getFirstText(selectors: string[]): string {
  for (const selector of selectors) {
    const text = cleanText(document.querySelector(selector)?.textContent);

    if (text) {
      return text;
    }
  }

  return "";
}

function findDateText(): string {
  const fromSelector = getFirstText(dateSelectors);

  if (fromSelector) {
    return fromSelector;
  }

  const bodyText = cleanText(document.body.textContent);
  const dateMatch = bodyText.match(/\b20\d{2}[.\-/년\s]+(?:0?[1-9]|1[0-2])[.\-/월\s]+(?:0?[1-9]|[12]\d|3[01])\b/);

  return dateMatch?.[0] ?? "";
}

function findBodyText(): string {
  const priorityText = findPriorityText();

  if (priorityText) {
    return priorityText;
  }

  for (const selector of bodySelectors) {
    const text = cleanText(document.querySelector(selector)?.textContent);

    if (text.length > 80) {
      return text.slice(0, MAX_BODY_LENGTH);
    }
  }

  return cleanText(document.body.innerText).slice(0, MAX_BODY_LENGTH);
}

function findPriorityText(): string {
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const selector of ["tr", "li", "section", "article", ".card", ".box", ".item", ".row", ".table", "dl"]) {
    for (const element of document.querySelectorAll(selector)) {
      const text = cleanText(element.textContent);

      if (text.length < 6 || seen.has(text) || !priorityTextPattern.test(text)) {
        continue;
      }

      seen.add(text);
      snippets.push(text.slice(0, 600));

      if (snippets.join("\n").length >= MAX_BODY_LENGTH) {
        return snippets.join("\n").slice(0, MAX_BODY_LENGTH);
      }
    }
  }

  return snippets.join("\n").slice(0, MAX_BODY_LENGTH);
}

function normalizeUrl(href: string): string {
  return new URL(href, window.location.href).toString();
}

function extractLinks(): HansungPageLink[] {
  const seen = new Set<string>();
  const links: HansungPageLink[] = [];

  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const text = cleanText(anchor.textContent);
    const href = anchor.getAttribute("href");

    if (!text || !href || href.startsWith("javascript:") || href === "#") {
      continue;
    }

    const url = normalizeUrl(href);
    const key = `${text}|${url}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({ text, url });

    if (links.length >= MAX_LINKS) {
      break;
    }
  }

  return links;
}

function extractNoticeLinks(links: HansungPageLink[]): HansungPageLink[] {
  const noticePattern = /공지|notice|학사|수업|장학|졸업|신청|등록|휴학|복학|성적|e-class|매뉴얼|faq/i;

  return links
    .filter((link) => noticePattern.test(`${link.text} ${link.url}`))
    .slice(0, MAX_NOTICES);
}

function detectSource(): HansungPageSource {
  const { hostname, pathname, href } = window.location;
  const lowerPath = `${pathname} ${href}`.toLowerCase();

  if (hostname === INFO_HOST) {
    return "info-system";
  }

  if (hostname === ECLASS_HOST) {
    return "eclass";
  }

  if (hostname === PORTAL_HOST) {
    return "portal";
  }

  if (HANSUNG_HOSTS.has(hostname) && /notice|bbs|board|공지/.test(lowerPath)) {
    return "hansung-notice";
  }

  if (HANSUNG_HOSTS.has(hostname)) {
    return "hansung-main";
  }

  return "unknown";
}

function extractPageContext(): HansungPageContext {
  const heading = getFirstText(headingSelectors) || document.title.trim();
  const links = extractLinks();

  return {
    source: detectSource(),
    title: document.title.trim(),
    url: window.location.href,
    heading,
    date: findDateText(),
    bodyText: findBodyText(),
    links,
    notices: extractNoticeLinks(links),
    selection: window.getSelection()?.toString().trim() || "",
    capturedAt: new Date().toISOString(),
  };
}

function sendPageContext() {
  const payload = extractPageContext();

  if (!payload.heading && !payload.bodyText) {
    return;
  }

  chrome.runtime.sendMessage({ type: "HANSUNG_LINK_PAGE_CONTEXT", payload }, () => {
    void chrome.runtime.lastError;
  });
}

function schedulePageContextSend() {
  window.setTimeout(sendPageContext, 300);
}

function createOverlayUi() {
  if (document.getElementById(OVERLAY_ROOT_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = OVERLAY_ROOT_ID;
  const shadow = host.attachShadow({ mode: "closed" });
  const sidepanelUrl = chrome.runtime.getURL("sidepanel.html");

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        color-scheme: light;
        font-family: "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif;
      }

      .launcher {
        position: fixed;
        top: 50%;
        right: 0;
        z-index: 2147483646;
        width: 48px;
        height: 112px;
        transform: translateY(-50%);
        border: 0;
        border-radius: 18px 0 0 18px;
        background: linear-gradient(135deg, #001d5c, #003087 58%, #1a4fa8);
        color: #fff;
        box-shadow: 0 8px 24px rgba(0, 48, 135, 0.28);
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
      }

      .launcher:hover {
        transform: translateY(-50%) translateX(-3px);
        box-shadow: 0 10px 28px rgba(0, 48, 135, 0.36);
      }

      .launcher-mark {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #fff;
        color: #003087;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 900;
      }

      .launcher-text {
        writing-mode: vertical-rl;
        text-orientation: mixed;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
      }

      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        background: rgba(15, 23, 42, 0.18);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      .drawer {
        position: fixed;
        top: 16px;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: min(430px, calc(100vw - 32px));
        min-height: 520px;
        overflow: hidden;
        border: 1px solid rgba(0, 48, 135, 0.16);
        border-radius: 22px;
        background: #f5f7fb;
        box-shadow: 0 20px 60px rgba(0, 30, 92, 0.32);
        transform: translateX(calc(100% + 32px));
        opacity: 0;
        pointer-events: none;
        transition: transform 0.24s ease, opacity 0.2s ease;
      }

      .drawer-frame {
        width: 100%;
        height: 100%;
        border: 0;
        background: #f5f7fb;
      }

      .close {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 2;
        width: 30px;
        height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease;
      }

      .close:hover {
        background: rgba(255, 255, 255, 0.24);
      }

      .open .backdrop {
        opacity: 1;
        pointer-events: auto;
      }

      .open .drawer {
        transform: translateX(0);
        opacity: 1;
        pointer-events: auto;
      }

      .open .launcher {
        opacity: 0;
        pointer-events: none;
      }

      @media (max-width: 520px) {
        .drawer {
          top: 8px;
          right: 8px;
          bottom: 8px;
          width: calc(100vw - 16px);
          min-height: 0;
          border-radius: 18px;
        }

        .launcher {
          width: 44px;
          height: 98px;
        }
      }
    </style>
    <div class="shell" aria-live="polite">
      <button class="launcher" type="button" aria-label="한성 AI 학사 비서 열기">
        <span class="launcher-mark">H</span>
        <span class="launcher-text">AI 비서</span>
      </button>
      <div class="backdrop"></div>
      <aside class="drawer" aria-label="한성 AI 학사 비서">
        <button class="close" type="button" aria-label="닫기">×</button>
        <iframe class="drawer-frame" title="Hansung-Link" src="${sidepanelUrl}"></iframe>
      </aside>
    </div>
  `;

  const shell = shadow.querySelector(".shell");
  const launcher = shadow.querySelector(".launcher");
  const close = shadow.querySelector(".close");
  const backdrop = shadow.querySelector(".backdrop");

  function openOverlay() {
    shell?.classList.add("open");
    schedulePageContextSend();
  }

  function closeOverlay() {
    shell?.classList.remove("open");
  }

  function toggleOverlay() {
    shell?.classList.toggle("open");
    schedulePageContextSend();
  }

  launcher?.addEventListener("click", openOverlay);
  close?.addEventListener("click", closeOverlay);
  backdrop?.addEventListener("click", closeOverlay);

  document.documentElement.appendChild(host);

  chrome.runtime.onMessage.addListener((message: HansungLinkMessage) => {
    if (message.type !== "HANSUNG_LINK_TOGGLE_OVERLAY") {
      return false;
    }

    toggleOverlay();
    return false;
  });
}

if (SUPPORTED_HOSTS.has(window.location.hostname)) {
  chrome.runtime.onMessage.addListener((message: HansungLinkMessage, _sender, sendResponse) => {
    if (message.type !== "HANSUNG_LINK_GET_PAGE_CONTEXT") {
      return false;
    }

    sendResponse(extractPageContext());
    return false;
  });

  schedulePageContextSend();
  createOverlayUi();
  window.addEventListener("load", schedulePageContextSend, { once: true });

  let previousUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href === previousUrl) {
      return;
    }

    previousUrl = window.location.href;
    schedulePageContextSend();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export {};
