#!/usr/bin/env python3
"""MiniCAD engine dev server (standalone — no Rails).

Like `python3 -m http.server`, but:
  * sends no-cache headers so the browser always picks up the latest code on a
    plain reload (Chrome otherwise caches ES modules aggressively and serves
    stale JS);
  * answers POST /api/dwg by running the DWG→DXF converter, so opening a .dwg
    works here exactly as it does under Rails. That converter lives in
    ../dwg and is GPL-3.0 — it is run as a SUBPROCESS, never imported.
    See ../dwg/README.md. If it is not installed, the endpoint returns a plain
    message and the engine still opens DXF and JSON normally.

Usage:  python3 serve.py [port]      then open http://localhost:8000
"""
import http.server
import json
import os
import subprocess
import sys
import tempfile

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8000))
HERE = os.path.dirname(os.path.abspath(__file__))
CONVERT = os.path.join(HERE, "..", "dwg", "convert.mjs")
NODE = os.environ.get("NODE_BIN", "node")

MISSING = ("The DWG converter is not installed. Run `npm install` at the repo root, "
           "or export a DXF from your CAD program and open that instead.")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") != "/api/dwg":
            self.send_error(404)
            return
        if not os.path.exists(CONVERT):
            self._json(503, {"error": MISSING})
            return

        data = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "out.dxf")
            try:
                p = subprocess.run([NODE, CONVERT, out], input=data,
                                   capture_output=True, timeout=120)
            except FileNotFoundError:
                self._json(503, {"error": MISSING})
                return
            except subprocess.TimeoutExpired:
                self._json(503, {"error": "The DWG converter timed out."})
                return

            # Success is a non-empty output FILE: the converter SIGKILLs itself
            # after writing (a clean exit costs ~3.7s) and its stdout carries the
            # wasm's own diagnostics. See ../dwg/README.md.
            if os.path.exists(out) and os.path.getsize(out) > 0:
                with open(out, "rb") as fh:
                    dxf = fh.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/dxf")
                self.send_header("Content-Length", str(len(dxf)))
                self.end_headers()
                self.wfile.write(dxf)
                return

            msg = (p.stderr.decode(errors="replace").strip().splitlines() or [""])[-1]
            self._json(400 if p.returncode in (2, 3) else 503, {"error": msg or MISSING})


if __name__ == "__main__":
    try:
        server = http.server.ThreadingHTTPServer(("", PORT), Handler)
    except OSError as e:
        if e.errno == 48:
            sys.exit(f"Port {PORT} is already in use.\n"
                     f"Pick another one:  python3 serve.py {PORT + 1}")
        raise
    print(f"MiniCAD → http://localhost:{PORT}  (Ctrl-C to stop)")
    print(f"  POST /api/dwg → {'ready' if os.path.exists(CONVERT) else 'not installed (DXF still works)'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
