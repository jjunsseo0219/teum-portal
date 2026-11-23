from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from typing import Any, Dict, Tuple


def _expand_env(text: str, env: Dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        var_name = match.group(1)
        return env.get(var_name, "")

    return re.sub(r"\$\{([A-Za-z0-9_]+)\}", repl, text)


def _resolve_path(obj: Any, path: str) -> Any:
    if not path:
        return obj
    current = obj
    for part in path.split("."):
        part = part.strip()
        if not part:
            continue
        if isinstance(current, dict):
            if part in current:
                current = current[part]
            else:
                return None
        elif isinstance(current, list):
            try:
                idx = int(part)
                current = current[idx]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return current


def _apply_field_map(data: Any, field_map: Dict[str, str]) -> Any:
    if not field_map:
        return data
    if isinstance(data, list):
        mapped = []
        for item in data:
            if isinstance(item, dict):
                mapped.append({k: _resolve_path(item, path) for k, path in field_map.items()})
            else:
                mapped.append(item)
        return mapped
    if isinstance(data, dict):
        return {k: _resolve_path(data, path) for k, path in field_map.items()}
    return data


def fetch_generic_json(cfg: Dict[str, Any], env: Dict[str, str]) -> Tuple[Any, str, str]:
    """Fetch any REST JSON API defined declaratively by URL, extractPath, and optional fieldMap."""
    fallback = cfg.get("fallback", {})
    raw_url = str(cfg.get("url", "")).strip()
    if not raw_url:
        return fallback, "fallback", "URL 미설정 (커스텀 API 대기 중)"

    url = _expand_env(raw_url, env).strip()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return fallback, "fallback", f"허용되지 않는 URL 스킴: {parsed.scheme or '없음'}"

    method = str(cfg.get("method", "GET")).upper().strip() or "GET"
    if method not in ("GET", "POST"):
        return fallback, "fallback", f"지원하지 않는 HTTP 메서드: {method}"

    headers = {"User-Agent": "Teum-Baker/1.0", "Accept": "application/json"}
    raw_headers = cfg.get("headers") or {}
    if isinstance(raw_headers, dict):
        for k, v in raw_headers.items():
            headers[str(k)] = _expand_env(str(v), env)

    body_bytes = None
    if method == "POST" and "body" in cfg and cfg["body"] is not None:
        if isinstance(cfg["body"], (dict, list)):
            body_bytes = json.dumps(cfg["body"]).encode("utf-8")
            headers.setdefault("Content-Type", "application/json")
        else:
            body_bytes = _expand_env(str(cfg["body"]), env).encode("utf-8")

    req = urllib.request.Request(url, data=body_bytes, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            raw_text = resp.read().decode("utf-8")
        payload = json.loads(raw_text)
        extract_path = str(cfg.get("extractPath", "")).strip()
        extracted = _resolve_path(payload, extract_path) if extract_path else payload
        if extracted is None:
            return fallback, "fallback", f"extractPath('{extract_path}') 결과 없음"

        field_map = cfg.get("fieldMap") or {}
        if isinstance(field_map, dict) and field_map:
            extracted = _apply_field_map(extracted, field_map)

        return extracted, "live", "외부 JSON API 연동 성공"
    except Exception as exc:
        return fallback, "fallback", f"API 호출 실패 ({exc})"
