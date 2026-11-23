from __future__ import annotations

import argparse
import base64
import functools
import hashlib
import io
import json
import re
import sys
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlparse

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import bake_data  # noqa: E402

ROOT_DIR = _SCRIPTS_DIR.parent
_WRITE_LOCK = threading.Lock()
_NO_CACHE_NAMES = {
    "data.js",
    "data.json",
    "config.json",
    "sources.json",
    "sw.js",
    "index.html",
    "admin.html",
    "pledge.html",
    "style.css",
    "app.js",
    "admin.js",
    "widgets.js",
}
_DATA_URL_RE = re.compile(r"^data:image/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$", re.IGNORECASE)


def _read_json(path: Path, default: Any = None) -> Any:
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: Any) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    bake_data._atomic_write_text(path, text)


def _save_uploaded_thumb(data_url: str) -> tuple[str, bool]:
    match = _DATA_URL_RE.match(data_url.strip())
    if not match:
        raise ValueError("지원되는 이미지 형식(PNG, JPG, WebP, GIF Base64)이 아닙니다.")
    fmt = match.group(1).lower()
    raw = base64.b64decode(match.group(2), validate=True)
    if not raw or len(raw) > 5 * 1024 * 1024:
        raise ValueError("이미지 크기가 비어 있거나 5MB를 초과합니다.")

    thumbs_dir = ROOT_DIR / "assets" / "thumbs"
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    stamp = int(time.time() * 1000)
    digest = hashlib.sha1(raw).hexdigest()[:8]

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
            filename = f"thumb_{stamp}_{digest}.webp"
            cropped.save(thumbs_dir / filename, format="WEBP", quality=82)
            return f"./assets/thumbs/{filename}", True
    except ImportError:
        ext = ".jpg" if fmt in ("jpeg", "jpg") else f".{fmt}"
        filename = f"thumb_{stamp}_{digest}{ext}"
        (thumbs_dir / filename).write_bytes(raw)
        return f"./assets/thumbs/{filename}", False


class TeumHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        parsed_path = urlparse(self.path).path
        basename = parsed_path.rsplit("/", 1)[-1]
        if parsed_path.startswith("/api/") or parsed_path.startswith("/data/") or basename in _NO_CACHE_NAMES:
            self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body_json(self, max_bytes: int = 8 * 1024 * 1024) -> Any:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Invalid Content-Length")
        if length <= 0 or length > max_bytes:
            raise ValueError("Request body empty or exceeds limit")
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            try:
                config = _read_json(ROOT_DIR / "config.json", {})
                sources = _read_json(ROOT_DIR / "sources.json", {})
                baked = _read_json(ROOT_DIR / "data.json", {})
                meta = baked.get("_meta", {}) if isinstance(baked, dict) else {}
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "serverMode": True,
                        "config": config,
                        "sources": sources,
                        "meta": meta,
                        "baked": baked,
                    },
                )
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/save-config":
            try:
                payload = self._read_body_json()
                if not isinstance(payload, dict) or not isinstance(payload.get("tabs"), dict):
                    self._send_json(
                        HTTPStatus.BAD_REQUEST,
                        {"ok": False, "error": "config 객체에는 tabs 딕셔너리가 필수입니다."},
                    )
                    return
                with _WRITE_LOCK:
                    _write_json(ROOT_DIR / "config.json", payload)
                    baked = bake_data.bake(ROOT_DIR)
                self._send_json(HTTPStatus.OK, {"ok": True, "meta": baked.get("_meta", {}), "baked": baked})
            except Exception as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
            return

        if parsed.path == "/api/save-sources":
            try:
                payload = self._read_body_json()
                if not isinstance(payload, dict):
                    self._send_json(
                        HTTPStatus.BAD_REQUEST,
                        {"ok": False, "error": "sources.json은 객체(dict) 형태여야 합니다."},
                    )
                    return
                with _WRITE_LOCK:
                    _write_json(ROOT_DIR / "sources.json", payload)
                    baked = bake_data.bake(ROOT_DIR)
                self._send_json(HTTPStatus.OK, {"ok": True, "meta": baked.get("_meta", {}), "baked": baked})
            except Exception as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
            return

        if parsed.path == "/api/upload-thumb":
            try:
                payload = self._read_body_json(max_bytes=8 * 1024 * 1024)
                if not isinstance(payload, dict) or not isinstance(payload.get("dataUrl"), str):
                    self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "dataUrl 필드가 필요합니다."})
                    return
                with _WRITE_LOCK:
                    url, compressed = _save_uploaded_thumb(payload["dataUrl"])
                self._send_json(HTTPStatus.OK, {"ok": True, "url": url, "compressed": compressed})
            except Exception as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
            return

        if parsed.path == "/api/bake":
            try:
                with _WRITE_LOCK:
                    baked = bake_data.bake(ROOT_DIR)
                self._send_json(HTTPStatus.OK, {"ok": True, "meta": baked.get("_meta", {}), "baked": baked})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown API endpoint"})

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write(f"[Teum Server] {self.address_string()} - {format % args}\n")


def _bind_server(start_port: int, max_attempts: int = 11) -> tuple[ThreadingHTTPServer, int]:
    handler_cls = functools.partial(TeumHandler, directory=str(ROOT_DIR))
    for offset in range(max_attempts):
        port = start_port + offset
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), handler_cls)
            return server, port
        except OSError:
            continue
    raise RuntimeError(f"포트 {start_port}~{start_port + max_attempts - 1}가 모두 사용 중입니다.")


def main() -> int:
    parser = argparse.ArgumentParser(description="틈(Teum) 로컬 하이브리드 개발 서버")
    parser.add_argument("--port", type=int, default=8765, help="시작 포트 번호 (기본: 8765)")
    parser.add_argument("--no-browser", action="store_true", help="브라우저 자동 열기 비활성화")
    args = parser.parse_args()

    if not (ROOT_DIR / "data.js").is_file():
        print("[Teum Server] data.js가 없어 초기 베이킹을 실행합니다...")
        bake_data.bake(ROOT_DIR)

    server, port = _bind_server(args.port)
    admin_url = f"http://127.0.0.1:{port}/admin.html"
    portal_url = f"http://127.0.0.1:{port}/index.html"
    print(f"[Teum Server] 실행 중: {portal_url}")
    print(f"[Teum Server] 관리자 스튜디오: {admin_url}")
    print("[Teum Server] 종료하려면 Ctrl+C를 누르세요.")

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(admin_url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Teum Server] 서버를 종료합니다.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
