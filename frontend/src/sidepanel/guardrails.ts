import type { HansungPageContext } from "../shared/messages";

const IMAGE_REQUEST_PATTERN =
  /(그림|이미지|사진|일러스트|로고|포스터|썸네일|그려|그려줘|생성해|만들어줘|draw|image|picture|logo|poster)/i;

const ACADEMIC_KEYWORD_PATTERN =
  /(학사|공지|장학|졸업|수강|성적|등록|휴학|복학|공모전|모집|대회|비교과|프로그램|e-?class|종합정보|포털|일정|신청|한성)/i;

const PERSONAL_INFO_PATTERN =
  /(내|나의|내가|현재|이번\s*학기).*(비교과|포인트|시간표|수업|강의|시험|과제|공지|성적)|비교과\s*포인트|현재\s*학기\s*시간표|내\s*시간표|내\s*수업|수업\s*공지|강의\s*공지|시험\s*기간/i;

const PERSONAL_PAGE_HINTS = [
  {
    pattern: /비교과|포인트|인재인증/i,
    requiredHosts: ["hsportal.hansung.ac.kr"],
    requiredText: /비교과|포인트|인재인증|마이페이지|취득|신청 내역/i,
    message:
      "비교과 포인트는 로그인 후 스마트자기관리시스템에서 확인해야 해요. `HS Portal`을 열고 로그인한 뒤 `마이페이지 > 비교과 포인트 내역` 화면에서 다시 물어봐 주세요.",
  },
  {
    pattern: /시간표|현재\s*학기|수업\s*시간/i,
    requiredHosts: ["info.hansung.ac.kr"],
    requiredText: /시간표|수업시간표|교시|강의실|담당교수|학점|요일/i,
    message:
      "현재 학기 시간표는 종합정보시스템에서 로그인 후 보이는 화면을 읽어야 해요. `Info`를 열고 로그인한 뒤 시간표 조회 화면에서 다시 물어봐 주세요.",
  },
  {
    pattern: /수업\s*공지|강의\s*공지|과제|강의자료|e-?class/i,
    requiredHosts: ["learn.hansung.ac.kr"],
    requiredText: /공지|과제|강의|강좌|주차|자료|e-class|CyberCampus/i,
    message:
      "수업 공지나 과제는 e-class에서 해당 강좌에 들어간 뒤 확인할 수 있어요. `e-Class`를 열고 로그인한 다음 강좌 공지/과제 화면에서 다시 물어봐 주세요.",
  },
  {
    pattern: /시험|중간고사|기말고사|시험\s*기간/i,
    requiredHosts: ["info.hansung.ac.kr", "learn.hansung.ac.kr", "hansung.ac.kr", "www.hansung.ac.kr"],
    requiredText: /시험|중간고사|기말고사|학사일정|수업공지|강의공지/i,
    message:
      "시험기간은 학사일정 또는 강좌 공지 화면에 있어야 정확히 확인할 수 있어요. 종합정보/e-class/학사일정 페이지를 연 뒤 다시 물어봐 주세요.",
  },
];

function normalizeQuestion(question: string): string {
  return question.replace(/\s+/g, " ").trim();
}

function hasEnoughMeaning(question: string): boolean {
  const compact = question.replace(/\s+/g, "");
  const alphaNumericOrKorean = compact.replace(/[^0-9a-zA-Z가-힣]/g, "");

  if (ACADEMIC_KEYWORD_PATTERN.test(question)) {
    return true;
  }

  if (alphaNumericOrKorean.length < 6) {
    return false;
  }

  if (/^[ㅋㅎㅠㅜㅡㅏ-ㅣㄱ-ㅎ\W\d_]+$/.test(compact)) {
    return false;
  }

  return true;
}

function isRelevantPersonalPage(question: string, pageContext: HansungPageContext | null): boolean {
  if (!PERSONAL_INFO_PATTERN.test(question)) {
    return true;
  }

  if (!pageContext) {
    return false;
  }

  const pageText = `${pageContext.title}\n${pageContext.heading}\n${pageContext.url}\n${pageContext.bodyText}\n${pageContext.links
    .map((link) => link.text)
    .join("\n")}`;

  for (const hint of PERSONAL_PAGE_HINTS) {
    if (!hint.pattern.test(question)) {
      continue;
    }

    const isAllowedHost = hint.requiredHosts.some((host) => pageContext.url.includes(host));
    return isAllowedHost && hint.requiredText.test(pageText);
  }

  return pageContext.source === "portal" || pageContext.source === "info-system" || pageContext.source === "eclass";
}

function getPersonalPageHint(question: string): string {
  for (const hint of PERSONAL_PAGE_HINTS) {
    if (hint.pattern.test(question)) {
      return hint.message;
    }
  }

  return "개인별 정보는 로그인 후 해당 화면을 직접 열어야 확인할 수 있어요. 관련 페이지를 연 상태에서 다시 물어봐 주세요.";
}

export function getLocalGuardrailReply(
  question: string,
  pageContext: HansungPageContext | null = null,
): string | null {
  const normalized = normalizeQuestion(question);

  if (!normalized) {
    return "질문을 입력해 주세요.";
  }

  if (IMAGE_REQUEST_PATTERN.test(normalized)) {
    return "이미지나 그림 생성은 지원하지 않아요. 한성대 학사 공지, 장학, 수강, 졸업, 비교과 프로그램처럼 텍스트로 확인할 수 있는 학사 정보를 물어봐 주세요.";
  }

  if (!hasEnoughMeaning(normalized)) {
    return "질문이 너무 짧거나 의미를 파악하기 어려워요. 예를 들면 `이번 달 참여 가능한 공모전 알려줘`처럼 조금 더 구체적으로 적어 주세요.";
  }

  if (PERSONAL_INFO_PATTERN.test(normalized) && !isRelevantPersonalPage(normalized, pageContext)) {
    return getPersonalPageHint(normalized);
  }

  return null;
}
