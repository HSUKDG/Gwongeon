import json
import re
from collections.abc import Iterator


IMAGE_REQUEST_PATTERN = re.compile(
    r"(그림|이미지|사진|일러스트|로고|포스터|썸네일|그려|그려줘|생성해|만들어줘|draw|image|picture|logo|poster)",
    re.IGNORECASE,
)
ACADEMIC_KEYWORD_PATTERN = re.compile(
    r"(학사|공지|장학|졸업|수강|성적|등록|휴학|복학|공모전|모집|대회|비교과|프로그램|e-?class|종합정보|포털|일정|신청|한성)",
    re.IGNORECASE,
)
PERSONAL_INFO_PATTERN = re.compile(
    r"(내|나의|내가|현재|이번\s*학기).*(비교과|포인트|시간표|수업|강의|시험|과제|공지|성적)|"
    r"비교과\s*포인트|현재\s*학기\s*시간표|내\s*시간표|내\s*수업|수업\s*공지|강의\s*공지|시험\s*기간",
    re.IGNORECASE,
)
NOISE_PATTERN = re.compile(r"^[ㅋㅎㅠㅜㅡㅏ-ㅣㄱ-ㅎ\W\d_]+$")

PERSONAL_PAGE_HINTS = [
    (
        re.compile(r"비교과|포인트|인재인증", re.IGNORECASE),
        ["hsportal.hansung.ac.kr"],
        re.compile(r"비교과|포인트|인재인증|마이페이지|취득|신청 내역", re.IGNORECASE),
        "비교과 포인트는 로그인 후 스마트자기관리시스템에서 확인해야 해요. `HS Portal`을 열고 로그인한 뒤 `마이페이지 > 비교과 포인트 내역` 화면에서 다시 물어봐 주세요.",
    ),
    (
        re.compile(r"시간표|현재\s*학기|수업\s*시간", re.IGNORECASE),
        ["info.hansung.ac.kr"],
        re.compile(r"시간표|수업시간표|교시|강의실|담당교수|학점|요일", re.IGNORECASE),
        "현재 학기 시간표는 종합정보시스템에서 로그인 후 보이는 화면을 읽어야 해요. `Info`를 열고 로그인한 뒤 시간표 조회 화면에서 다시 물어봐 주세요.",
    ),
    (
        re.compile(r"수업\s*공지|강의\s*공지|과제|강의자료|e-?class", re.IGNORECASE),
        ["learn.hansung.ac.kr"],
        re.compile(r"공지|과제|강의|강좌|주차|자료|e-class|CyberCampus", re.IGNORECASE),
        "수업 공지나 과제는 e-class에서 해당 강좌에 들어간 뒤 확인할 수 있어요. `e-Class`를 열고 로그인한 다음 강좌 공지/과제 화면에서 다시 물어봐 주세요.",
    ),
    (
        re.compile(r"시험|중간고사|기말고사|시험\s*기간", re.IGNORECASE),
        ["info.hansung.ac.kr", "learn.hansung.ac.kr", "hansung.ac.kr", "www.hansung.ac.kr"],
        re.compile(r"시험|중간고사|기말고사|학사일정|수업공지|강의공지", re.IGNORECASE),
        "시험기간은 학사일정 또는 강좌 공지 화면에 있어야 정확히 확인할 수 있어요. 종합정보/e-class/학사일정 페이지를 연 뒤 다시 물어봐 주세요.",
    ),
]


def _normalize_question(question: str) -> str:
    return re.sub(r"\s+", " ", question).strip()


def _has_enough_meaning(question: str) -> bool:
    compact = re.sub(r"\s+", "", question)
    meaningful_chars = re.sub(r"[^0-9a-zA-Z가-힣]", "", compact)

    if ACADEMIC_KEYWORD_PATTERN.search(question):
        return True

    if len(meaningful_chars) < 6:
        return False

    return not bool(NOISE_PATTERN.match(compact))


def _get_personal_page_reply(question: str, context: str | None) -> str | None:
    if not PERSONAL_INFO_PATTERN.search(question):
        return None

    context_text = context or ""

    for pattern, required_hosts, required_text, message in PERSONAL_PAGE_HINTS:
        if not pattern.search(question):
            continue

        has_host = any(host in context_text for host in required_hosts)
        has_text = bool(required_text.search(context_text))

        if has_host and has_text:
            return None

        return message

    if context_text and any(source in context_text for source in ["Source: portal", "Source: info-system", "Source: eclass"]):
        return None

    return "개인별 정보는 로그인 후 해당 화면을 직접 열어야 확인할 수 있어요. 관련 페이지를 연 상태에서 다시 물어봐 주세요."


def get_local_guardrail_reply(question: str, context: str | None = None) -> str | None:
    normalized = _normalize_question(question)

    if not normalized:
        return "질문을 입력해 주세요."

    if IMAGE_REQUEST_PATTERN.search(normalized):
        return (
            "이미지나 그림 생성은 지원하지 않아요. 한성대 학사 공지, 장학, 수강, 졸업, "
            "비교과 프로그램처럼 텍스트로 확인할 수 있는 학사 정보를 물어봐 주세요."
        )

    if not _has_enough_meaning(normalized):
        return (
            "질문이 너무 짧거나 의미를 파악하기 어려워요. 예를 들면 `이번 달 참여 가능한 공모전 알려줘`처럼 "
            "조금 더 구체적으로 적어 주세요."
        )

    personal_reply = _get_personal_page_reply(normalized, context)
    if personal_reply:
        return personal_reply

    return None


def stream_static_reply(reply: str) -> Iterator[str]:
    for character in reply:
        yield f"data: {json.dumps({'content': character}, ensure_ascii=False)}\n\n"

    yield f"event: done\ndata: {json.dumps({'done': True})}\n\n"
