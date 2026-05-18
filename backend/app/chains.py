import json
from collections.abc import AsyncIterator
from datetime import date

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from app.config import get_settings
from app.database import retrieve_relevant_documents
from app.web_explorer import explore_official_sites


SYSTEM_PROMPT = """You are Hansung-Link, a practical Hansung University academic helper.
Answer in natural Korean, like a helpful campus assistant. Be concise, direct, and specific.
Do not use artificial section labels such as "**답변**", "**요약**", "**참고**", "Answer:", or "Summary:".
Use Markdown only when it helps readability, such as short bullet lists or clickable links.
Use the retrieved Hansung University academic regulations, notices, and page context as grounding.
Also use the official website exploration results when ChromaDB has little or no information.
For 비교과 포인트, 현재 학기 시간표, 시험기간, 수업 공지, and other login-dependent personal academic information, prioritize the current webpage context from hsportal.hansung.ac.kr, info.hansung.ac.kr/jsp_21/index.jsp, or learn.hansung.ac.kr. If the current page context does not include the user's personal value, say which page the user should open after login.
If the current webpage context contains the requested personal value, answer from that context directly and do not replace it with generic navigation guidance.
For 학교 공지, 학과 공지, 공모전, 대회, 모집, and important notices, prioritize hansung.ac.kr and hsportal.hansung.ac.kr exploration results.
When official URLs are available, cite them as clickable Markdown links, for example [한성대학교 장학 안내](https://example.com).
Before saying information is unavailable, check the current webpage context, retrieved ChromaDB documents, and official website exploration results for all four official sites: hansung.ac.kr, info.hansung.ac.kr, hsportal.hansung.ac.kr, and learn.hansung.ac.kr.
Do not say "제공된 자료에 포함되어 있지 않습니다" as a generic fallback.
If no exact date or requirement is present after checking those sources, say "네 공식 사이트와 현재 페이지에서 정확한 항목을 찾지 못했습니다" and provide the most relevant clickable official links or navigation path.
For list-style questions such as 공모전, 모집, 대회, 프로그램, 비교과, or 참여 가능한 항목, do not answer with a short absence message if there are official link candidates or relevant page items. Instead, list every relevant candidate you found with title, date/deadline if visible, source, and a clickable Markdown link. If the exact eligibility or deadline is not visible, mark it as "확인 필요" instead of removing the item.
When the user asks for a recent or upcoming time window such as "근 1달", use the current date below and the visible dates/deadlines in the official results to filter or label items.
Never claim you can generate images, files, posters, or visual assets. This service only answers text-based academic information questions.
Do not invent policy details, dates, graduation requirements, scholarship conditions, or portal procedures."""


prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        (
            "human",
            """Current date:
{current_date}

Current webpage context:
{page_context}

Retrieved Hansung documents:
{retrieved_context}

Official website exploration:
{official_web_context}

User question:
{question}""",
        ),
    ]
)


def _format_documents(question: str, context: str | None) -> str:
    documents = retrieve_relevant_documents(question, context)

    if not documents:
        return "No relevant documents were found in ChromaDB."

    formatted_docs: list[str] = []
    for index, document in enumerate(documents, start=1):
        source = document.metadata.get("source") or document.metadata.get("url") or "unknown source"
        title = document.metadata.get("title") or document.metadata.get("name") or f"Document {index}"
        formatted_docs.append(
            f"[{index}] {title}\nSource: {source}\nContent:\n{document.page_content}"
        )

    return "\n\n---\n\n".join(formatted_docs)


async def stream_chat_response(question: str, context: str | None = None) -> AsyncIterator[str]:
    settings = get_settings()
    retrieved_context = _format_documents(question, context)
    official_web_context = explore_official_sites(question)
    prompt_value = prompt.invoke(
        {
            "question": question,
            "current_date": date.today().isoformat(),
            "page_context": context or "No webpage context was provided.",
            "retrieved_context": retrieved_context,
            "official_web_context": official_web_context,
        }
    )
    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0.2,
        streaming=True,
    )

    async for chunk in llm.astream(prompt_value.to_messages()):
        content = chunk.content

        if not isinstance(content, str):
            continue

        for character in content:
            yield f"data: {json.dumps({'content': character}, ensure_ascii=False)}\n\n"

    yield f"event: done\ndata: {json.dumps({'done': True})}\n\n"
