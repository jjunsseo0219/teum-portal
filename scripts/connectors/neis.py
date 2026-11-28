from __future__ import annotations

import copy
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

KST = timezone(timedelta(hours=9))
NEIS_BASE = "https://open.neis.go.kr/hub"
WEEKDAY_LABELS = ("월", "화", "수", "목", "금")
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


def _clean_subject_name(raw_name: str) -> str:
    text = re.sub(r"^[*•\s]+", "", str(raw_name or "")).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _target_school_week_bounds(today_date: Any) -> Tuple[Any, Any]:
    monday = today_date - timedelta(days=today_date.weekday())
    if today_date.weekday() >= 5:
        monday = monday + timedelta(days=7)
    return monday, monday + timedelta(days=4)


def fetch_timetable(cfg: Dict[str, Any], env: Dict[str, str]) -> Tuple[Any, str, str]:
    """Fetch weekly class timetable from NEIS hisTimetable API, falling back safely."""
    raw_fallback = cfg.get("fallback") if isinstance(cfg.get("fallback"), dict) else cfg.get("data")
    fallback = copy.deepcopy(raw_fallback) if isinstance(raw_fallback, dict) else {}

    office_code = str(cfg.get("officeCode", "M10")).strip()
    school_name = str(cfg.get("schoolName", "서전고등학교")).strip()
    school_code = str(cfg.get("schoolCode", "8000376")).strip()
    api_key = env.get("NEIS_API_KEY", "").strip()

    if not api_key:
        return (
            fallback,
            "fallback",
            "NEIS_API_KEY 미설정 (샘플 5건 제한으로 기본 시간표 유지 · .env 또는 GitHub Secrets에 키 등록 시 자동 연동)",
        )

    if not school_code:
        resolved, err = _resolve_school_code(office_code, school_name, api_key)
        if not resolved:
            return fallback, "fallback", err or "학교코드 조회 불가"
        school_code = resolved

    today = datetime.now(KST).date()
    monday, friday = _target_school_week_bounds(today)
    from_ymd = monday.strftime("%Y%m%d")
    to_ymd = friday.strftime("%Y%m%d")

    all_rows: List[Dict[str, Any]] = []
    try:
        for page_idx in range(1, 6):
            params: Dict[str, str] = {
                "KEY": api_key,
                "ATPT_OFCDC_SC_CODE": office_code,
                "SD_SCHUL_CODE": school_code,
                "TI_FROM_YMD": from_ymd,
                "TI_TO_YMD": to_ymd,
                "pIndex": str(page_idx),
                "pSize": "1000",
            }
            payload = _request_neis("hisTimetable", params, timeout=8.0)
            rows, err = _extract_rows(payload, "hisTimetable")
            if err:
                if page_idx == 1 and "INFO-200" in err:
                    return fallback, "fallback", f"{from_ymd}~{to_ymd} NEIS 시간표 없음 (방학·휴일)"
                if page_idx == 1:
                    return fallback, "fallback", err
                break
            if not rows:
                break
            all_rows.extend(rows)
            if len(rows) < 1000:
                break
    except Exception as exc:
        return fallback, "fallback", f"NEIS 시간표 호출 실패 ({exc})"

    if not all_rows:
        return fallback, "fallback", f"{from_ymd}~{to_ymd} NEIS 시간표 없음 (방학·휴일)"

    # Group by class_key -> day_label -> period_num -> list of subject names
    grouped: Dict[str, Dict[str, Dict[int, List[str]]]] = {}
    for row in all_rows:
        grade = str(row.get("GRADE", "")).strip()
        class_nm = str(row.get("CLASS_NM", "")).strip()
        ymd = str(row.get("ALL_TI_YMD", "")).strip()
        perio_str = str(row.get("PERIO", "")).strip()
        subj = _clean_subject_name(str(row.get("ITRT_CNTNT", "")))
        if not (grade.isdigit() and class_nm.isdigit() and len(ymd) == 8 and perio_str.isdigit() and subj):
            continue
        try:
            wd = datetime.strptime(ymd, "%Y%m%d").weekday()
        except ValueError:
            continue
        if wd < 0 or wd > 4:
            continue
        perio = int(perio_str)
        if perio < 1 or perio > 12:
            continue
        class_key = f"{int(grade)}-{int(class_nm)}"
        day_label = WEEKDAY_LABELS[wd]
        periods_map = grouped.setdefault(class_key, {}).setdefault(day_label, {})
        items = periods_map.setdefault(perio, [])
        if subj not in items:
            items.append(subj)

    if not grouped:
        return fallback, "fallback", f"{from_ymd}~{to_ymd} 유효한 시간표 행 없음"

    merged = copy.deepcopy(fallback)
    updated_classes = 0
    for class_key, day_map in sorted(grouped.items()):
        class_entry = merged.get(class_key)
        if not isinstance(class_entry, dict):
            class_entry = {}
        day_updated = False
        for day_label, periods_map in day_map.items():
            if not periods_map:
                continue
            max_p = max(periods_map.keys())
            arr = []
            for p in range(1, max_p + 1):
                subjs = periods_map.get(p)
                if subjs:
                    arr.append("/".join(subjs[:3]))
                else:
                    arr.append("-")
            class_entry[day_label] = arr
            day_updated = True
        if day_updated:
            merged[class_key] = class_entry
            updated_classes += 1

    if isinstance(merged.get("1-1"), dict):
        merged["default"] = copy.deepcopy(merged["1-1"])

    return merged, "live", f"{from_ymd}~{to_ymd} NEIS 시간표 {updated_classes}개 반 연동"
