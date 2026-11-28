"""Bounded source/evidence MCP tools for Codex workers; no shell or credentials.

The image owns this script at /opt/factory-read-tools.py. It uses only the Python
standard library and newline-delimited JSON-RPC over stdio. Only implementation
receives --allow-write. No supplied path can select another root, follow a
symlink, or address a non-regular/hard-linked file.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile


ROOTS = {"source": Path("/workspace"), "evidence": Path("/evidence")}
MAX_REQUEST = 64 * 1024
MAX_FILE = 1024 * 1024
MAX_RESPONSE = 64 * 1024
MAX_IMAGE = 4 * 1024 * 1024
ALLOW_WRITE = False
SKIP = {".git", ".codex", ".claude", ".mcp.json", ".factory-state", "node_modules",
        ".next", ".next-fixtures", "test-results", "playwright-report", "coverage",
        "__pycache__"}
PROTECTED_ROOTS = {".github", ".factory", "factory"}
PROTECTED_NAMES = {"agents.md", "claude.md", "package.json", "package-lock.json",
                   ".gitattributes", ".gitmodules"}


def hidden(name):
    name = name.casefold()
    return name in SKIP or name.startswith(".env")


def location(root, relative, directory=False, maximum=MAX_FILE):
    if root not in ROOTS or not isinstance(relative, str):
        raise ValueError("invalid root or path")
    relative_path = Path(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError("path must stay inside its selected root")
    base = ROOTS[root].resolve(strict=True)
    target = base
    for part in relative_path.parts:
        if hidden(part):
            raise ValueError("path is excluded")
        target = target / part
        if target.is_symlink():
            raise ValueError("symlinks are excluded")
    resolved = target.resolve(strict=True)
    if not resolved.is_relative_to(base):
        raise ValueError("path must stay inside its selected root")
    metadata = resolved.stat()
    if directory:
        if not stat.S_ISDIR(metadata.st_mode):
            raise ValueError("path is not a directory")
    elif not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or metadata.st_size > maximum:
        raise ValueError("file must be regular, singly linked, and within its size limit")
    return resolved


def write_location(relative):
    if not isinstance(relative, str):
        raise ValueError("invalid source path")
    path = Path(relative)
    parts = path.parts
    folded = tuple(part.casefold() for part in parts)
    if (path.is_absolute() or not parts or ".." in parts or folded[0] in PROTECTED_ROOTS
            or any(hidden(part) or part.casefold() in PROTECTED_NAMES for part in parts)
            or folded[:2] == ("bin", "factory")):
        raise ValueError("path is protected")
    base = ROOTS["source"].resolve(strict=True)
    target = base
    for index, part in enumerate(parts):
        target = target / part
        if target.is_symlink():
            raise ValueError("symlinks are excluded")
        if target.exists():
            metadata = target.stat()
            if index < len(parts) - 1:
                if not stat.S_ISDIR(metadata.st_mode):
                    raise ValueError("parent is not a directory")
            elif not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or metadata.st_size > MAX_FILE:
                raise ValueError("target is not a bounded, singly linked regular file")
    if not target.resolve().is_relative_to(base):
        raise ValueError("path must stay inside source")
    return target


def expected_file(path, expected):
    if expected is None:
        if path.exists():
            raise ValueError("new file already exists")
        return
    if (not isinstance(expected, str) or len(expected) != 64
            or any(character not in "0123456789abcdef" for character in expected)
            or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected):
        raise ValueError("file differs from the expected SHA-256")


def edit(name, arguments):
    if not ALLOW_WRITE:
        raise ValueError("this phase cannot edit source")
    path = write_location(arguments.get("path"))
    if "expected_sha256" not in arguments:
        raise ValueError("expected_sha256 is required")
    expected = arguments["expected_sha256"]
    expected_file(path, expected)
    if name == "delete_file":
        if expected is None:
            raise ValueError("deleting requires the current SHA-256")
        path.unlink()
        return {"path": arguments["path"], "deleted": True}
    content = arguments.get("content")
    if not isinstance(content, str) or len(content.encode("utf-8")) > MAX_FILE:
        raise ValueError("content must be UTF-8 text within 1 MiB")
    path.parent.mkdir(parents=True, exist_ok=True)
    # No model tool can create links or execute processes. Still revalidate the
    # full path immediately before replacement and use a same-directory temp.
    write_location(arguments["path"])
    expected_file(path, expected)
    descriptor, temporary = tempfile.mkstemp(prefix=".factory-edit-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {"path": arguments["path"], "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest()}


def paths(root, relative):
    base = ROOTS[root].resolve(strict=True)
    start = location(root, relative, directory=True)
    count = 0
    for directory, names, filenames in os.walk(start, followlinks=False):
        names[:] = sorted(name for name in names
                          if not hidden(name) and not (Path(directory) / name).is_symlink())
        for name in sorted(filenames):
            if hidden(name):
                continue
            candidate = Path(directory) / name
            try:
                checked = location(root, candidate.relative_to(base).as_posix())
            except (OSError, ValueError):
                continue
            count += 1
            if count > 10000:
                raise ValueError("directory exceeds 10000 readable files; choose a narrower path")
            yield checked.relative_to(base).as_posix(), checked


def integer(arguments, name, default, maximum):
    value = arguments.get(name, default)
    if type(value) is not int or not 1 <= value <= maximum:
        raise ValueError("invalid " + name)
    return value


def invoke(name, arguments):
    if not isinstance(arguments, dict):
        raise ValueError("arguments must be an object")
    allowed = {"list_files": {"root", "path"},
               "read_file": {"root", "path", "start_line", "line_count"},
               "search": {"root", "path", "query"}, "read_image": {"path"},
               "write_file": {"path", "content", "expected_sha256"},
               "delete_file": {"path", "expected_sha256"}}
    if name not in allowed or set(arguments) - allowed[name]:
        raise ValueError("unknown tool or arguments")
    root = arguments.get("root", "source")
    relative = arguments.get("path", "")
    if name in {"write_file", "delete_file"}:
        return edit(name, arguments)
    if name == "read_image":
        if (not isinstance(relative, str) or not Path(relative).parts
                or Path(relative).parts[0] != "screenshots" or Path(relative).suffix.lower() != ".png"):
            raise ValueError("only dispatcher-generated PNG screenshots may be viewed")
        path = location("evidence", relative, maximum=MAX_IMAGE)
        data = path.read_bytes()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("screenshot is not a PNG")
        return {"mimeType": "image/png", "data": base64.b64encode(data).decode("ascii")}
    if name == "list_files":
        result = []
        for relative_file, _ in paths(root, relative):
            if len(result) == 1000:
                return {"files": result, "truncated": True}
            result.append(relative_file)
        return {"files": result, "truncated": False}
    if name == "read_file":
        path = location(root, relative)
        start = integer(arguments, "start_line", 1, 1000000)
        count = integer(arguments, "line_count", 200, 400)
        lines = path.read_text(encoding="utf-8").splitlines()
        result = [{"line": index + 1, "text": text}
                  for index, text in enumerate(lines) if start <= index + 1 < start + count]
        return {"lines": result, "total_lines": len(lines), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    query = arguments.get("query")
    if not isinstance(query, str) or not query or len(query) > 256:
        raise ValueError("query must contain 1 to 256 characters")
    found = []
    for relative_file, path in paths(root, relative):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeError:
            continue
        for number, line in enumerate(lines, 1):
            if query in line:
                if len(found) == 100:
                    return {"matches": found, "truncated": True}
                found.append({"file": relative_file, "line": number, "text": line[:2048]})
    return {"matches": found, "truncated": False}


def tools():
    definitions = []
    descriptions = {
        "list_files": "List regular source/evidence files below a directory; generated and credential paths are excluded.",
        "read_file": "Read UTF-8 source/evidence with one-based line numbers; maximum 400 lines and 1 MiB file.",
        "search": "Search for literal case-sensitive text below a source/evidence directory; no regex or commands.",
        "read_image": "View a dispatcher-generated PNG below /evidence/screenshots only, up to 4 MiB.",
    }
    if ALLOW_WRITE:
        descriptions.update({
            "write_file": "Create or replace a UTF-8 source file only. Supply its SHA-256 from read_file, or null for a new file. Protected paths cannot be edited.",
            "delete_file": "Delete a source file only when its SHA-256 matches read_file. Protected paths cannot be deleted.",
        })
    for name in descriptions:
        properties = {"root": {"type": "string", "enum": ["source", "evidence"]},
                      "path": {"type": "string"}}
        if name == "read_file":
            properties.update({"start_line": {"type": "integer", "minimum": 1},
                               "line_count": {"type": "integer", "minimum": 1, "maximum": 400}})
        if name == "search":
            properties["query"] = {"type": "string", "minLength": 1, "maxLength": 256}
        if name in {"read_image", "write_file", "delete_file"}:
            properties.pop("root")
        if name in {"write_file", "delete_file"}:
            properties["expected_sha256"] = {"type": ["string", "null"]} if name == "write_file" else {"type": "string"}
        if name == "write_file":
            properties["content"] = {"type": "string"}
        required = {"read_file": ["path"], "read_image": ["path"], "search": ["query"],
                    "write_file": ["path", "content", "expected_sha256"],
                    "delete_file": ["path", "expected_sha256"]}.get(name, [])
        definitions.append({"name": name, "description": descriptions[name],
            "inputSchema": {"type": "object", "properties": properties,
                            "required": required,
                            "additionalProperties": False},
            "annotations": {"readOnlyHint": name not in {"write_file", "delete_file"},
                            "destructiveHint": name in {"write_file", "delete_file"},
                            "idempotentHint": True, "openWorldHint": False}})
    return definitions


def handle(request):
    method, params = request.get("method"), request.get("params", {})
    if method == "initialize":
        return {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                "serverInfo": {"name": "factory-source", "version": "1.0.0"}}
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": tools()}
    if method == "tools/call":
        try:
            value = invoke(params.get("name"), params.get("arguments", {}))
            if params.get("name") == "read_image":
                return {"content": [{"type": "image", **value}], "isError": False}
            encoded = json.dumps(value, ensure_ascii=False)
            if len(encoded.encode("utf-8")) > MAX_RESPONSE:
                raise ValueError("result exceeds 64 KiB; select a narrower path or fewer lines")
            return {"content": [{"type": "text", "text": encoded}], "isError": False}
        except (OSError, ValueError, UnicodeError, KeyError):
            # Do not include arbitrary OS exception text, which could disclose
            # paths outside the permitted roots.
            return {"content": [{"type": "text", "text": "Read rejected: invalid path, arguments, or result size."}],
                    "isError": True}
    raise ValueError("unsupported method")


def main():
    global ALLOW_WRITE
    if sys.argv[1:] not in ([], ["--allow-write"]):
        return
    ALLOW_WRITE = sys.argv[1:] == ["--allow-write"]
    while True:
        raw = sys.stdin.buffer.readline(MAX_REQUEST + 1)
        if not raw:
            return
        if len(raw) > MAX_REQUEST:
            return  # Do not parse a truncated or unbounded request.
        request = None
        try:
            request = json.loads(raw)
            if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
                raise ValueError("invalid JSON-RPC request")
            if "id" not in request:
                continue  # Notifications have no response.
            result = handle(request)
            response = {"jsonrpc": "2.0", "id": request["id"], "result": result}
        except (ValueError, TypeError, AttributeError):
            response = {"jsonrpc": "2.0", "id": request.get("id") if isinstance(request, dict) else None,
                        "error": {"code": -32600, "message": "Invalid or unsupported request"}}
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
