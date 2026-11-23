from __future__ import annotations

import html as html_lib
import re
import urllib.request
from typing import Any, Dict, List, Tuple

_DEFAULT_BASE_URL = "https://school.cbe.go.kr/seojeon-h"
_DEFAULT_BOARDS = [
    {"code": "M010501", "tag": "#학교공지", "label": "공지사항"},
    {"code": "M010503", "tag": "#가정통신문", "label": "가정통신문"},
]

_ROW_RE = re.compile(r"<tr[^>]*>([\s\S]*?)</tr>", re.IGNORECASE)
_LINK_RE = re.compile(r'href="([^"]*view/(\d+)[^"]*)"[^>]*>([\s\S]*?)</a>', re.IGNORECASE)
_DATE_RE = re.compile(r'<td[^>]*class="[^"]*tch-dte[^"]*"[^>]*>\s*(\d{2})\.(\d{2})\.(\d{2})\s*</td>', re.IGNORECASE)


def _clean_text(raw: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", html_lib.unescape(no_tags)).strip()


def _parse_board_rows(page_html: str, base_url: str, board: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
    code = str(board.get("code", "")).strip()
    label = str(board.get("label", "공지사항")).strip()
    tag = str(board.get("tag", "#학교공지")).strip()
    if not code:
        return []

    items: List[Dict[str, Any]] = []
    seen_ids = set()
    for row in _ROW_RE.findall(page_html):
        link_m = _LINK_RE.search(row)
        if not link_m:
            continue
        post_id = link_m.group(2)
        if post_id in seen_ids:
            continue
        seen_ids.add(post_id)

        title = _clean_text(link_m.group(3))
        if not title:
            continue

        date_m = _DATE_RE.search(row)
        if date_m:
            date_str = f"20{date_m.group(1)}-{date_m.group(2)}-{date_m.group(3)}"
        else:
            date_str = ""

        has_attach = "첨부파일" in row or "link_icon" in row
        view_url = f"{base_url.rstrip('/')}/{code}/view/{post_id}"

        items.append(
            {
                "id": f"school-{code}-{post_id}",
                "date": date_str,
                "dept": f"서전고 {label}",
                "title": title,
                "excerpt": f"서전고 공식 홈페이지 {label}에 등록된 게시물입니다. 아래 버튼에서 원문과 첨부파일을 바로 확인할 수 있습니다.",
                "pinned": False,
                "thumbUrl": "",
                "thumbTheme": "ocean" if code == "M010501" else "forest",
                "thumbIcon": label[:2] if label else "공지",
                "tags": [tag] if tag else ["#학교공지"],
                "likes": 0,
                "ctaUrl": view_url,
                "ctaLabel": "서전고 홈페이지 원문 · 첨부파일 보기 ↗",
                "article": {
                    "sections": [
                        {
                            "heading": "공식 게시판 안내",
                            "body": f"서전고등학교 공식 홈페이지 [{label}]에서 자동 수집된 게시물입니다.\n원문 본문과 첨부파일(HWP·PDF)은 아래 공식 링크에서 바로 열람할 수 있습니다.",
                        }
                    ],
                    "facts": [
                        {"label": "게시판", "value": f"서전고 {label}"},
                        {"label": "등록일", "value": date_str or "날짜 미상"},
                        {"label": "첨부파일", "value": "있음 (원문에서 다운로드)" if has_attach else "없음"},
                    ],
                    "attachment": "",
                },
            }
        )
        if len(items) >= limit:
            break
    return items


def fetch_school_board(cfg: Dict[str, Any], env: Dict[str, str]) -> Tuple[Any, str, str]:
    """Fetch public notices and home correspondence from Seojeon High School official website."""
    fallback = cfg.get("fallback", [])
    base_url = str(cfg.get("baseUrl", _DEFAULT_BASE_URL)).strip().rstrip("/")
    boards = cfg.get("boards") if isinstance(cfg.get("boards"), list) else _DEFAULT_BOARDS
    limit = max(1, min(15, int(cfg.get("limitPerBoard", 5) or 5)))

    collected: List[Dict[str, Any]] = []
    errors: List[str] = []

    for board in boards:
        if not isinstance(board, dict):
            continue
        code = str(board.get("code", "")).strip()
        if not code:
            continue
        list_url = f"{base_url}/{code}/list"
        req = urllib.request.Request(
            list_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; TeumPortal/3.0)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=6.0) as resp:
                raw_html = resp.read().decode("utf-8", errors="ignore")
            collected.extend(_parse_board_rows(raw_html, base_url, board, limit))
        except Exception as exc:
            errors.append(f"{code}:{exc}")

    if not collected:
        reason = f"홈페이지 수집 실패 ({', '.join(errors)})" if errors else "수집된 게시물 없음"
        return fallback, "fallback", reason

    collected.sort(key=lambda x: str(x.get("date", "")), reverse=True)
    return collected, "live", f"서전고 홈페이지 {len(collected)}건 자동 수집"
