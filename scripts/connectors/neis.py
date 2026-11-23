from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

KST = timezone(timedelta(hours=9))
NEIS_BASE = "https://open.neis.go.kr/hub"
_SCHOOL_CODE_CACHE: Dict[Tuple[str, str], str] = {}


def _request_neis(endpoint: str, params: Dict[str, str], timeout: float = 5.0) -> Dict[str, Any]:
    clean_params = {k: v for k, v in params.items() if v is not None and v != ""}
    clean_params.setdefault("Type", "json")
    query = urllib.parse.urlencode(clean_params)
    url = f"{NEIS_BASE}/{endpoint}?{query}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Teum-Baker/1.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def _extract_rows(payload: Dict[str, Any], service_name: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    if service_name in payload:
        blocks = payload[service_name]
        rows: List[Dict[str, Any]] = []
        for block in blocks:
            if isinstance(block, dict) and "row" in block:
                rows.extend(block["row"])
        return rows, None
    result = payload.get("RESULT")
    if isinstance(result, dict):
        return [], f"{result.get('CODE', '')}: {result.get('MESSAGE', 'NEIS 오류')}"
    return [], "알 수 없는 NEIS 응답"


def _resolve_school_code(office_code: str, school_name: str, api_key: str) -> Tuple[Optional[str], Optional[str]]:
    cache_key = (office_code, school_name)
    if cache_key in _SCHOOL_CODE_CACHE:
        return _SCHOOL_CODE_CACHE[cache_key], None

    params: Dict[str, str] = {
        "ATPT_OFCDC_SC_CODE": office_code,
        "SCHUL_NM": school_name,
        "pIndex": "1",
        "pSize": "5",
    }
    if api_key:
        params["KEY"] = api_key

    try:
        payload = _request_neis("schoolInfo", params)
        rows, err = _extract_rows(payload, "schoolInfo")
        if err or not rows:
            return None, err or "학교코드를 찾지 못함"
        code = str(rows[0].get("SD_SCHUL_CODE", "")).strip()
        if not code:
            return None, "학교코드 누락"
        _SCHOOL_CODE_CACHE[cache_key] = code
        return code, None
    except Exception as exc:
        return None, f"학교코드 조회 실패 ({exc})"


def _parse_dishes(raw_dish: str) -> List[Dict[str, Any]]:
    lines = re.split(r"<br\s*/?>|\r?\n", raw_dish or "")
    dishes: List[Dict[str, Any]] = []
    for line in lines:
        text = line.strip()
        if not text:
            continue
        allergens: List[int] = []
        match = re.search(r"\(([0-9.\s]+)\)\s*$", text)
        if match:
            nums = [int(n) for n in re.findall(r"\d+", match.group(1))]
            allergens = nums
            text = text[: match.start()].strip()
        text = re.sub(r"[*@]+$", "", text).strip()
        if text:
            dishes.append({"name": text, "allergens": allergens})
    return dishes


def fetch_meal(cfg: Dict[str, Any], env: Dict[str, str]) -> Tuple[Any, str, str]:
    """Fetch school lunch from NEIS API (today or up to +4 days), falling back cleanly."""
    fallback = cfg.get("fallback", {})
    office_code = str(cfg.get("officeCode", "M10")).strip()
    school_name = str(cfg.get("schoolName", "서전고등학교")).strip()
    school_code = str(cfg.get("schoolCode", "")).strip()
    api_key = env.get("NEIS_API_KEY", "").strip()

    if not school_code:
        resolved, err = _resolve_school_code(office_code, school_name, api_key)
        if not resolved:
            return fallback, "fallback", err or "학교코드 조회 불가"
        school_code = resolved

    today = datetime.now(KST).date()
    last_reason = "급식 데이터 없음"

    for offset in range(0, 5):
        target = today + timedelta(days=offset)
        ymd = target.strftime("%Y%m%d")
        params: Dict[str, str] = {
            "ATPT_OFCDC_SC_CODE": office_code,
            "SD_SCHUL_CODE": school_code,
            "MLSV_YMD": ymd,
        }
        if api_key:
            params["KEY"] = api_key

        try:
            payload = _request_neis("mealServiceDietInfo", params)
            rows, err = _extract_rows(payload, "mealServiceDietInfo")
            if err:
                last_reason = err
                continue
            if not rows:
                continue

            # Prefer 중식 (MMEAL_SC_CODE == "2"), otherwise take first row
            chosen = next((r for r in rows if str(r.get("MMEAL_SC_CODE", "")) == "2"), rows[0])
            dishes = _parse_dishes(str(chosen.get("DDISH_NM", "")))
            if not dishes:
                continue

            date_label = target.strftime("%Y-%m-%d")
            if offset > 0:
                date_label = f"{date_label} (예정)"

            result = {
                "date": date_label,
                "mealType": str(chosen.get("MMEAL_SC_NM", "중식")).strip() or "중식",
                "calories": str(chosen.get("CAL_INFO", "")).strip(),
                "dishes": dishes,
            }
            return result, "live", f"{target.strftime('%Y-%m-%d')} NEIS 급식 연동"
        except Exception as exc:
            last_reason = f"NEIS 호출 실패 ({exc})"
            break

    return fallback, "fallback", last_reason


def fetch_schedule(cfg: Dict[str, Any], env: Dict[str, str]) -> Tuple[Any, str, str]:
    """Fetch upcoming school schedule events from NEIS API, falling back cleanly."""
    fallback = cfg.get("fallback", [])
    office_code = str(cfg.get("officeCode", "M10")).strip()
    school_name = str(cfg.get("schoolName", "서전고등학교")).strip()
    school_code = str(cfg.get("schoolCode", "")).strip()
    api_key = env.get("NEIS_API_KEY", "").strip()

    if not school_code:
        resolved, err = _resolve_school_code(office_code, school_name, api_key)
        if not resolved:
            return fallback, "fallback", err or "학교코드 조회 불가"
        school_code = resolved

    now = datetime.now(KST).date()
    today_ymd = now.strftime("%Y%m%d")
    ym_current = now.strftime("%Y%m")
    next_month_date = (now.replace(day=28) + timedelta(days=4))
    ym_next = next_month_date.strftime("%Y%m")

    try:
        seen = set()
        events: List[Dict[str, str]] = []
        for ym in (ym_current, ym_next):
            params: Dict[str, str] = {
                "ATPT_OFCDC_SC_CODE": office_code,
                "SD_SCHUL_CODE": school_code,
                "AA_YMD": ym,
                "pIndex": "1",
                "pSize": "50",
            }
            if api_key:
                params["KEY"] = api_key

            payload = _request_neis("SchoolSchedule", params)
            rows, err = _extract_rows(payload, "SchoolSchedule")
            if err:
                continue

            for row in rows:
                title = str(row.get("EVENT_NM", "")).strip()
                ymd = str(row.get("AA_YMD", "")).strip()
                if not title or len(ymd) != 8 or title in ("토요휴업일", "일요일", "공휴일"):
                    continue
                key = (ymd, title)
                if key in seen:
                    continue
                seen.add(key)
                formatted_date = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}"
                tag = str(row.get("SBTR_DD_SC_NM", "")).strip() or "학사"
                if tag == "해당없음":
                    tag = "학사"
                events.append({"title": title, "date": formatted_date, "tag": tag, "_ymd": ymd})

        events.sort(key=lambda x: x["_ymd"])
        upcoming = [e for e in events if e["_ymd"] >= today_ymd]
        selected = (upcoming if upcoming else events)[-8:] if not upcoming else upcoming[:8]
        for item in selected:
            item.pop("_ymd", None)

        if not selected:
            return fallback, "fallback", "학사일정 데이터 없음"
        return selected, "live", f"{ym_current}~{ym_next} 학사일정 {len(selected)}건 연동"
    except Exception as exc:
        return fallback, "fallback", f"NEIS 일정 호출 실패 ({exc})"
