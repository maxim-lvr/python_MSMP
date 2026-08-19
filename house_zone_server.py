from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from map_builder_house import DEFAULT_OUT, build_payload


class HouseZoneHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/house-zone":
            self.send_house_zone(parsed.query)
            return
        super().do_GET()

    def send_house_zone(self, query: str) -> None:
        params = parse_qs(query)
        args = SimpleNamespace(
            length=int(params.get("length", ["100"])[0]),
            width=int(params.get("width", ["100"])[0]),
            height=int(params.get("height", ["200"])[0]),
            seed=int(params.get("seed", ["42"])[0]),
            compare=params.get("compare", ["1"])[0] != "0",
            out=DEFAULT_OUT,
        )
        payload = build_payload(args)
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serveur web dynamique pour comparer house_close et house_wide.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5174)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), HouseZoneHandler)
    print(f"house zone server: http://{args.host}:{args.port}/house_zone.html")
    server.serve_forever()


if __name__ == "__main__":
    main()
