from __future__ import annotations

import hashlib
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def _extract_prop_text(prop: Dict[str, Any]) -> str:
    ptype = prop.get("type", "")
    val = prop.get(ptype)
    if val is None:
        return ""
    if ptype in ("title", "rich_text"):
        return "".join(part.get("plain_text", "") for part in val).strip()
    if ptype in ("select", "status"):
        return str(val.get("name", "")).strip() if isinstance(val, dict) else ""
    if ptype == "multi_select":
        return ", ".join(item.get("name", "") for item in val if item.get("name"))
    if ptype == "date":
        return str(val.get("start", "")).strip() if isinstance(val, dict) else ""
    if ptype == "url":
        return str(val).strip()
    if ptype == "number":
        return str(val)
    if ptype == "checkbox":
        return "true" if val else "false"
    return ""


def _extract_prop_list(prop: Dict[str, Any]) -> List[str]:
    ptype = prop.get("type", "")
    val = prop.get(ptype)
    if ptype == "multi_select" and isinstance(val, list):
        return [str(item.get("name", "")).strip() for item in val if item.get("name")]
    return []


def _extract_file_url(prop: Dict[str, Any]) -> Tuple[str, str]:
    ptype = prop.get("type", "")
    if ptype == "files":
        files = prop.get("files") or []
        if files:
            first = files[0]
            name = str(first.get("name", "")).strip()
            ftype = first.get("type", "")
            if ftype == "file":
                return str(first.get("file", {}).get("url", "")).strip(), name
            if ftype == "external":
                return str(first.get("external", {}).get("url", "")).strip(), name
    elif ptype == "url":
        url = str(prop.get("url") or "").strip()
        return url, url.rsplit("/", 1)[-1] if url else ""
    return "", ""


def _extract_cover_url(page: Dict[str, Any]) -> str:
    cover = page.get("cover")
    if not isinstance(cover, dict):
        return ""
    ctype = cover.get("type", "")
    if ctype == "file":
        return str(cover.get("file", {}).get("url", "")).strip()
    if ctype == "external":
        return str(cover.get("external", {}).get("url", "")).strip()
    return ""


def _cache_thumbnail(url: str, page_id: str, root_dir: Path) -> str:
    """Download an image URL to assets/thumbs/ (compressing to 320x320 WebP if Pillow is installed)."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return ""

    thumbs_dir = root_dir / "assets" / "thumbs"
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(f"{page_id}:{url.split('?')[0]}".encode("utf-8")).hexdigest()[:12]

    for existing in thumbs_dir.glob(f"thumb_{digest}.*"):
        return f"./assets/thumbs/{existing.name}"

    req = urllib.request.Request(url, headers={"User-Agent": "Teum-Baker/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            content_type = str(resp.headers.get("Content-Type", "")).lower()
            raw = resp.read(10 * 1024 * 1024 + 1)
        if len(raw) > 10 * 1024 * 1024 or not raw:
            return ""

        try:
            from PIL import Image  # type: ignore

            with Image.open(io.BytesIO(raw)) as img:
                w, h = img.size
                side = min(w, h)
                left = (w - side) // 2
                top = (h - side) // 2
                cropped = img.crop((left, top, left + side, top + side)).resize(
                    (320, 320), Image.Resampling.LANCZOS
                )
                if cropped.mode not in ("RGB", "RGBA"):
                    cropped = cropped.convert("RGB")
                out_path = thumbs_dir / f"thumb_{digest}.webp"
                cropped.save(out_path, format="WEBP", quality=82)
                return f"./assets/thumbs/{out_path.name}"
        except ImportError:
            ext = ".jpg"
            if "png" in content_type or url.lower().split("?")[0].endswith(".png"):
                ext = ".png"
            elif "webp" in content_type or url.lower().split("?")[0].endswith(".webp"):
                ext = ".webp"
            elif "gif" in content_type or url.lower().split("?")[0].endswith(".gif"):
                ext = ".gif"
            out_path = thumbs_dir / f"thumb_{digest}{ext}"
            out_path.write_bytes(raw)
            return f"./assets/thumbs/{out_path.name}"
    except Exception:
        return ""


def _fetch_page_blocks(page_id: str, token: str) -> Dict[str, Any]:
    """Fetch Notion page blocks and convert them into structured blog article sections."""
    url = f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=30"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": "2022-06-28",
            "User-Agent": "Teum-Baker/2.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        blocks = payload.get("results", [])
        quote = ""
        sections: List[Dict[str, str]] = []
        current_heading = ""
        buffer: List[str] = []

        def flush() -> None:
            nonlocal current_heading, buffer
            if buffer or current_heading:
                sections.append({"heading": current_heading, "body": "\n".join(buffer).strip()})
            current_heading = ""
            buffer = []

        for blk in blocks:
            btype = blk.get("type", "")
            content = blk.get(btype) or {}
            rich = content.get("rich_text") or []
            text = "".join(part.get("plain_text", "") for part in rich).strip()
            if not text:
                continue
            if btype == "quote" and not quote:
                quote = text
            elif btype in ("heading_1", "heading_2", "heading_3"):
                flush()
                current_heading = text
            elif btype in ("bulleted_list_item", "numbered_list_item"):
                buffer.append(f"• {text}")
            elif btype == "paragraph":
                buffer.append(text)
        flush()
        return {"quote": quote, "sections": sections}
    except Exception:
        return {"quote": "", "sections": []}


def _prop_by_candidates(props: Dict[str, Any], names: Tuple[str, ...]) -> Optional[Dict[str, Any]]:
    for name in names:
        if name in props:
            return props[name]
    lower_map = {k.lower(): v for k, v in props.items()}
    for name in names:
        if name.lower() in lower_map:
            return lower_map[name.lower()]
    return None


def _parse_post_page(
    page: Dict[str, Any],
    token: str,
    fetch_blocks: bool,
    cache_thumbs: bool,
    root_dir: Optional[Path],
) -> Optional[Dict[str, Any]]:
    props = page.get("properties", {})

    pub_prop = _prop_by_candidates(props, ("게시", "Published", "공개"))
    if pub_prop and pub_prop.get("type") == "checkbox" and not pub_prop.get("checkbox"):
        return None

    title_prop = _prop_by_candidates(props, ("제목", "Title", "Name", "이름"))
    title = _extract_prop_text(title_prop) if title_prop else ""
    if not title:
        for prop in props.values():
            if prop.get("type") == "title":
                title = _extract_prop_text(prop)
                break
    if not title:
        return None

    date_prop = _prop_by_candidates(props, ("날짜", "Date", "작성일"))
    date_str = (_extract_prop_text(date_prop) if date_prop else "") or str(page.get("created_time", ""))[:10]

    due_prop = _prop_by_candidates(props, ("마감일", "DueDate", "종료일"))
    due_str = (_extract_prop_text(due_prop) if due_prop else "")[:10]

    dept_prop = _prop_by_candidates(props, ("부서", "작성부서", "Dept", "Department", "채널"))
    dept = (_extract_prop_text(dept_prop) if dept_prop else "") or "학생자치회"

    pinned_prop = _prop_by_candidates(props, ("중요공지", "고정", "Pinned"))
    pinned = bool(pinned_prop and pinned_prop.get("type") == "checkbox" and pinned_prop.get("checkbox"))

    tags_prop = _prop_by_candidates(props, ("태그", "Tags", "카테고리"))
    raw_tags = _extract_prop_list(tags_prop) if tags_prop else []
    tags = [t if t.startswith("#") else f"#{t}" for t in raw_tags] or ["#공지"]

    excerpt_prop = _prop_by_candidates(props, ("요약", "설명", "Excerpt", "Summary"))
    excerpt = _extract_prop_text(excerpt_prop) if excerpt_prop else ""

    thumb_prop = _prop_by_candidates(props, ("썸네일", "사진", "Thumbnail", "Image"))
    thumb_raw, _ = _extract_file_url(thumb_prop) if thumb_prop else ("", "")
    if not thumb_raw:
        thumb_raw = _extract_cover_url(page)

    page_id = str(page.get("id", "")).strip()
    thumb_url = ""
    if thumb_raw:
        if cache_thumbs and root_dir is not None:
            thumb_url = _cache_thumbnail(thumb_raw, page_id, root_dir) or ""
        else:
            thumb_url = thumb_raw

    att_prop = _prop_by_candidates(props, ("첨부파일", "첨부", "Attachment", "File"))
    _, att_name = _extract_file_url(att_prop) if att_prop else ("", "")

    article = _fetch_page_blocks(page_id, token) if (fetch_blocks and page_id) else {"quote": "", "sections": []}
    if not excerpt and article["sections"]:
        excerpt = article["sections"][0].get("body", "")[:90]

    return {
        "id": page_id or f"notion-{abs(hash(title))}",
        "date": date_str[:10],
        "dueDate": due_str or date_str[:10],
        "dept": dept,
        "title": title,
        "excerpt": excerpt or title,
        "pinned": pinned,
        "thumbUrl": thumb_url,
        "thumbTheme": "ocean",
        "thumbIcon": "📢",
        "tags": tags,
        "likes": 0,
        "article": {
            "quote": article.get("quote", ""),
            "sections": article.get("sections", []) or [{"heading": "본문", "body": excerpt or title}],
            "facts": [
                {"label": "작성일", "value": date_str[:10]},
                {"label": "담당", "value": dept},
            ],
            "attachment": att_name,
        },
    }


def _parse_forest_page(page: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    props = page.get("properties", {})
    title_prop = _prop_by_candidates(props, ("제목", "Title", "Name", "항목"))
    title = _extract_prop_text(title_prop) if title_prop else ""
    if not title:
        for prop in props.values():
            if prop.get("type") == "title":
                title = _extract_prop_text(prop)
                break
    if not title:
        return None

    type_prop = _prop_by_candidates(props, ("유형", "Type", "분류"))
    raw_type = (_extract_prop_text(type_prop) if type_prop else "").lower()
    type_map = {
        "회계": "accounting",
        "영수증": "accounting",
        "accounting": "accounting",
        "회의록": "minutes",
        "minutes": "minutes",
        "자료": "docs",
        "데이터": "docs",
        "docs": "docs",
        "공지": "notice",
        "notice": "notice",
    }
    rec_type = type_map.get(raw_type, "docs")

    date_prop = _prop_by_candidates(props, ("날짜", "Date"))
    date_str = ((_extract_prop_text(date_prop) if date_prop else "") or str(page.get("created_time", ""))[:10])[:10]
    term_prop = _prop_by_candidates(props, ("대수", "Term", "연도"))
    term = (_extract_prop_text(term_prop) if term_prop else "") or f"10대 ({date_str[:4] or '2026'})"
    dept_prop = _prop_by_candidates(props, ("부서", "Dept"))
    dept = (_extract_prop_text(dept_prop) if dept_prop else "") or "학생자치회"
    detail_prop = _prop_by_candidates(props, ("내용", "설명", "Detail", "요약"))
    detail = (_extract_prop_text(detail_prop) if detail_prop else "") or title
    att_prop = _prop_by_candidates(props, ("첨부파일", "Attachment", "File"))
    _, att_name = _extract_file_url(att_prop) if att_prop else ("", "")

    rec: Dict[str, Any] = {
        "id": str(page.get("id", "")) or f"f-{abs(hash(title))}",
        "type": rec_type,
        "date": date_str,
        "term": term,
        "dept": dept,
        "title": title,
        "detail": detail,
        "attachment": att_name,
    }

    if rec_type == "accounting":
        flow_prop = _prop_by_candidates(props, ("구분", "Flow", "수입지출"))
        flow_txt = (_extract_prop_text(flow_prop) if flow_prop else "").lower()
        rec["flow"] = "income" if ("수입" in flow_txt or "income" in flow_txt) else "expense"
        amt_prop = _prop_by_candidates(props, ("금액", "Amount"))
        amt_txt = _extract_prop_text(amt_prop) if amt_prop else "0"
        try:
            rec["amount"] = int(float(amt_txt))
        except ValueError:
            rec["amount"] = 0
    elif rec_type == "minutes":
        sess_prop = _prop_by_candidates(props, ("회차", "Session"))
        rec["session"] = (_extract_prop_text(sess_prop) if sess_prop else "") or "정기회의"
        ag_prop = _prop_by_candidates(props, ("안건수", "Agendas"))
        try:
            rec["agendaCount"] = int(float(_extract_prop_text(ag_prop))) if ag_prop else 1
        except ValueError:
            rec["agendaCount"] = 1
    elif rec_type == "docs":
        ft_prop = _prop_by_candidates(props, ("파일형식", "FileType"))
        rec["fileType"] = (_extract_prop_text(ft_prop) if ft_prop else "") or (
            att_name.rsplit(".", 1)[-1].upper() if "." in att_name else "PDF"
        )
        rec["fileName"] = att_name or f"{title}.pdf"

    return rec


def _parse_assessment_page(page: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    props = page.get("properties", {})
    title_prop = _prop_by_candidates(props, ("제목", "Title", "Name", "항목"))
    title = _extract_prop_text(title_prop) if title_prop else ""
    if not title:
        for prop in props.values():
            if prop.get("type") == "title":
                title = _extract_prop_text(prop)
                break
    if not title:
        return None

    grade_prop = _prop_by_candidates(props, ("학년", "Grade"))
    grade_raw = _extract_prop_text(grade_prop) if grade_prop else "1"
    digits = "".join(ch for ch in grade_raw if ch.isdigit())
    grade = int(digits[0]) if digits and digits[0] in ("1", "2", "3") else 1

    subj_prop = _prop_by_candidates(props, ("과목", "Subject", "교과"))
    subject = (_extract_prop_text(subj_prop) if subj_prop else "") or "기타"

    due_prop = _prop_by_candidates(props, ("마감일", "날짜", "DueDate", "Date"))
    due_date = ((_extract_prop_text(due_prop) if due_prop else "") or str(page.get("created_time", ""))[:10])[:10]

    note_prop = _prop_by_candidates(props, ("설명", "메모", "Note", "내용"))
    note = (_extract_prop_text(note_prop) if note_prop else "") or ""

    return {
        "id": str(page.get("id", "")) or f"ass-{abs(hash(title))}",
        "grade": grade,
        "subject": subject,
        "title": title,
        "dueDate": due_date,
        "note": note,
    }


def fetch_notion_db(cfg: Dict[str, Any], env: Dict[str, str]) -> Tuple[Any, str, str]:
    """Query a Notion database via REST API, supporting blog posts (with image cache) & forest records."""
    fallback = cfg.get("fallback", [])
    env_key = str(cfg.get("envToken", "NOTION_TOKEN")).strip() or "NOTION_TOKEN"
    token = env.get(env_key, "").strip()
    database_id = str(cfg.get("databaseId", "")).strip()
    mode = str(cfg.get("mode", "posts")).strip().lower()

    if not token or not database_id:
        return fallback, "fallback", f"{env_key} 또는 databaseId 미설정"

    url = f"https://api.notion.com/v1/databases/{database_id}/query"
    body = json.dumps({"page_size": 30}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
            "User-Agent": "Teum-Baker/2.0",
        },
    )

    root_str = env.get("TEUM_ROOT_DIR", "")
    root_dir = Path(root_str) if root_str else None
    fetch_blocks = bool(cfg.get("fetchBlocks", True))
    cache_thumbs = bool(cfg.get("cacheThumbs", True))

    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        results = payload.get("results", [])
        items: List[Dict[str, Any]] = []
        for page in results:
            if mode == "forest":
                parsed = _parse_forest_page(page)
            elif mode == "assessments":
                parsed = _parse_assessment_page(page)
            else:
                parsed = _parse_post_page(page, token, fetch_blocks, cache_thumbs, root_dir)
            if parsed:
                items.append(parsed)

        if not items:
            return fallback, "fallback", "노션 DB에 표시할 항목 없음"
        if mode == "assessments":
            items.sort(key=lambda x: str(x.get("dueDate", "9999-99-99")))
        else:
            items.sort(key=lambda x: str(x.get("date", "")), reverse=True)
        return items, "live", f"노션 DB {len(items)}건 연동"
    except Exception as exc:
        return fallback, "fallback", f"노션 API 호출 실패 ({exc})"
