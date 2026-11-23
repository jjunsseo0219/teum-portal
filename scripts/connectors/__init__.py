from __future__ import annotations

from typing import Any, Callable, Dict, Tuple

from .generic_json import fetch_generic_json
from .neis import fetch_meal, fetch_schedule
from .notion import fetch_notion_db
from .school_board import fetch_school_board


def fetch_static(cfg: Dict[str, Any], env: Dict[str, str]) -> Tuple[Any, str, str]:
    """Return static inline data defined directly in sources.json."""
    if "data" in cfg:
        return cfg["data"], "static", "로컬 정적 데이터"
    return cfg.get("fallback"), "fallback", "정적 데이터 비어 있음"


ConnectorFn = Callable[[Dict[str, Any], Dict[str, str]], Tuple[Any, str, str]]

CONNECTORS: Dict[str, ConnectorFn] = {
    "neis_meal": fetch_meal,
    "neis_schedule": fetch_schedule,
    "notion_db": fetch_notion_db,
    "school_board": fetch_school_board,
    "generic_json": fetch_generic_json,
    "static": fetch_static,
}
