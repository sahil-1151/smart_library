#!/usr/bin/env python3
"""
Smart Library backend server
- Serves static files from project root
- Saves updated .txt datasets from the frontend
"""

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib import error as urllib_error
from urllib import request as urllib_request

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))


def load_local_env_file():
    """Load a simple .env file from the project root without extra dependencies."""
    env_path = os.path.join(ROOT_DIR, ".env")
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


load_local_env_file()

API_PORT = os.environ.get("API_PORT", "5050").strip() or "5050"
SAVE_TOKEN = os.environ.get("SMART_LIBRARY_TOKEN", "").strip()
API_PROXY_URL = os.environ.get(
    "SMART_LIBRARY_API_PROXY_URL",
    f"http://127.0.0.1:{API_PORT}",
).rstrip("/")
EMAIL_PROXY_URL = os.environ.get("SMART_LIBRARY_EMAIL_PROXY_URL", "http://127.0.0.1:8081").rstrip("/")
EMAIL_PROXY_PATHS = {
    "/send_otp",
    "/verify_otp",
    "/send_issue_approval",
    "/send_contact_message",
}
ALLOWED_FILES = {
    "data_book.txt",
    "user_login.txt",
    "admin_login.txt",
    "issue_book.txt",
    "queue_book.txt",
}

class BackendHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Smart-Library-Session, "
            "X-Smart-Library-Actor-Id, X-Smart-Library-Actor-Role, X-Smart-Library-Actor-Email",
        )
        super().end_headers()

    def _normalized_path(self):
        return self.path.split("?", 1)[0]

    def _is_api_proxy_path(self):
        normalized = self._normalized_path()
        return normalized == "/api" or normalized.startswith("/api/")

    def _is_email_proxy_path(self):
        return self._normalized_path() in EMAIL_PROXY_PATHS

    def _send_json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def _read_request_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length > 0 else None

    def _copy_response_headers(self, headers):
        skipped = {
            "connection",
            "content-length",
            "date",
            "server",
            "transfer-encoding",
        }
        for key, value in headers.items():
            if key.lower() in skipped:
                continue
            self.send_header(key, value)

    def _proxy_request(self, base_url):
        target_url = f"{base_url}{self.path}"
        body = self._read_request_body() if self.command in {"POST", "PUT", "PATCH"} else None
        upstream_request = urllib_request.Request(target_url, data=body, method=self.command)

        # Forward the headers the local API/email servers need.
        for header_name in (
            "Accept",
            "Content-Type",
            "Authorization",
            "X-Smart-Library-Session",
            "X-Smart-Library-Actor-Id",
            "X-Smart-Library-Actor-Role",
            "X-Smart-Library-Actor-Email",
        ):
            header_value = self.headers.get(header_name)
            if header_value:
                upstream_request.add_header(header_name, header_value)
        client_ip = (self.client_address[0] or "").strip() if self.client_address else ""
        if client_ip:
            upstream_request.add_header("X-Forwarded-For", client_ip)

        try:
            with urllib_request.urlopen(upstream_request, timeout=30) as upstream_response:
                response_body = upstream_response.read()
                self.send_response(upstream_response.status)
                self._copy_response_headers(upstream_response.headers)
                if "Content-Type" not in upstream_response.headers:
                    self.send_header("Content-Type", "application/octet-stream")
                self.end_headers()
                if response_body:
                    self.wfile.write(response_body)
        except urllib_error.HTTPError as exc:
            response_body = exc.read()
            self.send_response(exc.code)
            self._copy_response_headers(exc.headers)
            if "Content-Type" not in exc.headers:
                self.send_header("Content-Type", "application/octet-stream")
            self.end_headers()
            if response_body:
                self.wfile.write(response_body)
        except urllib_error.URLError:
            service_name = "API" if base_url == API_PROXY_URL else "email"
            self._send_json(502, {
                "ok": False,
                "error": f"Unable to reach local {service_name} service at {base_url}.",
            })

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self._is_api_proxy_path() and self._normalized_path() != "/api/save":
            self._proxy_request(API_PROXY_URL)
            return

        if self._is_email_proxy_path():
            self._proxy_request(EMAIL_PROXY_URL)
            return

        if self.path != "/api/save":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        if SAVE_TOKEN:
            client_token = self.headers.get("X-Auth-Token", "").strip()
            if client_token != SAVE_TOKEN:
                self._send_json(403, {"ok": False, "error": "Forbidden"})
                return

        raw = self._read_request_body()
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._send_json(400, {"ok": False, "error": "Invalid JSON"})
            return

        files = payload.get("files", {})
        if not isinstance(files, dict):
            self._send_json(400, {"ok": False, "error": "files must be an object"})
            return

        written = []
        for name, content in files.items():
            if name not in ALLOWED_FILES:
                continue
            if content is None:
                content = ""
            if not isinstance(content, str):
                content = str(content)
            if content and not content.endswith("\n"):
                content += "\n"
            path = os.path.join(ROOT_DIR, name)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            written.append(name)

        self._send_json(200, {"ok": True, "written": written})

    def do_PUT(self):
        if self._is_api_proxy_path():
            self._proxy_request(API_PROXY_URL)
            return
        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_DELETE(self):
        if self._is_api_proxy_path():
            self._proxy_request(API_PROXY_URL)
            return
        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_GET(self):
        if self._is_api_proxy_path():
            self._proxy_request(API_PROXY_URL)
            return
        if self.path == "/api/ping":
            self._send_json(200, {"ok": True})
            return
        super().do_GET()

    def log_message(self, format, *args):
        return


def run(port=8080):
    server = ThreadingHTTPServer(("", port), BackendHandler)
    print(f"Smart Library server running at http://localhost:{port}")
    print(f"Proxying API requests to {API_PROXY_URL}")
    print(f"Proxying email requests to {EMAIL_PROXY_URL}")
    print("POST /api/save to persist datasets")
    server.serve_forever()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    if len(os.sys.argv) > 1:
        port = int(os.sys.argv[1])
    run(port)
