"""Đo độ trễ các endpoint chính trên một backend đang chạy.

Chạy:  python eval/measure_api_latency.py --base-url http://localhost:8001 --email ... --password ...
Mật khẩu có thể lấy từ biến môi trường EVAL_PASSWORD. Chỉ gọi các endpoint đọc (GET) sau khi đăng nhập.
"""

import argparse
import json
import os
import statistics
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENDPOINTS = [
    ("health", "/health", False),
    ("health_ready", "/health/ready", False),
    ("auth_me", "/api/v1/auth/me", True),
    ("thresholds", "/api/v1/thresholds", True),
    ("reconciliations", "/api/v1/reconciliations", True),
    ("dashboard_stats", "/api/v1/reconciliations/stats", True),
    ("upload_batches", "/api/v1/uploads/batches", True),
    ("audit_logs", "/api/v1/audit-logs", True),
]


def request(url: str, token: str | None = None, body: dict | None = None) -> float:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers)
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=30) as response:
        response.read()
    return (time.perf_counter() - started) * 1000


def percentile(values: list[float], pct: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(pct / 100 * (len(ordered) - 1)))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8001")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", default=os.environ.get("EVAL_PASSWORD"))
    parser.add_argument("--requests", type=int, default=30)
    parser.add_argument("--json", type=Path, default=ROOT / "eval" / "results" / "api_latency.json")
    args = parser.parse_args()
    if not args.password:
        raise SystemExit("Cần --password hoặc biến môi trường EVAL_PASSWORD.")

    base = args.base_url.rstrip("/")
    login_ms = []
    token = None
    for _ in range(5):
        started = time.perf_counter()
        req = urllib.request.Request(
            f"{base}/api/v1/auth/login",
            data=json.dumps({"email": args.email, "password": args.password}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            token = json.load(response)["access_token"]
        login_ms.append((time.perf_counter() - started) * 1000)

    results = {"login": login_ms}
    for name, path, needs_auth in ENDPOINTS:
        request(base + path, token if needs_auth else None)  # warm-up, không tính
        results[name] = [request(base + path, token if needs_auth else None) for _ in range(args.requests)]

    summary = {
        name: {
            "samples": len(values),
            "p50_ms": round(statistics.median(values), 1),
            "p95_ms": round(percentile(values, 95), 1),
            "max_ms": round(max(values), 1),
        }
        for name, values in results.items()
    }
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps({"base_url": base, "summary": summary}, indent=2), encoding="utf-8")
    for name, row in summary.items():
        print(f"{name:<18} n={row['samples']:<3} p50={row['p50_ms']:>7}ms p95={row['p95_ms']:>7}ms max={row['max_ms']:>7}ms")


if __name__ == "__main__":
    main()
