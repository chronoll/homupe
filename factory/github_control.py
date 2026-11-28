"""Pure contracts for trusted Issue-comment control and public status messages.

No API, filesystem, subprocess or model access occurs here. The controller must
re-fetch the current comment/Issue, reject closed Issues and PRs, and persist a
claim under its lock *before* performing an action. A claimed comment is never
replayed, including after an uncertain response or an edit to its body.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime
import re
import unicodedata


COMMANDS = frozenset({"status", "stop", "retry", "resume"})
COMMAND_BODIES = {"/factory " + command: command for command in COMMANDS}
STATUS_MARKER = "<!-- homupe-factory-status:v1 -->"
ACTION_MARKER_PREFIX = "<!-- homupe-factory-action:v1:"
NEXT_ACTIONS = frozenset({"wait", "answer", "retry", "maintenance", "review"})
MAX_STATUS_CHARS = 6000
MAX_FINDINGS = 8
_TICK = chr(96)
_FENCE = _TICK * 3
_STAMP = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")
_PHASES = {
    "unstarted": "未着手", "claimed": "受付済み", "planning": "計画中",
    "implementing": "実装中", "verifying": "検証中", "reviewing": "レビュー中",
    "publishing": "PR 公開処理中", "draft-pr": "Draft PR 作成済み",
    "needs-human": "人の確認待ち", "incomplete-claim": "受付記録の確認待ち",
    "repairing": "検証エラーを自動修正中", "auto-repairing": "検証エラーを自動修正中",
    "repairing-verification": "検証エラーを自動修正中",
    "revision-queued": "PR の修正依頼を受付済み・順番待ち",
}


def parse_command(comment, trusted_author):
    """Recognize only an exact, single-line body from the current trusted user.

    Timestamp/ID/freshness and Issue eligibility are separate checks. In
    particular, do not strip whitespace, render Markdown, or inspect quoted text.
    """
    if not isinstance(comment, dict) or not isinstance(trusted_author, str) or not trusted_author:
        return None
    user = comment.get("user")
    if not isinstance(user, dict) or user.get("login") != trusted_author:
        return None
    if user.get("type") not in (None, "User"):
        return None
    body = comment.get("body")
    return COMMAND_BODIES.get(body) if isinstance(body, str) else None


def _positive(value):
    return type(value) is int and 0 < value < 2 ** 64


def _timestamp(value):
    if not isinstance(value, str) or not _STAMP.fullmatch(value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return False
    return True


def command_record(comment, number, trusted_author):
    """Validate API identity/timestamps for a new, never-edited command.

    The caller additionally enforces the installation cutoff and freshness from
    a current GitHub read. An edit is not a new instruction; post a new comment.
    """
    command = parse_command(comment, trusted_author)
    if command is None or not _positive(number) or not _positive(comment.get("id")):
        return None
    created, updated = comment.get("created_at"), comment.get("updated_at")
    if not _timestamp(created) or created != updated:
        return None
    return {"issue": number, "command": command, "created_at": created,
            "updated_at": updated, "status": "claimed"}


def new_cursor():
    """A JSON-serializable receipt journal; IDs must never be pruned/replayed."""
    return {"version": 1, "last_comment_id": 0, "comments": {}}


def validate_cursor(cursor):
    """Validate without repairing damaged state, and return an independent copy.

    last_comment_id is diagnostic, not a cutoff: an unseen smaller ID can arrive
    on a later page. The retained per-ID receipt provides the replay protection.
    """
    if (not isinstance(cursor, dict) or set(cursor) != {"version", "last_comment_id", "comments"}
            or type(cursor["version"]) is not int or cursor["version"] != 1
            or type(cursor["last_comment_id"]) is not int or cursor["last_comment_id"] < 0
            or not isinstance(cursor["comments"], dict)):
        raise ValueError("invalid GitHub command cursor")
    highest = 0
    fields = {"issue", "command", "created_at", "updated_at", "status"}
    for key, record in cursor["comments"].items():
        if not isinstance(key, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", key) or not _positive(int(key)):
            raise ValueError("invalid GitHub comment ID")
        if (not isinstance(record, dict) or set(record) != fields
                or not _positive(record["issue"]) or not isinstance(record["command"], str)
                or record["command"] not in COMMANDS
                or not _timestamp(record["created_at"])
                or record["created_at"] != record["updated_at"]
                or not isinstance(record["status"], str)
                or record["status"] not in {"claimed", "done", "failed", "uncertain"}):
            raise ValueError("invalid GitHub command receipt")
        highest = max(highest, int(key))
    if cursor["last_comment_id"] != highest:
        raise ValueError("GitHub command cursor does not match its receipts")
    return deepcopy(cursor)


def claim_command(cursor, comment, number, trusted_author):
    """Return (updated_cursor, record_or_None); persist before the action.

    Known IDs are ignored regardless of their current body, author, timestamps
    or previous outcome. A crash after claim therefore needs reconciliation,
    rather than an implicit second execution.
    """
    result = validate_cursor(cursor)
    if isinstance(comment, dict) and str(comment.get("id")) in result["comments"]:
        return result, None
    record = command_record(comment, number, trusted_author)
    if record is None:
        return result, None
    comment_id = comment["id"]
    result["comments"][str(comment_id)] = record
    result["last_comment_id"] = max(result["last_comment_id"], comment_id)
    return result, deepcopy(record)


def finish_command(cursor, comment_id, outcome="done"):
    """Mark a persisted claim without storing untrusted error/output text."""
    result = validate_cursor(cursor)
    if (not _positive(comment_id) or not isinstance(outcome, str)
            or outcome not in {"done", "failed", "uncertain"}):
        raise ValueError("invalid GitHub command outcome")
    record = result["comments"].get(str(comment_id))
    if record is None:
        raise ValueError("GitHub command was not claimed")
    if record["status"] not in {"claimed", outcome}:
        raise ValueError("GitHub command already has a terminal outcome")
    record["status"] = outcome
    return result


def action_requirements(command, state=None):
    """Describe guards; this is not authorization to bypass controller checks.

    The controller must check the trusted, open, non-PR Issue for every command.
    It must reconcile an existing remote branch/PR or uncertain publication
    before retry, and only clear STOP causes proven recoverable. Resume does not
    release failed jobs. Retry archives this Issue's held attempt and re-freezes
    its *current* body; it is explicit permission for a new usage-consuming run.
    """
    if not isinstance(command, str) or command not in COMMANDS:
        raise ValueError("unknown factory command")
    held = isinstance(state, dict) and state.get("phase") == "needs-human"
    return {
        "command": command, "requires_open_issue": True, "reject_pull_request": True,
        "requires_held_job": command == "retry",
        "held_job_available": held,
        "requires_remote_reconciliation": command == "retry",
        "requires_recoverable_stop": command in {"retry", "resume"},
        "archives_this_attempt": command == "retry",
        "refreezes_current_issue": command == "retry",
        "explicit_model_retry": command == "retry",
        "clears_stop": command in {"retry", "resume"},
        "queue_only": command in {"stop", "resume"},
        "preserves_held_jobs": command != "retry",
    }


def safe_plain_text(value, limit=600):
    """Bound selected public text and redact credentials/local paths.

    Select only intended fields before calling this helper. Never publish raw
    JSON, process output or arbitrary state: unknown secret formats cannot be
    reliably identified from a free-form transcript.
    """
    if not isinstance(value, str) or limit < 1:
        return ""
    text = re.sub(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|$))", "", value)
    text = "".join(char for char in text if not unicodedata.category(char).startswith("C")
                   or char in "\n\t")
    text = re.sub(r"-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----",
                  "[credential redacted]", text, flags=re.DOTALL)
    text = re.sub(r"(?im)\b(?:authorization|proxy-authorization)\s*[:=][^\n]*",
                  "[authorization redacted]", text)
    key = r"(?:[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY)[A-Za-z0-9_]*|password|secret|token)"
    text = re.sub(r"(?i)\b" + key + r"\s*[:=]\s*(?:\"[^\"]*\"|'[^']*'|[^\s,;]+)",
                  "[credential redacted]", text)
    text = re.sub(r"(?i)\b(?:password|api key|access token)\s+is\s+\S+",
                  "[credential redacted]", text)
    text = re.sub(r"\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+"
                  r"|xox[baprs]-[A-Za-z0-9-]+|AKIA[A-Z0-9]{16}"
                  r"|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b",
                  "[credential redacted]", text)
    text = re.sub(r"https?://[^\s<>\"']+", "[URL redacted]", text)
    text = re.sub(r"([\"'])(?:/|[A-Za-z]:[\\/]|~/).*?\1",
                  "[local path redacted]", text)
    text = re.sub(r"(?<![\w:/])(?:[A-Za-z]:[\\/]|~/|/)[^\s,;)'\"<>]+",
                  "[local path redacted]", text)
    text = re.sub(r"\b[A-Za-z0-9_-]{32,}\b", "[long value redacted]", text)
    text = " ".join(text.split()).replace("@", "＠")
    if len(text) > limit:
        text = text[:max(0, limit - 1)] + "…"
    return text


def safe_text(value, limit=600):
    """Escape selected, redacted text so it cannot inject public Markdown."""
    # No free-form field may create a fence, link, HTML tag, heading or mention.
    return re.sub(r"([\\\x60*_~\[\]<>#])", r"\\\1", safe_plain_text(value, limit))


def _location(finding):
    path = finding.get("file")
    if (not isinstance(path, str) or len(path) > 180
            or not re.fullmatch(r"[A-Za-z0-9_. /@+-]+", path)
            or path.startswith(("/", "~")) or ".." in path.split("/")
            or any(part == "" for part in path.split("/"))
            or safe_text(path, 180).replace("\\", "") != path.replace("@", "＠")):
        return "パス非表示"
    line = finding.get("line")
    return path + (":" + str(line) if _positive(line) else "")


def _display_outcome(state, review):
    """Prefer explicit metadata; classify old held records without changing them."""
    phase = state.get("phase", "unstarted")
    if phase == "draft-pr":
        return {**state, "next_action": "review"}
    if isinstance(phase, str) and phase in _PHASES and phase not in {"needs-human", "incomplete-claim"}:
        return {**state, "next_action": "wait"}
    action = state.get("next_action")
    if not isinstance(action, str) or action not in NEXT_ACTIONS:
        # Local import avoids a module cycle: outcomes uses the redactor above.
        from factory.outcomes import classify_failure
        selected = classify_failure(state.get("reason", ""), {**state, "review": review})
        state = {**state, **selected}
    human = state.get("human_message")
    if state.get("next_action") == "answer" and (not isinstance(human, str) or not human.strip()):
        return {**state, "next_action": "maintenance",
                "human_message": "具体的な確認事項を取得できていません。実行担当に質問内容の確認を依頼してください。"}
    return state


def _next_steps(state):
    """One relevant action, never an undifferentiated list of control commands."""
    action, phase = state["next_action"], state.get("phase")
    phase = phase if isinstance(phase, str) else ""
    human = safe_text(state.get("human_message"), 600)
    command = None
    if action == "wait":
        lines = ["あなたの操作: 不要"]
        if phase in {"repairing", "auto-repairing", "repairing-verification"}:
            lines.append("次の操作: 検証エラーを自動修正中。あなたの操作不要です。結果をお待ちください。")
        elif phase == "unstarted" and (state.get("stopped") is True or state.get("queue_stopped") is True):
            lines.append("次の操作: 停止したままなら操作不要です。キューの再開を希望する場合だけ、下の 1 行を送ってください。保留中の試行は再実行しません。")
            command = "resume"
        else:
            lines.append("次の操作: ファクトリーが処理を進めます。結果をお待ちください。")
    elif action == "answer":
        lines = ["あなたの操作: 必要", "確認事項: " + human,
                 "次の操作: この質問への回答を Issue 本文に追記し、その後で下の 1 行を送ってください。通常の返信だけでは再開しません。"]
        if state.get("revision") is True:
            lines.append("この修正試行は既存 PR を引き継ぎ、同じ PR を更新します。")
        command = "retry"
    elif action == "retry":
        stopped = state.get("halt_kind") == "stopped"
        lines = ["あなたの操作: " + ("不要（停止を続ける場合）" if stopped else "必要（続行を希望する場合）")]
        if human:
            lines.append("確認事項: " + human)
        remote_help = ("この修正試行は既存 PR を引き継ぎ、同じ PR を更新します。" if state.get("revision") is True
                       else "既存 PR・ブランチがある場合は再試行を受け付けません。")
        lines.append("次の操作: この Issue を試行し直す場合だけ、下の 1 行を送ってください。追加のサブスク利用枠を消費します。" + remote_help)
        command = "retry"
    elif action == "review":
        lines = ["あなたの操作: 必要", "次の操作: Draft PR の差分・GitHub CI・対応する Preview を確認してください。"
                 "問題なければ Ready for review にし、人が staging へマージします。main への反映・本番公開は別途判断します。"
                 "修正を依頼する場合は、この PR に新しいトップレベルコメントとして次の形式で送ってください。",
                 "", _FENCE, "/factory fix", "具体的な修正内容", _FENCE,
                 "chronoll の新しい未編集コメントを受け付け、同じ PR へ修正します。通常の返信・インラインコメント・レビューだけでは再修正しません。"
                 "検証とレビューに成功した後も PR は Draft に戻します。"]
    else:
        lines = ["あなたの操作: 必要（実行担当による復旧）"]
        if human:
            lines.append("確認事項: " + human)
        lines.append("次の操作: 実行担当にこの Issue の理由を伝えて復旧を依頼してください。"
                     "仕様への回答や、原因未確認の再試行では進めません。")
    if command:
        lines.extend(["", _FENCE, "/factory " + command, _FENCE,
                      "chronoll が新しいコメント本文全体として、この 1 行だけを送ってください。編集済み・引用・説明付きのコメントは受け付けません。",
                      "制御確認は待機中約 5 分、実行中約 30 秒が目安です。即時反映は保証しません。"])
    return "\n".join(lines)


def status_body(number, state, review=None):
    """Render selected job/review fields for a public Issue comment."""
    if not _positive(number):
        raise ValueError("invalid Issue number")
    state = state if isinstance(state, dict) else {}
    review = review if isinstance(review, dict) else {}
    state = _display_outcome(state, review)
    phase = state.get("phase", "unstarted")
    phase_label = _PHASES.get(phase, "状態の確認が必要") if isinstance(phase, str) else "状態の確認が必要"
    if phase == "needs-human":
        halt_kind = state.get("halt_kind") if isinstance(state.get("halt_kind"), str) else ""
        phase_label = {"technical": "技術エラーで保留", "question": "回答待ち",
            "input": "Issue の変更により保留", "stopped": "停止中",
            "runtime": "実行環境の復旧待ち", "auth": "認証・利用枠の確認待ち",
            "publication": "PR 公開結果の照合待ち", "policy": "保護条件の確認待ち",
            "unknown": "実行担当による原因の確認待ち"}.get(halt_kind, phase_label)
    lines = [STATUS_MARKER, ACTION_MARKER_PREFIX + state["next_action"] + " -->",
             "Factory: Issue #" + str(number), "",
             "状態: " + phase_label]
    if state.get("stopped") is True or state.get("queue_stopped") is True:
        lines.append("監視キュー: STOP（停止中）")
    # Put the human action before potentially long review evidence, and retain
    # that action even when selected diagnostics reach the display limit.
    header = "\n".join(lines) + "\n\n" + _next_steps(state)
    lines = []
    kind = safe_text(state.get("halt_kind"), 80)
    if kind:
        lines.append("停止区分: " + kind)
    reason = safe_text(state.get("reason"), 600)
    if reason:
        lines.extend(["", "理由: " + reason])
    url = state.get("url")
    if isinstance(url, str) and re.fullmatch(r"https://github\.com/chronoll/homupe/pull/[1-9][0-9]*", url):
        lines.extend(["", "Draft PR: " + url])
    verdict = review.get("verdict")
    if isinstance(verdict, str) and verdict in {"approve", "changes", "needs-human"}:
        lines.extend(["", "レビュー: " + verdict])
    summary = safe_text(review.get("summary"), 400)
    if summary:
        lines.append("レビュー概要: " + summary)
    findings = review.get("findings")
    if isinstance(findings, list):
        items = [item for item in findings if isinstance(item, dict)]
        if items:
            lines.extend(["", "指摘:"])
        for item in items[:MAX_FINDINGS]:
            severity = item.get("severity")
            severity = severity if isinstance(severity, str) and severity in {"must", "should", "nit"} else "info"
            message = safe_text(item.get("message"), 350) or "内容の確認が必要です。"
            location = _location(item)
            lines.append("- " + severity + " " + _TICK + location + _TICK + ": " + message)
        if len(items) > MAX_FINDINGS:
            lines.append("- ほか " + str(len(items) - MAX_FINDINGS) + " 件（表示省略）")
    details = "\n".join(lines)
    budget = MAX_STATUS_CHARS - len(header) - 3
    if len(details) > budget:
        details = details[:budget - 1] + "…"
    return header + "\n\n" + details + "\n"
