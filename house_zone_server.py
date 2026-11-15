from __future__ import annotations

import argparse
import json
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from map_builde_dense_1 import (
    DEFAULT_OUT as DENSE_DEFAULT_OUT,
    HOUSE_COUNT as DENSE_HOUSE_COUNT,
    ZONE_HEIGHT as DENSE_ZONE_HEIGHT,
    ZONE_LENGTH as DENSE_ZONE_LENGTH,
    ZONE_WIDTH as DENSE_ZONE_WIDTH,
    Zone as DenseZone,
    build_dense_payload,
)
from map_builder_house import DEFAULT_OUT as HOUSE_DEFAULT_OUT, build_payload as build_house_payload
from generation_demo_chunks_templates import wall_templates, building_long_template
from generation_cache_manifest import generation_manifest
from generation_model_cache import model_file, SourcesChanged


DENSE_CACHE: dict[tuple[int, int, int, int, int], dict] = {}


class HouseZoneHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        if urlparse(self.path).path.endswith((".html", ".js", ".mjs")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/generation-manifest":
            try:
                mode = parse_qs(parsed.query).get("mode", ["noise"])[0]
                payload = generation_manifest(mode)
            except ValueError:
                self.send_error(400, "Invalid generation mode")
                return
            self.send_json(payload)
            return
        if parsed.path == "/api/demo-building-long":
            try:
                params = parse_qs(parsed.query)
                seed = int(params.get("seed", ["42"])[0])
                length = int(params.get("length", ["960"])[0])
                if not 0 <= seed <= 0xFFFFFFFF or length not in (800, 960, 1120, 1280):
                    raise ValueError("settings")
            except ValueError:
                self.send_error(400, "Invalid Building Long settings")
                return
            self.send_model("building", seed, length, params)
            return
        if parsed.path == "/api/demo-chunks-templates":
            try:
                params = parse_qs(parsed.query)
                seed = int(params.get("seed", ["42"])[0])
                if not 0 <= seed <= 0xFFFFFFFF:
                    raise ValueError("seed")
            except ValueError:
                self.send_error(400, "Invalid seed")
                return
            self.send_model("walls", seed, None, params)
            return
        if parsed.path == "/api/house-zone":
            self.send_house_zone(parsed.query)
            return
        if parsed.path == "/api/dense-1":
            self.send_dense_1(parsed.query)
            return
        super().do_GET()

    def send_model(self, kind: str, seed: int, length: int | None, params: dict) -> None:
        try:
            path = model_file(kind, seed, length, expected=params.get("revision", [None])[0],
                              force=params.get("refresh", ["0"])[0] == "1")
        except SourcesChanged:
            self.send_error(409, "Generation sources changed; retry with a new manifest")
            return
        with path.open("rb") as source:
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(path.stat().st_size))
            self.end_headers()
            shutil.copyfileobj(source, self.wfile)

    def send_house_zone(self, query: str) -> None:
        params = parse_qs(query)
        args = SimpleNamespace(
            length=int(params.get("length", ["100"])[0]),
            width=int(params.get("width", ["100"])[0]),
            height=int(params.get("height", ["200"])[0]),
            seed=int(params.get("seed", ["42"])[0]),
            compare=params.get("compare", ["1"])[0] != "0",
            out=HOUSE_DEFAULT_OUT,
        )
        payload = build_house_payload(args)
        self.send_json(payload)

    def send_dense_1(self, query: str) -> None:
        params = parse_qs(query)
        seed = int(params.get("seed", ["42"])[0])
        target = int(params.get("houses", [str(DENSE_HOUSE_COUNT)])[0])
        zone = DenseZone(
            length=int(params.get("length", [str(DENSE_ZONE_LENGTH)])[0]),
            width=int(params.get("width", [str(DENSE_ZONE_WIDTH)])[0]),
            height=int(params.get("height", [str(DENSE_ZONE_HEIGHT)])[0]),
        )
        cache_key = (seed, target, zone.length, zone.width, zone.height)
        if cache_key in DENSE_CACHE:
            self.send_json(DENSE_CACHE[cache_key])
            return

        default_key = (42, DENSE_HOUSE_COUNT, DENSE_ZONE_LENGTH, DENSE_ZONE_WIDTH, DENSE_ZONE_HEIGHT)
        if cache_key == default_key and DENSE_DEFAULT_OUT.exists():
            payload = json.loads(DENSE_DEFAULT_OUT.read_text(encoding="utf-8"))
        else:
            payload = build_dense_payload(seed=seed, target=target, zone=zone)

        DENSE_CACHE[cache_key] = payload
        self.send_json(payload)

    def send_json(self, payload: dict) -> None:
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
    print(f"map builder hub: http://{args.host}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
