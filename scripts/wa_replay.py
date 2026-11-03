#!/usr/bin/env python3
"""wa_replay.py — offline replay of captured Meta webhook events.

Usage:
    python scripts/wa_replay.py gateway/sample_events/inbound_text.json
    python scripts/wa_replay.py                # lists available fixtures
    python scripts/wa_replay.py --send         # extra: dry-run /send + outbox test

Feeds the captured JSON to the same Gateway process_webhook() path that
the live /whatsapp endpoint uses, in DRY-RUN mode: no Meta calls, no
Supabase writes. The gateway's DRY log lines are the observable output —
read them to confirm routing / dedup / status backfill decisions.

The env file (default /home/adorneltarget/.config/franel-gateway.env, overridable
via FRANEL_GATEWAY_ENV) is only used for DB URL detection in dry-run clinic
seeding; with no env file the built-in dry clinic is used, so this tool works
on any machine with stock Python 3.9+.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "gateway"))

import gateway as gw  # noqa: E402

FIXTURE_DIR = os.path.join(ROOT, "gateway", "sample_events")
APP_SECRET = """
dummy-app-secret-for-offline-replay
"""
VERIFY_TOKEN = """
local-replay-verify
"""
GATEWAY_SECRET = """
local-replay-gateway-secret
"""


def build_dry_gateway():
    env = dict(gw.load_env())
    env.update({"WA_APP_SECRET": APP_SECRET, "WA_VERIFY_TOKEN": VERIFY_TOKEN,
                "GATEWAY_SECRET": GATEWAY_SECRET})
    g = gw.Gateway(env, dry=True)
    return g


def replay_file(path, g):
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)
    print(f"\n=== replay: {os.path.basename(path)} ===")
    g.process_webhook(payload)
    print(f"=== done: {os.path.basename(path)} "
          f"(last_webhook_at={g.last_webhook_at}) ===")


def send_test(g):
    print("\n=== dry /send test (window check + chunked send + outbox) ===")
    code, out = g.do_send("dry-clinic", "+2332440000000", "hello from replay")
    print(f"/send -> {code} {out}")
    # dry-send always succeeds on its own, so exercise the outbox directly:
    g.enqueue_outbound({
        "clinic_id": "dry-clinic", "to": "2332440000001", "kind": "text",
        "payload": {"text": "queued by replay"}, "attempts": 0,
        "created_at": gw.now_iso(), "last_error": "simulated failure",
    })
    ob = g._load_outbox()
    print(f"outbox holds {len(ob)} entr(y/ies):")
    for item in ob:
        print(f"  - {item['kind']} to={item['to']} id={item.get('id')}")
    g._drain_outbox()
    ob = g._load_outbox()
    print(f"after drain: {len(ob)} pending")
    if os.path.exists(gw.OUTBOX_FILE):
        os.remove(gw.OUTBOX_FILE)
        print("outbox file removed (replay cleanup)")


def main():
    args = [a for a in sys.argv[1:]]
    if any(a in ("-h", "--help") for a in args):
        print(__doc__)
        return
    do_send = "--send" in args
    args = [a for a in args if a != "--send"]
    g = build_dry_gateway()
    if not args:
        print("capture files in %s:" % FIXTURE_DIR)
        for name in sorted(os.listdir(FIXTURE_DIR)):
            if name.endswith(".json"):
                print(f"  {name}")
        print("\nusage: python scripts/wa_replay.py <fixture.json> [--send]")
        return
    for path in args:
        replay_file(path, g)
    if do_send:
        send_test(g)


if __name__ == "__main__":
    main()