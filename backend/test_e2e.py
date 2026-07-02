"""End-to-end test against a running server: create a demo meeting, stream it
over the real WebSocket, verify the live channel contract (only event /
action / risk reach clients during the meeting), end it, and check the
normalized records endpoint and report."""

import asyncio
import json
import sys

import httpx
import websockets

sys.stdout.reconfigure(encoding="utf-8")

API = "http://127.0.0.1:8000"
WS = "ws://127.0.0.1:8000"

ALLOWED_LIVE = {"event", "action", "risk", "control"}


async def main():
    async with httpx.AsyncClient() as http:
        health = (await http.get(f"{API}/api/health")).json()
        print(f"health: {health}")

        meeting = (await http.post(f"{API}/api/meetings", json={"mode": "demo"})).json()
        mid = meeting["id"]
        print(f"meeting: {mid} — {meeting['title']}")

        channels: dict[str, int] = {}
        risks: list[dict] = []
        violations: list[str] = []
        async with websockets.connect(f"{WS}/ws/meeting/{mid}") as ws:
            await ws.send(json.dumps({"type": "start_demo"}))
            # Watch ~48s of playback — enough for the contradiction risk to fire.
            try:
                async with asyncio.timeout(48):
                    while True:
                        event = json.loads(await ws.recv())
                        ch = event.get("channel", "control" if event.get("type") in ("status", "report_ready", "error") else "?")
                        channels[ch] = channels.get(ch, 0) + 1
                        if ch not in ALLOWED_LIVE:
                            violations.append(f"{ch}:{event.get('type')}")
                        if event.get("type") == "risk":
                            risks.append(event)
            except TimeoutError:
                pass
            await ws.send(json.dumps({"type": "end", "my_name": "Me"}))
            try:
                async with asyncio.timeout(30):
                    while True:
                        event = json.loads(await ws.recv())
                        if event.get("type") == "report_ready":
                            break
            except TimeoutError:
                print("FAIL: no report_ready within 30s")
                return 1

        print(f"live channels: {channels}")
        print(f"risks surfaced live: {len(risks)}")
        for r in risks:
            print(f"  - [{r['kind']}] {r['title']}: {r['text'][:90]}")
        assert not violations, f"silent-channel leak during live meeting: {violations[:5]}"
        assert channels.get("event"), "no transcript events"
        assert channels.get("action"), "no action captures"
        assert risks, "no risk fired (contradiction expected from seeded history)"

        records = (await http.get(f"{API}/api/meetings/{mid}/records")).json()
        assert set(records) == {"meeting", "events", "actions", "decisions", "risks", "notes"}
        print(f"records: {len(records['events'])} events, {len(records['actions'])} actions, "
              f"{len(records['decisions'])} decisions, {len(records['risks'])} risks, "
              f"{len(records['notes'])} notes")
        assert records["risks"], "records endpoint has no risks"

        report = (await http.get(f"{API}/api/meetings/{mid}/report")).json()
        assert report["report_md"], "report missing"
        print(f"report length: {len(report['report_md'])} chars")
        print("E2E OK")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
