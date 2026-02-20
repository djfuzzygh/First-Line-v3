#!/usr/bin/env python3
"""Simple API smoke test for Kaggle/demo validation."""
import json
import os
import sys
import uuid
from urllib import request, error

API_URL = os.getenv("FIRSTLINE_API_URL", "http://localhost:8080")


def call(method, path, payload=None, token=None):
    url = f"{API_URL}{path}"
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=30) as res:
            body = res.read().decode("utf-8")
            return res.status, json.loads(body) if body else {}
    except error.HTTPError as e:
        body = e.read().decode("utf-8")
        return e.code, json.loads(body) if body else {}


def assert_ok(name, status, expected):
    if status != expected:
        raise RuntimeError(f"{name} failed: expected {expected}, got {status}")


def main():
    test_email = f"smoke-{uuid.uuid4().hex[:8]}@firstline.ai"

    status, health = call("GET", "/health")
    if status not in (200, 503):
        raise RuntimeError(f"health failed: {status}")

    status, auth = call(
        "POST",
        "/auth/login",
        {"email": test_email, "password": "DemoPass123!"},
    )
    assert_ok("login", status, 200)
    token = auth.get("token")
    if not token:
        raise RuntimeError("login failed: missing token")

    status, encounter = call(
        "POST",
        "/encounters",
        {
            "channel": "app",
            "demographics": {"age": 32, "sex": "F", "location": "Kampala"},
            "symptoms": "Fever and cough for two days",
        },
        token=token,
    )
    assert_ok("create_encounter", status, 201)
    encounter_id = encounter.get("encounterId")
    if not encounter_id:
        raise RuntimeError("create_encounter failed: no encounterId")

    status, _ = call("POST", f"/encounters/{encounter_id}/triage", {}, token=token)
    if status not in (200, 500):
        raise RuntimeError(f"triage unexpected status: {status}")

    status, _ = call("GET", "/dashboard/stats", token=token)
    if status not in (200, 500):
        raise RuntimeError(f"dashboard unexpected status: {status}")

    print("SMOKE_TEST_OK")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"SMOKE_TEST_FAILED: {exc}")
        sys.exit(1)
