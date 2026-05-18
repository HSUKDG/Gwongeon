from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from app.config import get_settings


HANSUNG_NOTICE_SEED_URLS = [
    "https://hansung.ac.kr/",
    "https://www.hansung.ac.kr/hansung/index.do",
    "https://www.hansung.ac.kr/hansung/6172/subview.do",
    "https://www.hansung.ac.kr/bbs/hansung/2127/artclList.do",
    "https://hsportal.hansung.ac.kr/",
]

ACADEMIC_PORTAL_SEED_URLS = [
    "https://info.hansung.ac.kr/",
    "https://info.hansung.ac.kr/jsp_21/index.jsp",
    "https://hsportal.hansung.ac.kr/",
    "https://learn.hansung.ac.kr/",
]

OFFICIAL_SEED_URLS = [
    *HANSUNG_NOTICE_SEED_URLS,
    *ACADEMIC_PORTAL_SEED_URLS,
]

ALLOWED_HOSTS = {
    "hansung.ac.kr",
    "www.hansung.ac.kr",
    "info.hansung.ac.kr",
    "hsportal.hansung.ac.kr",
    "learn.hansung.ac.kr",
}

ACADEMIC_KEYWORD_GROUPS = {
    "장학": ["장학", "장학금", "scholarship", "등록금", "국가장학", "교내장학"],
    "신청": ["신청", "접수", "기간", "일정", "마감", "안내"],
    "비교과": ["비교과", "비교과포인트", "포인트", "프로그램", "인재인증", "스마트자기관리", "마이페이지", "신청"],
    "포인트": ["비교과", "비교과포인트", "포인트", "인재인증", "스마트자기관리", "마이페이지"],
    "시간표": ["시간표", "수업시간표", "수업", "강의", "종합정보", "학기", "조회"],
    "시험": ["시험", "시험기간", "중간고사", "기말고사", "학사일정", "수업", "e-class", "공지"],
    "과제": ["과제", "수업공지", "강의공지", "e-class", "수업", "강의"],
    "수업공지": ["수업공지", "강의공지", "e-class", "수업", "강의", "공지"],
    "공모전": ["공모전", "공모", "대회", "경진대회", "모집", "참여", "신청", "프로그램", "비교과", "대외활동", "공지"],
    "대회": ["공모전", "공모", "대회", "경진대회", "모집", "참여", "신청", "프로그램", "비교과", "공지"],
    "모집": ["모집", "선발", "참여", "신청", "프로그램", "비교과", "공모", "대회", "공지"],
    "프로그램": ["프로그램", "비교과", "참여", "신청", "모집", "특강", "행사", "공지"],
    "수강": ["수강", "수업", "강의", "course", "lecture"],
    "졸업": ["졸업", "이수", "학점", "graduation"],
    "학사": ["학사", "공지", "학사공지", "학사일정", "notice"],
}

PERSONAL_ACADEMIC_TRIGGERS = [
    "비교과 포인트",
    "비교과포인트",
    "현재 학기",
    "시간표",
    "시험기간",
    "시험 기간",
    "수업 공지",
    "수업공지",
    "강의 공지",
    "강의공지",
    "과제",
    "e-class",
    "eclass",
    "종합정보",
    "스마트자기관리",
]

NOTICE_TRIGGERS = [
    "학교 공지",
    "학과 공지",
    "공지",
    "공모전",
    "공모",
    "대회",
    "경진대회",
    "모집",
    "중요 공지",
]


@dataclass(frozen=True)
class ExploredPage:
    title: str
    url: str
    text: str
    snippets: list[str]


@dataclass(frozen=True)
class ExploredLink:
    text: str
    url: str
    score: int
    depth: int = 0


@dataclass(frozen=True)
class SearchPlan:
    name: str
    description: str
    seed_urls: list[str]
    max_pages: int
    max_depth: int


def _clean_text(value: str) -> str:
    return " ".join(value.split())


def _is_allowed_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and parsed.hostname in ALLOWED_HOSTS


def _request_html(url: str) -> str:
    settings = get_settings()
    response = requests.get(
        url,
        headers={
            "User-Agent": "Hansung-Link academic assistant crawler/0.1",
            "Accept": "text/html,application/xhtml+xml",
        },
        timeout=settings.web_explorer_timeout,
    )
    response.raise_for_status()
    if response.apparent_encoding:
        response.encoding = response.apparent_encoding
    return response.text


def _extract_keywords(question: str) -> list[str]:
    keywords = {token for token in question.replace("/", " ").split() if len(token) >= 2}

    for trigger, related in ACADEMIC_KEYWORD_GROUPS.items():
        if trigger in question:
            keywords.update(related)

    if not keywords:
        keywords.update(["학사", "공지", "안내"])

    return sorted(keywords, key=len, reverse=True)


def _build_search_plan(question: str) -> SearchPlan:
    normalized = question.lower()
    wants_personal_academic = any(trigger.lower() in normalized for trigger in PERSONAL_ACADEMIC_TRIGGERS)
    wants_notice = any(trigger.lower() in normalized for trigger in NOTICE_TRIGGERS)

    if wants_personal_academic:
        return SearchPlan(
            name="academic_portal",
            description=(
                "비교과 포인트, 현재 학기 시간표, 시험기간, 수업 공지 등은 "
                "hsportal.hansung.ac.kr, info.hansung.ac.kr/jsp_21/index.jsp, learn.hansung.ac.kr 중심으로 탐색했습니다. "
                "로그인 후 개인별로만 보이는 값은 현재 페이지 context를 우선 사용해야 합니다."
            ),
            seed_urls=ACADEMIC_PORTAL_SEED_URLS,
            max_pages=5,
            max_depth=1,
        )

    if wants_notice:
        return SearchPlan(
            name="notice",
            description=(
                "학교 공지, 학과 공지, 공모전, 대회, 모집 등 중요 공지는 "
                "hansung.ac.kr와 hsportal.hansung.ac.kr 중심으로 탐색했습니다."
            ),
            seed_urls=HANSUNG_NOTICE_SEED_URLS,
            max_pages=8,
            max_depth=2,
        )

    return SearchPlan(
        name="general",
        description=(
            "질문 유형이 명확히 분류되지 않아 한성대 홈페이지, 종합정보시스템, 스마트자기관리, e-class를 모두 가볍게 탐색했습니다."
        ),
        seed_urls=OFFICIAL_SEED_URLS,
        max_pages=6,
        max_depth=1,
    )


def _score_text(text: str, keywords: list[str]) -> int:
    lowered = text.lower()
    score = sum(3 if keyword in text else 1 if keyword.lower() in lowered else 0 for keyword in keywords)

    if any(keyword in text for keyword in ["장학", "공지", "학사", "신청", "일정"]):
        score += 2

    return score


def _extract_snippets(soup: BeautifulSoup, keywords: list[str]) -> list[str]:
    snippets: list[str] = []
    seen: set[str] = set()

    for selector in ["tr", "li", ".board-list li", ".list li", ".notice li", ".bbs li"]:
        for element in soup.select(selector):
            text = _clean_text(element.get_text(" "))

            if len(text) < 8 or text in seen:
                continue

            if _score_text(text, keywords):
                seen.add(text)
                snippets.append(text[:500])

            if len(snippets) >= 20:
                return snippets

    return snippets


def _parse_page(
    url: str,
    html: str,
    depth: int = 0,
    keywords: list[str] | None = None,
) -> tuple[ExploredPage, list[ExploredLink]]:
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    title = _clean_text(soup.title.get_text(" ")) if soup.title else url
    text = _clean_text(soup.get_text(" "))[:6000]
    snippets = _extract_snippets(soup, keywords or [])
    links: list[ExploredLink] = []

    for anchor in soup.select("a[href]"):
        link_text = _clean_text(anchor.get_text(" "))
        href = anchor.get("href", "")

        if not link_text or href.startswith(("javascript:", "#", "mailto:", "tel:")):
            continue

        absolute_url = urljoin(url, href)

        if not _is_allowed_url(absolute_url):
            continue

        links.append(ExploredLink(text=link_text[:160], url=absolute_url, score=0, depth=depth))

    return ExploredPage(title=title, url=url, text=text, snippets=snippets), links


def _remember_link(
    candidate_links: dict[str, ExploredLink],
    link: ExploredLink,
    keywords: list[str],
) -> None:
    score = _score_text(f"{link.text} {link.url}", keywords)

    if not score:
        return

    scored_link = ExploredLink(text=link.text, url=link.url, score=score, depth=link.depth)
    previous = candidate_links.get(link.url)

    if previous is None or score > previous.score:
        candidate_links[link.url] = scored_link


def explore_official_sites(question: str) -> str:
    keywords = _extract_keywords(question)
    search_plan = _build_search_plan(question)
    settings = get_settings()
    explored_pages: list[ExploredPage] = []
    candidate_links: dict[str, ExploredLink] = {}
    visited_urls: set[str] = set()
    pages_by_url: dict[str, ExploredPage] = {}

    for seed_url in search_plan.seed_urls:
        try:
            page, links = _parse_page(seed_url, _request_html(seed_url), depth=0, keywords=keywords)
        except requests.RequestException:
            continue

        visited_urls.add(seed_url)
        pages_by_url[seed_url] = page
        page_score = _score_text(f"{page.title} {page.text}", keywords)
        if page_score:
            explored_pages.append(page)

        for link in links:
            _remember_link(candidate_links, link, keywords)

    fetched_count = 0
    max_pages = min(settings.web_explorer_max_pages, search_plan.max_pages)
    max_depth = min(settings.web_explorer_max_depth, search_plan.max_depth)

    while fetched_count < max_pages:
        ranked_links = sorted(
            (
                link
                for link in candidate_links.values()
                if link.url not in visited_urls and link.depth < max_depth
            ),
            key=lambda item: (item.score, -item.depth),
            reverse=True,
        )

        if not ranked_links:
            break

        link = ranked_links[0]
        try:
            page, links = _parse_page(
                link.url,
                _request_html(link.url),
                depth=link.depth + 1,
                keywords=keywords,
            )
        except requests.RequestException:
            visited_urls.add(link.url)
            continue

        visited_urls.add(link.url)
        pages_by_url[link.url] = page
        fetched_count += 1

        if _score_text(f"{page.title} {page.text}", keywords):
            explored_pages.append(page)

        for child_link in links[: settings.web_explorer_max_links]:
            _remember_link(candidate_links, child_link, keywords)

    ranked_links = sorted(candidate_links.values(), key=lambda item: item.score, reverse=True)

    if not explored_pages and not ranked_links:
        return f"{search_plan.description} No matching official pages or links were found."

    ranked_pages = sorted(
        explored_pages,
        key=lambda page: _score_text(f"{page.title} {' '.join(page.snippets)} {page.text}", keywords),
        reverse=True,
    )

    page_context_parts: list[str] = []
    for index, page in enumerate(ranked_pages[:max_pages], start=1):
        snippet_context = "\n".join(f"- {snippet}" for snippet in page.snippets[:10])
        page_context_parts.append(
            "\n".join(
                part
                for part in [
                    f"[Official page {index}] {page.title}",
                    f"URL: {page.url}",
                    f"Relevant page items:\n{snippet_context}" if snippet_context else "",
                    f"Text excerpt:\n{page.text[:1800]}",
                ]
                if part
            )
        )

    page_context = "\n\n".join(page_context_parts)
    link_context = "\n".join(
        f"- {link.text} ({link.url})" for link in ranked_links[:20]
    )

    return "\n\n".join(
        part
        for part in [
            f"Search plan: {search_plan.name}. {search_plan.description}",
            f"Fetched official pages: {len(pages_by_url)}. Candidate official links: {len(ranked_links)}.",
            f"Official link candidates:\n{link_context}" if link_context else "",
            page_context,
        ]
        if part
    )
