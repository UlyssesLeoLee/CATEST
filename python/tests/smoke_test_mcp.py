#!/usr/bin/env python3
"""Smoke test for mcp-facade MCP Server.

Spins up:
1. A mock memory-service on :34092 (returns canned data, no Kafka/Qdrant needed)
2. The real mcp-facade on :34098 (with FastMCP at /mcp)

Then tests:
- GET /healthz on both services
- MCP protocol: list tools (Streamable HTTP)
- MCP protocol: call search_project_context tool
- MCP protocol: call get_current_requirement tool
"""

import asyncio
import json
import sys
import time
import signal

import httpx
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from multiprocessing import Process

# ─── 1. Mock memory-service ──────────────────────────────────────────

mock_app = FastAPI(title="mock-memory-service")


@mock_app.get("/healthz")
async def mock_healthz():
    return {"status": "ok", "service": "mock-memory-service"}


class MockSearchReq(BaseModel):
    query: str
    project: str | None = None
    top_k: int = 5


@mock_app.post("/search")
async def mock_search(req: MockSearchReq):
    return {
        "results": [
            {
                "id": "mock-001",
                "score": 0.92,
                "trace_id": "trace-smoke-test-001",
                "project": req.project or "default",
                "title": "Mock requirement: steampunk UI refactor",
                "summary": "Refactor the orchestration UI with steampunk theme",
                "tasks": ["Add copper accents", "Implement glass-panel effect"],
                "status": "confirmed",
                "created_at": "2026-03-30T10:00:00+00:00",
            },
            {
                "id": "mock-002",
                "score": 0.85,
                "trace_id": "trace-smoke-test-002",
                "project": req.project or "default",
                "title": "Mock requirement: Kafka topic setup",
                "summary": "Configure 9 orchestration Kafka topics",
                "tasks": ["Create topics", "Set retention policy"],
                "status": "stored",
                "created_at": "2026-03-29T08:00:00+00:00",
            },
        ]
    }


@mock_app.post("/search/memory")
async def mock_search_memory(req: MockSearchReq):
    return {
        "results": [
            {
                "id": "mem-001",
                "score": 0.88,
                "trace_id": "trace-exec-001",
                "project": req.project or "default",
                "status": "success",
                "output": "Deployment completed in 45s",
            }
        ]
    }


@mock_app.get("/history/{project}")
async def mock_history(project: str, limit: int = 20):
    return {
        "project": project,
        "results": [
            {
                "id": "hist-001",
                "trace_id": "trace-smoke-test-001",
                "project": project,
                "title": "Smoke test requirement",
                "summary": "This is a smoke test entry",
                "tasks": ["Task A", "Task B"],
                "status": "confirmed",
                "created_at": "2026-03-30T10:00:00+00:00",
            }
        ],
    }


class MockStoreReq(BaseModel):
    trace_id: str
    title: str
    summary: str
    tasks: list[str]
    constraints: list[str] = []
    keywords: list[str] = []
    project: str = "default"


@mock_app.post("/store")
async def mock_store(req: MockStoreReq):
    return {"status": "stored", "point_id": "mock-point-999", "trace_id": req.trace_id}


class MockCallbackReq(BaseModel):
    trace_id: str
    adapter: str = "mcp_agent"
    status: str = "success"
    output: dict = {}
    artifacts: list = []
    error: str | None = None


# Mock intent-gateway callback
mock_gateway_app = FastAPI(title="mock-intent-gateway")


@mock_gateway_app.post("/callback/result")
async def mock_callback(req: MockCallbackReq):
    return {"status": "recorded", "trace_id": req.trace_id}


@mock_gateway_app.get("/healthz")
async def mock_gw_healthz():
    return {"status": "ok"}


# ─── 2. Run servers in subprocesses ──────────────────────────────────


def run_mock_memory():
    uvicorn.run(mock_app, host="127.0.0.1", port=34092, log_level="warning")


def run_mock_gateway():
    uvicorn.run(mock_gateway_app, host="127.0.0.1", port=34090, log_level="warning")


def run_mcp_facade():
    import os
    os.environ["MEMORY_SERVICE_URL"] = "http://127.0.0.1:34092"
    os.environ["INTENT_GATEWAY_URL"] = "http://127.0.0.1:34090"
    os.environ["CATEST_AI_QDRANT_URL"] = "http://127.0.0.1:6333"
    os.environ["CATEST_AI_KAFKA_BROKER"] = "127.0.0.1:9092"
    # Import AFTER env is set
    from catest_ai.mcp_facade.main import app as facade_app
    uvicorn.run(facade_app, host="127.0.0.1", port=34098, log_level="warning")


# ─── 3. Test functions ───────────────────────────────────────────────

PASS = "[PASS]"
FAIL = "[FAIL]"


async def test_healthz():
    """Test healthz endpoints."""
    async with httpx.AsyncClient() as client:
        # Mock memory-service
        r = await client.get("http://127.0.0.1:34092/healthz")
        assert r.status_code == 200
        assert r.json()["service"] == "mock-memory-service"
        print(f"  {PASS} mock memory-service /healthz")

        # MCP facade
        r = await client.get("http://127.0.0.1:34098/healthz")
        assert r.status_code == 200
        data = r.json()
        assert data["mcp_endpoint"] == "/mcp"
        print(f"  {PASS} mcp-facade /healthz (mcp_endpoint={data['mcp_endpoint']})")


async def test_mcp_initialize():
    """Test MCP protocol initialization via Streamable HTTP."""
    async with httpx.AsyncClient() as client:
        # MCP uses JSON-RPC over HTTP POST to /mcp
        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "smoke-test", "version": "1.0.0"},
            },
        }
        r = await client.post(
            "http://127.0.0.1:34098/mcp",
            json=init_req,
            headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
        )
        print(f"  MCP init response status: {r.status_code}")
        print(f"  MCP init response headers: Content-Type={r.headers.get('content-type', 'N/A')}")

        # Parse SSE or JSON response
        body = r.text
        if "text/event-stream" in r.headers.get("content-type", ""):
            # Parse SSE events
            events = []
            for line in body.split("\n"):
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            if events:
                data = events[0]
            else:
                data = {}
        else:
            data = r.json()

        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {body[:500]}"
        print(f"  {PASS} MCP initialize — server: {data.get('result', {}).get('serverInfo', {})}")
        return data


async def test_mcp_list_tools(session_id: str | None = None):
    """List available MCP tools."""
    async with httpx.AsyncClient() as client:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if session_id:
            headers["Mcp-Session-Id"] = session_id

        # First initialize
        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "smoke-test", "version": "1.0.0"},
            },
        }
        r = await client.post("http://127.0.0.1:34098/mcp", json=init_req, headers=headers)

        # Extract session ID from response
        sid = r.headers.get("mcp-session-id", session_id)
        if sid:
            headers["Mcp-Session-Id"] = sid

        # Send initialized notification
        notif = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
        }
        await client.post("http://127.0.0.1:34098/mcp", json=notif, headers=headers)

        # List tools
        list_req = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {},
        }
        r = await client.post("http://127.0.0.1:34098/mcp", json=list_req, headers=headers)

        body = r.text
        if "text/event-stream" in r.headers.get("content-type", ""):
            events = []
            for line in body.split("\n"):
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            data = events[0] if events else {}
        else:
            data = r.json()

        tools = data.get("result", {}).get("tools", [])
        tool_names = [t["name"] for t in tools]
        print(f"  {PASS} MCP tools/list — found {len(tools)} tools: {tool_names}")

        expected_tools = {"get_current_requirement", "search_project_context", "search_execution_history", "store_requirement", "submit_result"}
        missing = expected_tools - set(tool_names)
        if missing:
            print(f"  {FAIL} Missing expected tools: {missing}")
        else:
            print(f"  {PASS} All 5 expected tools present")

        return sid, tools


async def test_mcp_call_tool(session_id: str | None = None):
    """Call search_project_context via MCP protocol."""
    async with httpx.AsyncClient() as client:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }

        # Initialize
        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "smoke-test", "version": "1.0.0"},
            },
        }
        r = await client.post("http://127.0.0.1:34098/mcp", json=init_req, headers=headers)
        sid = r.headers.get("mcp-session-id")
        if sid:
            headers["Mcp-Session-Id"] = sid

        # Initialized notification
        notif = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        await client.post("http://127.0.0.1:34098/mcp", json=notif, headers=headers)

        # Call search_project_context
        call_req = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "search_project_context",
                "arguments": {
                    "query": "steampunk UI refactor",
                    "project": "default",
                    "top_k": 3,
                },
            },
        }
        r = await client.post("http://127.0.0.1:34098/mcp", json=call_req, headers=headers)

        body = r.text
        if "text/event-stream" in r.headers.get("content-type", ""):
            events = []
            for line in body.split("\n"):
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            data = events[0] if events else {}
        else:
            data = r.json()

        content = data.get("result", {}).get("content", [])
        if content:
            tool_output = json.loads(content[0].get("text", "{}"))
            results = tool_output.get("results", [])
            print(f"  {PASS} MCP tools/call search_project_context — returned {len(results)} results")
            if results:
                print(f"       Top result: {results[0].get('title', 'N/A')} (score: {results[0].get('_reranked_score', results[0].get('score', 'N/A'))})")
        else:
            print(f"  {FAIL} MCP tools/call returned no content: {json.dumps(data, indent=2)[:500]}")

        # Call get_current_requirement
        call_req2 = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "get_current_requirement",
                "arguments": {
                    "trace_id": "trace-smoke-test-001",
                    "project": "default",
                },
            },
        }
        r = await client.post("http://127.0.0.1:34098/mcp", json=call_req2, headers=headers)

        body = r.text
        if "text/event-stream" in r.headers.get("content-type", ""):
            events = []
            for line in body.split("\n"):
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            data = events[0] if events else {}
        else:
            data = r.json()

        content = data.get("result", {}).get("content", [])
        if content:
            tool_output = json.loads(content[0].get("text", "{}"))
            if "error" not in tool_output:
                print(f"  {PASS} MCP tools/call get_current_requirement — trace_id={tool_output.get('trace_id', 'N/A')}, title={tool_output.get('title', 'N/A')}")
            else:
                print(f"  {FAIL} get_current_requirement error: {tool_output['error']}")
        else:
            print(f"  {FAIL} get_current_requirement returned no content")

        # Call submit_result
        call_req3 = {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {
                "name": "submit_result",
                "arguments": {
                    "trace_id": "trace-smoke-test-001",
                    "status": "success",
                    "output": json.dumps({"message": "Smoke test completed"}),
                },
            },
        }
        r = await client.post("http://127.0.0.1:34098/mcp", json=call_req3, headers=headers)

        body = r.text
        if "text/event-stream" in r.headers.get("content-type", ""):
            events = []
            for line in body.split("\n"):
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            data = events[0] if events else {}
        else:
            data = r.json()

        content = data.get("result", {}).get("content", [])
        if content:
            tool_output = json.loads(content[0].get("text", "{}"))
            print(f"  {PASS} MCP tools/call submit_result — status={tool_output.get('status', 'N/A')}")
        else:
            print(f"  {FAIL} submit_result returned no content")


# ─── 4. Main ─────────────────────────────────────────────────────────


async def wait_for_server(url: str, name: str, timeout: float = 15.0):
    """Wait until a server responds to healthz."""
    start = time.time()
    async with httpx.AsyncClient() as client:
        while time.time() - start < timeout:
            try:
                r = await client.get(url)
                if r.status_code == 200:
                    return True
            except httpx.ConnectError:
                pass
            await asyncio.sleep(0.3)
    print(f"  {FAIL} {name} did not start within {timeout}s")
    return False


async def run_tests():
    print("\n" + "=" * 60)
    print("  MCP Facade Smoke Test")
    print("=" * 60)

    print("\n[1/4] Healthz checks...")
    await test_healthz()

    print("\n[2/4] MCP initialize...")
    await test_mcp_initialize()

    print("\n[3/4] MCP list tools...")
    await test_mcp_list_tools()

    print("\n[4/4] MCP call tools (search + get + submit)...")
    await test_mcp_call_tool()

    print("\n" + "=" * 60)
    print("  Smoke test complete!")
    print("=" * 60 + "\n")


def main():
    procs = []
    try:
        # Start mock services
        p1 = Process(target=run_mock_memory, daemon=True)
        p2 = Process(target=run_mock_gateway, daemon=True)
        p3 = Process(target=run_mcp_facade, daemon=True)

        p1.start()
        p2.start()
        procs.extend([p1, p2])

        # Wait for mock services
        ok = asyncio.run(wait_for_server("http://127.0.0.1:34092/healthz", "mock-memory-service"))
        if not ok:
            sys.exit(1)

        ok = asyncio.run(wait_for_server("http://127.0.0.1:34090/healthz", "mock-intent-gateway"))
        if not ok:
            sys.exit(1)

        # Start mcp-facade
        p3.start()
        procs.append(p3)

        ok = asyncio.run(wait_for_server("http://127.0.0.1:34098/healthz", "mcp-facade"))
        if not ok:
            sys.exit(1)

        # Run tests
        asyncio.run(run_tests())

    except KeyboardInterrupt:
        print("\nInterrupted")
    except Exception as e:
        print(f"\n{FAIL} Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        for p in procs:
            p.terminate()
            p.join(timeout=3)


if __name__ == "__main__":
    main()
