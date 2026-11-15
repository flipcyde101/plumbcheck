"""Standard-library Python client for PlumbCheck's fixture MCP server.

Only calls through this client are replayed. Agent Python itself is not isolated.
"""
import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading


class ContractFailed(RuntimeError):
    pass


class ReplayClient:
    def __init__(self, contract, case, *, node=None, server=None, out=None, timeout=30):
        self._temporary = tempfile.TemporaryDirectory(prefix="plumbcheck-python-") if out is None else None
        self.out = Path(out or self._temporary.name).resolve()
        script = Path(server) if server else Path(__file__).resolve().parents[2] / "bin" / "plumbcheck-mcp.js"
        self._queue = queue.Queue()
        self._lock = threading.Lock()
        self._id = 0
        self._closed = False
        self.timeout = timeout
        self.report = None
        self._process = subprocess.Popen(
            [node or os.environ.get("PLUMBCHECK_NODE", "node"), str(script), str(Path(contract).resolve()), case, "--out", str(self.out)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        threading.Thread(target=self._read, daemon=True).start()
        try:
            self._request("initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "plumbcheck-python", "version": "0.2.0"}})
        except Exception:
            self.close(check=False)
            raise

    def _read(self):
        try:
            for line in self._process.stdout:
                self._queue.put(json.loads(line))
        except Exception as error:
            self._queue.put(error)
        finally:
            self._queue.put(EOFError("Fixture server disconnected."))

    def _request(self, method, params):
        with self._lock:
            if self._closed:
                raise RuntimeError("Replay client is closed.")
            self._id += 1
            self._process.stdin.write(json.dumps({"jsonrpc": "2.0", "id": self._id, "method": method, "params": params}) + "\n")
            self._process.stdin.flush()
            value = self._queue.get(timeout=self.timeout)
            if isinstance(value, BaseException):
                raise value
            if value.get("id") != self._id:
                raise RuntimeError("Unexpected response ID from fixture server.")
            if "error" in value:
                raise ContractFailed(value["error"]["message"])
            return value["result"]

    def call_tool(self, name, arguments=None):
        result = self._request("tools/call", {"name": name, "arguments": arguments or {}})
        if result.get("isError"):
            raise ContractFailed("Tool replay failed. Inspect the saved report for evidence.")
        return result.get("structuredContent", result)

    def close(self, *, check=True):
        if self._closed:
            return self.report
        self._closed = True
        try:
            self._process.stdin.close()
            try:
                code = self._process.wait(timeout=self.timeout)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait()
                raise TimeoutError("Fixture server did not shut down in time.")
            report = self.out / "report.json"
            if report.exists():
                self.report = json.loads(report.read_text(encoding="utf-8"))
            if check and (code != 0 or not self.report or not self.report.get("passed")):
                raise ContractFailed("Agent execution failed the contract. Inspect client.report or the output directory.")
            return self.report
        finally:
            if self._temporary:
                self._temporary.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, error_type, error, traceback):
        self.close(check=error is None)


class AsyncReplayClient:
    """For async Python agents; each request uses the same serialized transport."""
    def __init__(self, *args, **kwargs):
        self._args, self._kwargs = args, kwargs
        self.client = None

    async def __aenter__(self):
        import asyncio
        self.client = await asyncio.to_thread(ReplayClient, *self._args, **self._kwargs)
        return self

    async def call_tool(self, name, arguments=None):
        import asyncio
        return await asyncio.to_thread(self.client.call_tool, name, arguments)

    async def __aexit__(self, error_type, error, traceback):
        import asyncio
        await asyncio.to_thread(self.client.close, check=error is None)
