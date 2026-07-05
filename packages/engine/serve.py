#!/usr/bin/env python3
"""MiniCAD dev server.

Like `python3 -m http.server`, but sends no-cache headers so the browser
always picks up the latest code on a plain reload (Chrome otherwise caches
ES modules aggressively and serves stale JS).

Usage:  python3 serve.py            then open http://localhost:8000
"""
import http.server

PORT = 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    print(f'MiniCAD → http://localhost:{PORT}  (Ctrl-C to stop)')
    http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler).serve_forever()
