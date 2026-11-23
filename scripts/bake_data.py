from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from connectors import CONNECTORS  # noqa: E402

KST = timezone(timedelta(hours=9))


def _load_dotenv(root_dir: Path) -> Dict[str, str]:
    env_vars: Dict[str, str] = {}
    env_file = root_dir / ".env"
    if env_file.is_file():
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key:
                env_vars[key] = val
    env_vars.update(os.environ)
    return env_vars


def _atomic_write_text(target: Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=f".{target.name}.", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        os.replace(tmp_path, target)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _build_forest_all(baked_sources: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Merge forest_records and archive_posts into a single unified Forest archive sorted by date."""
    unified: List[Dict[str, Any]] = []
    raw_forest = baked_sources.get("forest_records")
    if isinstance(raw_forest, list):
        for item in raw_forest:
            if isinstance(item, dict):
                unified.append(dict(item))

    raw_posts = baked_sources.get("archive_posts")
    if isinstance(raw_posts, list):
        for post in raw_posts:
            if not isinstance(post, dict):
                continue
            date_str = str(post.get("date", ""))
            year = date_str[:4] if len(date_str) >= 4 and date_str[:4].isdigit() else "2026"
            unified.append(
                {
                    "id": f"notice-{post.get('id', '')}",
                    "type": "notice",
                    "date": date_str,
                    "term": f"10대 ({year})",
                    "dept": post.get("dept", "학생자치회"),
                    "title": post.get("title", ""),
                    "tags": post.get("tags", []),
                    "detail": post.get("excerpt", ""),
                    "linkedPostId": post.get("id", ""),
                    "attachment": (post.get("article") or {}).get("attachment", ""),
                }
            )

    unified.sort(key=lambda x: str(x.get("date", "")), reverse=True)
    return unified


def _write_year_archives(root: Path, baked_at: str, posts: List[Any], forest_all: List[Any]) -> List[str]:
    by_year: Dict[str, Dict[str, Any]] = {}

    def bucket(date_str: str) -> str:
        if len(date_str) >= 4 and date_str[:4].isdigit():
            return date_str[:4]
        return "2026"

    for p in posts if isinstance(posts, list) else []:
        if not isinstance(p, dict):
            continue
        y = bucket(str(p.get("date", "")))
        by_year.setdefault(y, {"year": y, "bakedAt": baked_at, "posts": [], "forest": []})["posts"].append(p)

    for f in forest_all if isinstance(forest_all, list) else []:
        if not isinstance(f, dict):
            continue
        y = bucket(str(f.get("date", "")))
        by_year.setdefault(y, {"year": y, "bakedAt": baked_at, "posts": [], "forest": []})["forest"].append(f)

    written: List[str] = []
    for y, doc in sorted(by_year.items()):
        out_path = root / "data" / f"archive_{y}.json"
        _atomic_write_text(out_path, json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
        written.append(f"data/archive_{y}.json")
    return written


def bake(root_dir: Path | None = None) -> Dict[str, Any]:
    """Read config.json & sources.json, run all connectors safely, synthesize forest_all, and write bundles."""
    root = (root_dir or Path(__file__).resolve().parent.parent).resolve()
    config = json.loads((root / "config.json").read_text(encoding="utf-8"))
    sources_cfg = json.loads((root / "sources.json").read_text(encoding="utf-8"))
    env = _load_dotenv(root)
    env["TEUM_ROOT_DIR"] = str(root)

    baked_sources: Dict[str, Any] = {}
    sources_meta: Dict[str, Dict[str, Any]] = {}

    for key, cfg in sources_cfg.items():
        if not isinstance(cfg, dict):
            continue
        ctype = str(cfg.get("type", "static")).strip()
        label = str(cfg.get("label", key)).strip()
        handler = CONNECTORS.get(ctype)

        started = time.perf_counter()
        if handler is None:
            data = cfg.get("fallback", cfg.get("data"))
            status = "fallback"
            reason = f"알 수 없는 커넥터 타입: {ctype}"
        else:
            try:
                data, status, reason = handler(cfg, env)
            except Exception as exc:
                data = cfg.get("fallback", cfg.get("data"))
                status = "fallback"
                reason = f"커넥터 예외 격리: {exc}"
        duration_ms = round((time.perf_counter() - started) * 1000, 1)

        baked_sources[key] = data
        sources_meta[key] = {
            "type": ctype,
            "label": label,
            "status": status,
            "reason": reason,
            "durationMs": duration_ms,
        }

    # Merge council archive_posts with live school_notices without duplicating IDs
    merged_posts: List[Dict[str, Any]] = []
    seen_post_ids = set()
    for src_key in ("archive_posts", "school_notices"):
        raw_list = baked_sources.get(src_key)
        if not isinstance(raw_list, list):
            continue
        for item in raw_list:
            if not isinstance(item, dict):
                continue
            pid = str(item.get("id", "")).strip()
            if pid and pid in seen_post_ids:
                continue
            if pid:
                seen_post_ids.add(pid)
            merged_posts.append(item)

    merged_posts.sort(
        key=lambda x: (1 if x.get("pinned") else 0, str(x.get("date", ""))),
        reverse=True,
    )
    baked_sources["archive_posts"] = merged_posts

    forest_all = _build_forest_all(baked_sources)
    baked_sources["forest_all"] = forest_all
    sources_meta["forest_all"] = {
        "type": "synthesized",
        "label": "숲 통합 아카이브 (회계·회의록·공지·자료)",
        "status": "static",
        "reason": f"총 {len(forest_all)}건 자동 병합",
        "durationMs": 0.0,
    }

    now_kst = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S KST")
    archive_files = _write_year_archives(root, now_kst, baked_sources.get("archive_posts", []), forest_all)

    payload: Dict[str, Any] = {
        "config": config,
        "sources": baked_sources,
        "_sourcesConfig": sources_cfg,
        "_meta": {
            "bakedAt": now_kst,
            "archiveFiles": archive_files,
            "sources": sources_meta,
        },
    }

    json_text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    js_text = (
        "// Auto-generated by scripts/bake_data.py — do not edit manually.\n"
        "window.TEUM_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n"
    )

    _atomic_write_text(root / "data.json", json_text)
    _atomic_write_text(root / "data.js", js_text)
    return payload


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    result = bake(root)
    meta = result["_meta"]
    print(f"[Teum Baker] Baked at {meta['bakedAt']}")
    for key, info in meta["sources"].items():
        badge = info["status"].upper()
        print(f"  - [{badge:8s}] {key} ({info['type']}, {info['durationMs']}ms): {info['reason']}")
    print(f"[Teum Baker] Archives: {', '.join(meta.get('archiveFiles', []))}")
    print(f"[Teum Baker] Generated {root / 'data.js'} and {root / 'data.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
