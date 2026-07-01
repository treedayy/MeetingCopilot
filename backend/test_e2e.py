"""End-to-end test against a running server: create a demo meeting, stream it
over the real WebSocket, end it, and fetch the report."""

import asyncio
import json
import sys

import httpx
import websockets

sys.stdout.reconfigure(encoding="utf-8")

API = "http://127.0.0.1:8000"
WS = "ws://127.0.0.1:8000"


async def main():
    async with httpx.AsyncClient() as http:
        health = (await http.get(f"{API}/api/health")).json()
        print(f"health: {health}")

        meeting = (await http.post(f"{API}/api/meetings", json={"mode": "demo"})).json()
        mid = meeting["id"]
        print(f"meeting: {mid} — {meeting['title']}")

        counts: dict[str, int] = {}
        async with websockets.connect(f"{WS}/ws/meeting/{mid}") as ws:
            await ws.send(json.dumps({"type": "start_demo"}))
            # Collect events for 20 seconds of live playback.
            try:
                async with asyncio.timeout(20):
                    while True:
                        event = json.loads(await ws.recv())
                        counts[event["type"]] = counts.get(event["type"], 0) + 1
            except TimeoutError:
                pass
            await ws.send(json.dumps({"type": "end", "my_name": "Me"}))
            try:
                async with asyncio.timeout(30):
                    while True:
                        event = json.loads(await ws.recv())
                        counts[event["type"]] = counts.get(event["type"], 0) + 1
                        if event["type"] == "report_ready":
                            break
            except TimeoutError:
                print("FAIL: no report_ready within 30s")
                return 1

        print(f"events received: {counts}")
        report = (await http.get(f"{API}/api/meetings/{mid}/report")).json()
        assert report["report_md"], "report missing"
        print(f"report length: {len(report['report_md'])} chars")

        detail = (await http.get(f"{API}/api/meetings/{mid}")).json()
        print(f"persisted: {len(detail['segments'])} segments, {len(detail['concepts'])} concepts, "
              f"{len(detail['actions'])} actions, {len(detail['decisions'])} decisions, "
              f"{len(detail['graph']['nodes'])} graph nodes")

        search = (await http.get(f"{API}/api/search", params={"q": "kafka"})).json()
        print(f"search 'kafka': {len(search['results'])} results")

        for evt in ("transcript_segment", "concept", "person", "graph", "report_ready"):
            assert counts.get(evt), f"missing event type {evt}"
        print("E2E OK")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
