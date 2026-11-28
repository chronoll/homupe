"""No-model tests for the container's confined source/evidence MCP server."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[2] / ".factory" / "read-tools.py"
SPEC = importlib.util.spec_from_file_location("factory_read_tools", SCRIPT)
READ = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(READ)


class ReadToolsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / "source"
        self.evidence = self.base / "evidence"
        self.source.mkdir()
        self.evidence.mkdir()
        self.roots = patch.object(READ, "ROOTS", {"source": self.source, "evidence": self.evidence})
        self.roots.start()
        self.addCleanup(self.roots.stop)
        (self.source / "README.md").write_text("first line\nliteral [a-z]+\nthird line\n")
        (self.evidence / "diff.patch").write_text("fixed candidate diff\n")

    def test_list_read_search_and_evidence_are_useful_without_shell(self):
        self.assertEqual(READ.invoke("list_files", {}), {"files": ["README.md"], "truncated": False})
        self.assertEqual(READ.invoke("read_file", {"path": "README.md", "start_line": 2, "line_count": 1}),
                         {"lines": [{"line": 2, "text": "literal [a-z]+"}], "total_lines": 3,
                          "sha256": hashlib.sha256((self.source / "README.md").read_bytes()).hexdigest()})
        result = READ.invoke("search", {"query": "[a-z]+"})
        self.assertEqual(result["matches"], [{"file": "README.md", "line": 2, "text": "literal [a-z]+"}])
        self.assertEqual(READ.invoke("read_file", {"root": "evidence", "path": "diff.patch"})["lines"][0]["text"],
                         "fixed candidate diff")

    def test_credentials_and_generated_paths_are_excluded(self):
        for name in (".env.local", ".mcp.json"):
            (self.source / name).write_text("secret")
        for directory in (".git", ".codex", ".claude", "node_modules", ".factory-state", ".next"):
            (self.source / directory).mkdir()
            (self.source / directory / "secret.json").write_text("secret")
            with self.assertRaises(ValueError):
                READ.invoke("read_file", {"path": directory + "/secret.json"})
        self.assertEqual(READ.invoke("list_files", {})["files"], ["README.md"])
        self.assertEqual(READ.invoke("search", {"query": "secret"})["matches"], [])
        with self.assertRaises(ValueError):
            READ.invoke("read_file", {"path": ".env.local"})

    def test_paths_cannot_escape_or_select_a_third_root(self):
        (self.base / "credential.json").write_text("outside-secret")
        for arguments in ({"path": "../credential.json"}, {"path": "/home/node/.codex/auth.json"},
                          {"root": "home", "path": "credential.json"}):
            with self.subTest(arguments=arguments), self.assertRaises((ValueError, KeyError)):
                READ.invoke("read_file", arguments)
        for name in ("read_file", "list_files", "search"):
            request = {"name": name, "arguments": {"root": "source", "path": "../credential.json", "query": "secret"}}
            result = READ.handle({"method": "tools/call", "params": request})
            self.assertTrue(result["isError"])
            self.assertNotIn("outside-secret", json.dumps(result))
            self.assertNotIn(str(self.base), json.dumps(result))

    def test_symlinks_hardlinks_and_large_files_are_unreadable(self):
        outside = self.base / "outside"
        outside.mkdir()
        secret = outside / "secret.txt"
        secret.write_text("secret")
        (self.source / "link.txt").symlink_to(secret)
        (self.source / "link-dir").symlink_to(outside, target_is_directory=True)
        os.link(secret, self.source / "hard.txt")
        (self.source / "large.txt").write_bytes(b"x" * (READ.MAX_FILE + 1))
        for path in ("link.txt", "link-dir/secret.txt", "hard.txt", "large.txt"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                READ.invoke("read_file", {"path": path})
        self.assertEqual(READ.invoke("list_files", {})["files"], ["README.md"])

    def test_tool_and_argument_allowlists_and_output_caps(self):
        for name, arguments in (("exec", {"command": "id"}), ("read_file", {"path": "README.md", "line_count": 401}),
                                ("read_file", {"path": "README.md", "start_line": True}),
                                ("search", {"query": ""}), ("search", {"query": "x" * 257}),
                                ("list_files", {"command": "id"})):
            with self.subTest(name=name, arguments=arguments), self.assertRaises(ValueError):
                READ.invoke(name, arguments)
        (self.source / "long.txt").write_text("x" * (READ.MAX_RESPONSE + 1))
        result = READ.handle({"method": "tools/call", "params": {
            "name": "read_file", "arguments": {"path": "long.txt"}}})
        self.assertTrue(result["isError"])
        self.assertLess(len(json.dumps(result)), 1000)
        definitions = READ.tools()
        self.assertEqual({tool["name"] for tool in definitions}, {"list_files", "read_file", "search", "read_image"})
        self.assertTrue(all(tool["annotations"]["readOnlyHint"] for tool in definitions))

    def test_stdio_protocol_initialization_notifications_and_bad_requests(self):
        requests = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
                "name": "read_file", "arguments": {"path": "/home/node/.codex/auth.json"}}},
        ]
        data = "\n".join(json.dumps(request) for request in requests) + "\nnot json\n"
        completed = subprocess.run([sys.executable, "-I", str(SCRIPT)], input=data,
                                   text=True, capture_output=True, check=True, timeout=5)
        responses = [json.loads(line) for line in completed.stdout.splitlines()]
        self.assertEqual([response["id"] for response in responses], [1, 2, 3, None])
        self.assertEqual(responses[0]["result"]["protocolVersion"], "2024-11-05")
        self.assertEqual(len(responses[1]["result"]["tools"]), 4)
        self.assertTrue(responses[2]["result"]["isError"])
        self.assertIn("error", responses[3])
        self.assertEqual(completed.stderr, "")

    def test_oversized_request_stops_before_dispatch(self):
        completed = subprocess.run([sys.executable, "-I", str(SCRIPT)], input="x" * (READ.MAX_REQUEST + 1),
                                   text=True, capture_output=True, check=True, timeout=5)
        self.assertEqual(completed.stdout, "")
        self.assertEqual(completed.stderr, "")

    def test_editing_requires_the_implementation_capability(self):
        with self.assertRaises(ValueError):
            READ.invoke("write_file", {"path": "new.txt", "content": "text", "expected_sha256": None})
        with patch.object(READ, "ALLOW_WRITE", True):
            definitions = READ.tools()
            self.assertEqual({tool["name"] for tool in definitions},
                             {"list_files", "read_file", "search", "read_image", "write_file", "delete_file"})
            edits = [tool for tool in definitions if tool["name"] in {"write_file", "delete_file"}]
            self.assertTrue(all(not tool["annotations"]["readOnlyHint"] for tool in edits))
        self.assertFalse((self.source / "new.txt").exists())

    def test_edits_require_exact_hashes_and_do_not_overwrite_new_files(self):
        original_hash = hashlib.sha256((self.source / "README.md").read_bytes()).hexdigest()
        with patch.object(READ, "ALLOW_WRITE", True):
            result = READ.invoke("write_file", {"path": "README.md", "content": "updated\n", "expected_sha256": original_hash})
            self.assertEqual((self.source / "README.md").read_text(), "updated\n")
            for arguments in ({"path": "README.md", "content": "stale", "expected_sha256": original_hash},
                              {"path": "README.md", "content": "new", "expected_sha256": None},
                              {"path": "README.md", "content": "no hash"}):
                with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                    READ.invoke("write_file", arguments)
            created = READ.invoke("write_file", {"path": "src/new.txt", "content": "new text\n", "expected_sha256": None})
            self.assertEqual(READ.invoke("read_file", {"path": "src/new.txt"})["sha256"], created["sha256"])
            with self.assertRaises(ValueError):
                READ.invoke("delete_file", {"path": "src/new.txt", "expected_sha256": None})
            READ.invoke("delete_file", {"path": "src/new.txt", "expected_sha256": created["sha256"]})
            self.assertFalse((self.source / "src/new.txt").exists())
            READ.invoke("delete_file", {"path": "README.md", "expected_sha256": result["sha256"]})
            self.assertFalse((self.source / "README.md").exists())

    def test_edits_reject_protected_case_aliases_other_roots_and_links(self):
        outside = self.base / "outside"
        outside.mkdir()
        (self.source / "link").symlink_to(outside, target_is_directory=True)
        with patch.object(READ, "ALLOW_WRITE", True):
            for path in (".GIT/config", ".Git", ".FaCtOrY/read-tools.py", ".github/workflows/test.yml",
                         "FaCtOrY/runtime.py", "AgEnTs.md", "src/CLAUDE.MD", "PACKAGE.JSON",
                         "package-lock.json", "nested/.ENV.local", ".CoDeX/config.toml", ".MCP.JSON",
                         "nested/.gitattributes", ".GITMODULES", "bin/FACTORY", "../outside/new.txt",
                         "/home/node/.codex/auth.json", "/evidence/schema.json", "link/new.txt"):
                with self.subTest(path=path), self.assertRaises(ValueError):
                    READ.invoke("write_file", {"path": path, "content": "denied", "expected_sha256": None})
            for arguments in ({"path": "README.md", "content": "denied", "expected_sha256": None, "root": "evidence"},
                              {"path": "README.md", "content": "denied", "expected_sha256": "invalid"}):
                with self.assertRaises(ValueError):
                    READ.invoke("write_file", arguments)
        self.assertEqual(list(outside.iterdir()), [])
        self.assertEqual((self.source / "README.md").read_text(), "first line\nliteral [a-z]+\nthird line\n")

    def test_image_tool_reads_only_bounded_dispatcher_png_evidence(self):
        screenshots = self.evidence / "screenshots"
        screenshots.mkdir()
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3XQAAAAASUVORK5CYII=")
        (screenshots / "small.png").write_bytes(png)
        response = READ.handle({"method": "tools/call", "params": {"name": "read_image", "arguments": {"path": "screenshots/small.png"}}})
        self.assertFalse(response["isError"])
        self.assertEqual(response["content"][0]["type"], "image")
        self.assertEqual(base64.b64decode(response["content"][0]["data"]), png)
        (screenshots / "fake.png").write_text("not a PNG")
        (screenshots / "big.png").write_bytes(b"x" * (READ.MAX_IMAGE + 1))
        for arguments in ({"path": "/home/node/.codex/auth.json"}, {"path": "../source/README.md"},
                          {"path": "screenshots/fake.png"}, {"path": "screenshots/big.png"},
                          {"path": "screenshots/small.png", "root": "source"}):
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                READ.invoke("read_image", arguments)

    def test_single_model_catalog_removes_builtin_process_file_and_agent_tools(self):
        catalog = json.loads((SCRIPT.parent / "model-catalog.json").read_text())
        self.assertEqual(set(catalog), {"models"})
        self.assertEqual(len(catalog["models"]), 1)
        model = catalog["models"][0]
        self.assertEqual(model["slug"], "gpt-5.6-sol")
        self.assertEqual(model["shell_type"], "disabled")
        self.assertIsNone(model["apply_patch_tool_type"])
        self.assertEqual(model["experimental_supported_tools"], [])
        self.assertEqual(model["tool_mode"], "direct")
        self.assertTrue(model["node_repl_disabled"])
        self.assertFalse(model["supports_search_tool"])
        self.assertIsNone(model["multi_agent_version"])
        self.assertNotIn("model_messages", model)
        self.assertNotIn("account_id", model)
        self.assertIn("factory_source", model["base_instructions"])


if __name__ == "__main__":
    unittest.main()
