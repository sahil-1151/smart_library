#!/usr/bin/env python3
"""
Smart Library backend server
- Serves static files from project root
- Saves updated .txt datasets from the frontend
"""

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/save":
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": "Not found"}).encode())
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": "Invalid JSON"}).encode())
            return

        files = payload.get("files", {})
        if not isinstance(files, dict):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": "files must be an object"}).encode())
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

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "written": written}).encode())

    def do_GET(self):
        if self.path == "/api/ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode())
            return
        super().do_GET()

    def log_message(self, format, *args):
        return


def run(port=8000):
    server = HTTPServer(("", port), BackendHandler)
    print(f"Smart Library server running at http://localhost:{port}")
    print("POST /api/save to persist datasets")
    server.serve_forever()


if __name__ == "__main__":
    run(8000)
