"""Parent-only GitHub controls, public status and recoverable notification outbox.

The caller owns Store.lock. No GitHub credential or this controller is exposed
inside model containers. Remote writes never cause another model run.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import re
import time
import uuid

from factory.core import Halt, Runner, atomic_json, git, parse_json
from factory.github_control import (STATUS_MARKER, claim_command, command_record, finish_command,
    new_cursor, safe_text, status_body, validate_cursor)

EVENT_MARKER = "<!-- homupe-factory-event:v1 -->"
RECEIPT_MARKER = "<!-- homupe-factory-command:v1:"
NOTIFY_MARKER = "<!-- homupe-factory-notify:v1:"
DELIVERY_INTERVAL = 30 * 60
MAX_DELIVERY_ATTEMPTS = 3
LABELS = {"factory:running": "1d76db", "factory:needs-human": "d93f0b",
          "factory:done": "0e8a16"}


def stamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class GitHubControl:
    def __init__(self, factory, github):
        self.factory, self.github = factory, github
        self.store = factory.store
        self.path = self.store.root / "github-control.json"
        self._next_check = 0

    def _load(self):
        if not self.path.exists():
            value = {"version": 1, "installed_at": stamp(), "cursor": new_cursor(),
                     "issues": {}, "events": {}, "receipts": {}}
            atomic_json(self.path, value)
            return value
        value = parse_json(self.path.read_bytes())
        if (not isinstance(value, dict) or value.get("version") != 1
                or not isinstance(value.get("installed_at"), str)
                or not isinstance(value.get("issues"), dict)
                or not isinstance(value.get("events"), dict)):
            raise Halt("invalid GitHub control journal; preserve and reconcile")
        validate_cursor(value.get("cursor"))
        receipts = value.setdefault("receipts", {})
        if not isinstance(receipts, dict):
            raise Halt("invalid GitHub command receipt outbox")
        for comment_id, receipt in receipts.items():
            record = value["cursor"]["comments"].get(comment_id)
            if (not isinstance(receipt, dict) or set(receipt) != {"issue", "message"}
                    or not record or type(receipt["issue"]) is not int or receipt["issue"] != record["issue"]
                    or not isinstance(receipt["message"], str) or len(receipt["message"]) > 2000):
                raise Halt("invalid GitHub command receipt outbox")
        return value

    def _write(self, value):
        atomic_json(self.path, value)

    def _state(self, number):
        path = self.store.job(number) / "state.json"
        if not path.exists():
            return {"phase": "unstarted"}
        value = parse_json(path.read_bytes())
        if value.get("issue") != number or value.get("version") != 1:
            raise Halt("invalid job state")
        return value

    def _issue(self, number):
        issue = self.github.issue(number)
        if (issue.get("number") != number or issue.get("state") != "open"
                or "pull_request" in issue
                or issue.get("user", {}).get("login") != self.factory.config["trusted_author"]):
            raise Halt("commands require an open, chronoll-authored Issue")
        labels = {x if isinstance(x, str) else x.get("name") for x in issue.get("labels", [])}
        if "factory:ready" not in labels and not self.store.job(number).exists():
            raise Halt("commands require a factory:ready Issue or an existing factory job")
        return issue

    def _comments(self, number):
        return self.github.pages("issues/%s/comments?per_page=100" % number)

    def _ours(self, comment):
        return comment.get("user", {}).get("login") == self.factory.config["trusted_author"]

    def _reconcile_retry(self, number, state):
        if state.get("phase") != "needs-human":
            raise Halt("再試行できるのは人の確認待ちの Issue だけです。")
        branch = "factory/issue-%s" % number
        prs = self.github.get("pulls?state=all&head=chronoll:" + branch)
        refs = self.github.get("git/matching-refs/heads/" + branch)
        if any(pr.get("state") == "open" or pr.get("merged_at") for pr in prs) or any(ref.get("ref") == "refs/heads/" + branch for ref in refs):
            raise Halt("既存の PR または作業ブランチがあります。GitHub で既存 PR を確認してください。"
                       "不要な試行なら PR を閉じ、該当 factory/issue ブランチを削除してから新しい retry を送ってください。")
        # A retry never hides evidence or rewinds a remote branch. Retain the
        # previous review as task data so the next run can address its findings.
        job = self.store.job(number)
        review_path = job / ("repair-1/review.json" if state.get("review_round") == 2 else "review.json")
        feedback = parse_json(review_path.read_bytes()) if review_path.exists() else {"summary": state.get("reason", "前回の試行が中断しました。"), "findings": []}
        if feedback:
            atomic_json(self.store.root / "retry-context" / (str(number) + ".json"), feedback)
        archive = job.with_name(str(number) + ".attempt-" + str(time.time_ns()))
        # Remove only our needs-human marker. User stop/skip labels are retained.
        self._remove_phase_label(number, "factory:needs-human")
        intent = self.store.root / "retry-intents" / (str(number) + ".json")
        atomic_json(intent, {"issue": number, "archive": archive.name})
        job.rename(archive)
        try:
            for checkout in (archive / "checkout", archive / "repair-1/checkout"):
                if checkout.exists():
                    git(Runner(), self.factory.repo, "worktree", "repair", str(checkout))
        except BaseException:
            self._recover_retries()
            raise
        intent.unlink()
        return "停止した試行を保存しました。現在の Issue 本文と前回のレビュー指摘で再試行します。"

    def _recover_retries(self):
        # An interrupted archive operation is rolled back before any new queue
        # work. The original held attempt remains addressable from GitHub.
        for intent in (self.store.root / "retry-intents").glob("*.json"):
            record = parse_json(intent.read_bytes())
            number, name = record.get("issue"), record.get("archive")
            if (type(number) is not int or not isinstance(name, str)
                    or not re.fullmatch(str(number) + r"\.attempt-[0-9]+", name)):
                raise Halt("invalid retry recovery intent")
            self.store.stop()
            job = self.store.job(number)
            archive = job.with_name(name)
            if archive.exists():
                if job.exists():
                    raise Halt("retry recovery has conflicting claims")
                archive.rename(job)
                for checkout in (job / "checkout", job / "repair-1/checkout"):
                    if checkout.exists():
                        git(Runner(), self.factory.repo, "worktree", "repair", str(checkout))
            elif not job.exists():
                raise Halt("retry recovery evidence is missing")
            intent.unlink()

    def _act(self, number, command, in_run):
        self._issue(number)  # Re-fetch current state after the durable claim.
        state = self._state(number)
        if command == "status":
            return "現在の状態を下の Factory ステータスに反映しました。"
        if command == "stop":
            self.store.stop()
            return "監視キュー全体を停止しました。実行中の処理も次の停止確認で終了します。"
        if in_run:
            raise Halt("実行中は retry/resume を受け付けません。完了または停止後に新しいコメントを送ってください。")
        # Record any interrupted attempt as held before releasing the queue.
        self.factory._interrupted_jobs()
        if command == "retry":
            self.store.stop()  # Archive/repair failures must leave the queue held.
            message = self._reconcile_retry(number, state)
        else:
            message = "監視キューを再開しました。人の確認待ちの Issue は保留を維持します。"
        value = self._load()
        queue = value.pop("queue_failure", None)
        if queue and not self.store.job(queue["issue"]).exists():
            self._remove_phase_label(queue["issue"], "factory:needs-human")
        self._write(value)
        (self.store.root / "STOP").unlink(missing_ok=True)
        return message

    def queue_failure(self, code):
        """Expose pre-claim runtime faults using a fixed safe description."""
        reasons = {
            "runtime-unavailable": "実行環境を起動できず、監視キューを停止しました。",
            "interrupted-worker": "前回の処理の中断を検出し、安全のため監視キューを停止しました。",
        }
        if code not in reasons:
            raise Halt("unknown queue failure")
        self.store.stop()
        value = self._load()
        if not value.get("queue_failure"):
            pending = [x for x in self.github.pending()
                if x.get("state") == "open" and "pull_request" not in x
                and x.get("user", {}).get("login") == self.factory.config["trusted_author"]]
            if not pending:
                return
            value["queue_failure"] = {"issue": pending[0]["number"], "code": code,
                "reason": reasons[code], "id": uuid.uuid4().hex, "at": stamp()}
            self._write(value)
        self.publish(value["queue_failure"]["issue"])

    def _receipt(self, number, comment_id, message):
        value = self._load()
        record = value["cursor"]["comments"].get(str(comment_id))
        if (type(number) is not int or number < 1 or type(comment_id) is not int or comment_id < 1
                or not record or record["issue"] != number
                or not isinstance(message, str) or len(message) > 2000):
            raise Halt("invalid GitHub command receipt")
        # The first selected result text is durable before even listing remote
        # comments. A crash or ambiguous POST cannot lose it or replay an action.
        receipt = value["receipts"].get(str(comment_id))
        if receipt is None:
            receipt = {"issue": number, "message": message}
            value["receipts"][str(comment_id)] = receipt
            self._write(value)
        message = receipt["message"]
        marker = RECEIPT_MARKER + str(comment_id) + " -->"
        if any(self._ours(x) and isinstance(x.get("body"), str)
               and x["body"].startswith(marker + "\n") for x in self._comments(number)):
            return
        self.github.write("issues/%s/comments" % number, {"body": marker + "\n" + message})

    def check(self, in_run=False, during_process=False, deadline=None):
        """Poll controls during long parent commands; transient API errors are
        retried by a future tick, never by repeating a claimed instruction."""
        if time.monotonic() < self._next_check:
            return
        self._next_check = time.monotonic() + 30
        runner = getattr(self.github, "runner", None)
        old_deadline = getattr(runner, "deadline", None)
        if during_process and runner:
            runner.deadline = min(time.monotonic() + 4, deadline or float("inf"))
        try:
            self.commands(in_run, defer=during_process)
        except (Halt, OSError, ValueError, KeyError):
            # Preserve a diagnostic code only, never publish a raw exception.
            atomic_json(self.store.root / "github-sync-error.json", {"at": stamp(), "error": "control-sync-failed"})
        finally:
            if runner:
                runner.deadline = old_deadline

    def commands(self, in_run=False, defer=False):
        value = self._load()
        comments = self.github.pages("issues/comments?since=" + value["installed_at"] + "&per_page=100")
        for candidate in sorted(comments, key=lambda x: x.get("id", 0)):
            match = re.fullmatch(r"https://api.github.com/repos/chronoll/homupe/issues/([1-9][0-9]*)",
                                 candidate.get("issue_url", ""))
            if not match or candidate.get("created_at", "") < value["installed_at"]:
                continue
            number = int(match.group(1))
            cursor, record = claim_command(value["cursor"], candidate, number,
                                            self.factory.config["trusted_author"])
            if record is None:
                continue
            # A current read rejects edits that happened after the list response.
            current = self.github.get("issues/comments/" + str(candidate["id"]))
            if (any(current.get(k) != candidate.get(k) for k in ("id", "body", "created_at", "updated_at", "issue_url"))
                    or current.get("user", {}).get("id") != candidate.get("user", {}).get("id")
                    or command_record(current, number, self.factory.config["trusted_author"]) != record):
                continue
            try:
                self._issue(number)
            except Halt:
                continue
            value["cursor"] = cursor
            self._write(value)  # At-most-once claim precedes every side effect.
            outcome = "done"
            try:
                message = self._act(number, record["command"], in_run)
            except (Halt, OSError, ValueError, KeyError) as error:
                outcome = "failed"
                message = "操作を完了できませんでした: " + safe_text(str(error), 700)
            value = self._load()
            value.setdefault("receipts", {})[str(candidate["id"])] = {"issue": number, "message": message}
            value["cursor"] = finish_command(value["cursor"], candidate["id"], outcome)
            self._write(value)
            if defer:
                # Stop supervision returns before any status/receipt API write.
                # The next safe sync projects the already durable outcome.
                if self.store.stopped():
                    return
                continue
            self._receipt(number, candidate["id"], message)
            self.publish(number)
            # publish also writes the journal; retain its independent changes.
            value = self._load()

    def _labels(self, number, phase):
        desired = "factory:needs-human" if phase == "needs-human" else (
            "factory:done" if phase == "draft-pr" else "factory:running")
        issue = self.github.issue(number)
        current = [x if isinstance(x, str) else x["name"] for x in issue.get("labels", [])]
        if desired not in current:
            self.github.write("issues/%s/labels" % number, {"labels": [desired]})
        for name in LABELS:
            if name != desired and name in current:
                self._remove_phase_label(number, name)

    def _remove_phase_label(self, number, name):
        current = self.github.issue(number).get("labels", [])
        if name in {x if isinstance(x, str) else x["name"] for x in current}:
            self.github.remove_label(number, name)

    def publish(self, number):
        """Best effort public projection; the durable local job remains primary.
        Failed/ambiguous writes are reconciled by marker on the next sync."""
        try:
            self._publish(number)
        except (Halt, OSError, ValueError, KeyError):
            atomic_json(self.store.root / "github-sync-error.json", {"at": stamp(), "error": "status-sync-failed"})

    def _publish(self, number):
        state = self._state(number)
        value = self._load()
        queue = value.get("queue_failure")
        if state["phase"] == "unstarted" and queue and queue["issue"] == number:
            state = {"phase": "needs-human", "reason": queue["reason"],
                "human_message": "キューの再開は /factory resume で要求できます。再発する場合は実行環境の保守が必要です。"}
        metadata = value["issues"].setdefault(str(number), {})
        review_file = self.store.job(number) / ("repair-1/review.json" if state.get("review_round") == 2 else "review.json")
        review = parse_json(review_file.read_bytes()) if review_file.exists() else None
        body = status_body(number, {**state, "queue_stopped": self.store.stopped()}, review)
        body += "\n最終状態反映（UTC）: " + stamp() + "\n長い工程中の表示・status 返信は工程終了時に更新されます。停止要求は実行中も約 30 秒ごとに確認します。\n"
        comments = self._comments(number)
        existing = next((x for x in comments if self._ours(x) and x.get("body", "").startswith(STATUS_MARKER + "\n")), None)
        if existing:
            comment_id = existing["id"]
            if existing.get("body") != body:
                self.github.write("issues/comments/%s" % comment_id, {"body": body}, "PATCH")
        else:
            comment_id = self.github.write("issues/%s/comments" % number, {"body": body})["id"]
        metadata["status_comment"] = comment_id
        metadata["last_published"] = stamp()
        self._write(value)
        if state.get("phase") != "unstarted":
            self._labels(number, state.get("phase"))
            if not self.store.job(number).exists():
                token = queue["id"]
            else:
                identity = self.store.job(number) / "github-identity.json"
                if not identity.exists():
                    atomic_json(identity, {"id": uuid.uuid4().hex})
                token = parse_json(identity.read_bytes())["id"]
            phase = state.get("phase")
            kind = "needs-human" if phase == "needs-human" else (
                "draft-complete" if phase == "draft-pr" else "started")
            key = hashlib.sha256((self.factory.config["repository"] + ":" + str(number) + ":" + token + ":" + kind).encode()).hexdigest()
            if key not in value["events"]:
                url = state.get("url", "")
                pr = re.fullmatch(r"https://github.com/chronoll/homupe/pull/([1-9][0-9]*)", url)
                if kind == "draft-complete" and not pr:
                    raise Halt("invalid completed PR URL")
                value["events"][key] = {"key": key, "kind": kind, "issue": number,
                    "status_comment": comment_id, "pr": int(pr.group(1)) if kind == "draft-complete" else None,
                    "sent": False}
                self._write(value)  # Outbox entry precedes the remote mutation.
        self.flush()

    def flush(self):
        value = self._load()
        ready = None
        for event in value["events"].values():
            # Older journals used sent for the host event POST. Only a persisted
            # bot acknowledgement is final under the new delivery contract.
            if event.get("sent") is True and event.get("acked_at"):
                continue
            if (not isinstance(event.get("key"), str) or not re.fullmatch(r"[a-f0-9]{64}", event["key"])
                    or event.get("kind") not in {"started", "needs-human", "draft-complete"}
                    or type(event.get("issue")) is not int or event["issue"] < 1
                    or type(event.get("status_comment")) is not int or event["status_comment"] < 1
                    or (event["kind"] == "draft-complete" and
                        (type(event.get("pr")) is not int or event["pr"] < 1))
                    or (event["kind"] != "draft-complete" and event.get("pr") is not None)):
                raise Halt("invalid GitHub notification outbox")
            payload = {k: event[k] for k in ("key", "kind", "issue", "status_comment", "pr")}
            encoded = json.dumps(payload, separators=(",", ":"))
            legacy_body = EVENT_MARKER + "\n" + encoded
            body = EVENT_MARKER + "\n<!--\n" + encoded + "\n-->\nFactoryの状態を更新しました。"
            comments = self._comments(event["issue"])
            marker = NOTIFY_MARKER + event["key"] + " -->\n"
            if any(x.get("user", {}).get("login") == "github-actions[bot]"
                   and x["user"].get("type") == "Bot" and isinstance(x.get("body"), str)
                   and x["body"].startswith(marker) for x in comments):
                event.update(sent=True, acked_at=stamp(), delivery_state="acknowledged")
                self._write(value)
                continue
            event["sent"] = False
            # Reconcile legacy submitted events without treating a host comment
            # as proof that the workflow or its notification succeeded.
            if "attempts" not in event:
                submitted = any(self._ours(x) and x.get("body") in {body, legacy_body} for x in comments)
                event["attempts"] = 1 if submitted else 0
                event["submitted_at"] = time.time() if submitted else None
            attempts, submitted_at = event["attempts"], event.get("submitted_at")
            if (type(attempts) is not int or not 0 <= attempts <= MAX_DELIVERY_ATTEMPTS
                    or (submitted_at is not None and
                        (type(submitted_at) not in {int, float} or submitted_at < 0))):
                raise Halt("invalid GitHub notification delivery receipt")
            if attempts >= MAX_DELIVERY_ATTEMPTS:
                event["delivery_state"] = "delivery-limit"
                self._write(value)
                continue
            if submitted_at is not None and time.time() - submitted_at < DELIVERY_INTERVAL:
                event["delivery_state"] = "awaiting-acknowledgement"
                self._write(value)
                continue
            if ready is None:
                try:
                    source = self.github.get("contents/.github/workflows/factory-notify.yml?ref=main")
                    workflow = self.github.get("actions/workflows/factory-notify.yml")
                    ready = source.get("type") == "file" and workflow.get("state") == "active"
                except (Halt, OSError, ValueError, KeyError):
                    ready = False
            if not ready:
                event["delivery_state"] = "relay-unavailable"
                self._write(value)
                continue
            # Persist the attempt before the POST. If its response is lost, the
            # next tick first checks the bot marker and waits the full cooldown.
            event.update(attempts=attempts + 1, submitted_at=time.time(),
                         delivery_state="awaiting-acknowledgement")
            self._write(value)
            self.github.write("issues/%s/comments" % event["issue"], {"body": body})

    def sync(self):
        self._recover_retries()
        self.commands()
        # Claimed receipts after a crash are never re-executed. Surface the
        # uncertain result so the user can inspect state and post a new command.
        value = self._load()
        for comment_id, record in value["cursor"]["comments"].items():
            if record["status"] == "claimed":
                value["cursor"] = finish_command(value["cursor"], int(comment_id), "uncertain")
            if comment_id not in value["receipts"]:
                # Legacy terminal records may predate the receipt outbox. Do not
                # fabricate a detailed outcome or execute the command again.
                value["receipts"][comment_id] = {"issue": record["issue"], "message":
                    "操作は受付済みです。中断または返信未着のため状態を確認してください。"
                    "同じコメントは再実行しません。必要な操作は新しいコメントで送ってください。"}
        self._write(value)
        for comment_id, receipt in value["receipts"].items():
            try:
                self._receipt(receipt["issue"], int(comment_id), receipt["message"])
            except (Halt, OSError, ValueError, KeyError):
                # One locked/deleted Issue must not starve other acknowledgements
                # or status updates. Its selected receipt remains queued.
                atomic_json(self.store.root / "github-sync-error.json",
                            {"at": stamp(), "error": "receipt-sync-failed"})
        for job in sorted((self.store.root / "jobs").glob("*")):
            if re.fullmatch(r"[1-9][0-9]*", job.name) and (job / "state.json").is_file():
                self.publish(int(job.name))
        value = self._load()
        if value.get("queue_failure"):
            self.publish(value["queue_failure"]["issue"])
        self.flush()
