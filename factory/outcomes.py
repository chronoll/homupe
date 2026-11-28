"""Pure classification of a held job into a concrete human next action.

This module never retries, resumes, reads logs, or changes the queue. Its selected
public metadata is safe to store separately from private process diagnostics.
"""
from __future__ import annotations

from factory.github_control import safe_plain_text


_STEPS = (("npm", "ci"), ("npm", "run", "check"),
          ("npm", "run", "build:fixtures"), ("npm", "run", "test:e2e"))


def _result(kind, action, reason, human=""):
    return {"halt_kind": kind, "next_action": action,
            "reason": safe_plain_text(reason, 1000),
            "human_message": safe_plain_text(human, 600)}


def _without_traceback(value, limit=700):
    if not isinstance(value, str):
        return ""
    # Stack frames/process transcripts are private evidence, not public status.
    return safe_plain_text(value.split("Traceback (most recent call last):", 1)[0], limit)


def _review_question(state):
    for value in (state.get("human_message"), state.get("review_summary"),
                  state.get("review", {}).get("summary") if isinstance(state.get("review"), dict) else None):
        if isinstance(value, str) and value.strip():
            return value
    return ""


def _step_name(step):
    if type(step) is int and 0 <= step < len(_STEPS):
        return " ".join(_STEPS[step])
    if isinstance(step, (list, tuple)) and all(isinstance(x, str) for x in step):
        return " ".join(step) if tuple(step) in _STEPS else "アプリ検証"
    if isinstance(step, str) and step in {" ".join(x) for x in _STEPS}:
        return step
    return "アプリ検証"


def _diagnostics(value):
    if isinstance(value, str):
        return _without_traceback(value)
    if isinstance(value, (list, tuple)):
        return _without_traceback(" / ".join(x for x in value[:3] if isinstance(x, str)))
    if isinstance(value, dict):
        return _without_traceback(value.get("summary"))
    return ""


def classify_failure(error, state):
    """Select reason, halt_kind, human_message and next_action, without I/O.

    Structured verification failures are raised only after the controller's
    bounded repair decision. A review question can be supplied as human_message,
    review_summary, or review.summary; no missing business facts are invented.
    Unknown failures require maintenance rather than a blind usage-consuming run.
    """
    state = state if isinstance(state, dict) else {}
    raw = str(error) if isinstance(error, BaseException) else error if isinstance(error, str) else ""
    lowered = raw.lower()
    phase = state.get("phase")
    if phase == "publishing":
        # A STOP/error after the publication boundary cannot prove whether the
        # remote write landed. Reconcile first, even if the error looks benign.
        return _result("publication", "maintenance", "PR・ブランチの公開結果を照合する必要があります。",
            "GitHub の既存 PR と factory/issue ブランチを確認してください。公開済みなら既存 PR を確認し、"
            "不要な PR・ブランチは人が整理します。照合が済むまで再試行しません。")
    if ("local stop requested" in lowered or "dispatcher interrupted" in lowered
            or "watcher interrupted" in lowered or isinstance(error, KeyboardInterrupt)):
        return _result("stopped", "retry", "停止要求により、この試行を保留しました。",
            "停止したままなら操作不要です。この Issue を続ける場合だけ追加試行を許可してください。"
            "キューだけを再開しても、この試行は保留のままです。")
    if hasattr(error, "step") and hasattr(error, "diagnostics"):
        diagnostic = _diagnostics(getattr(error, "diagnostics", None))
        reason = "検証（" + _step_name(getattr(error, "step", None)) + "）のエラーが、自動修正の上限までに解決しませんでした。"
        if diagnostic:
            reason += " " + diagnostic
        return _result("technical", "retry", reason,
            "これはコードの検証エラーで、業務上の判断を求めている状態ではありません。"
            "追加のサブスク利用を許可する場合だけ再試行してください。")
    for prefix in ("plan requires human input:", "implementation requires human input:"):
        if lowered.startswith(prefix):
            question = _without_traceback(raw[len(prefix):].strip(), 600)
            if question:
                return _result("question", "answer", "実装に必要な情報・判断を確認しています。", question)
            return _result("unknown", "maintenance", "必要な確認内容を取得できませんでした。",
                "実行担当に質問内容の確認を依頼してください。不明な事実を推測して進めません。")
    if "review requires human attention" in lowered:
        question = _without_traceback(_review_question(state), 600)
        if question:
            return _result("question", "answer", "レビューで判断に必要な根拠が不足しています。", question)
        return _result("unknown", "maintenance", "レビューの具体的な確認事項を取得できませんでした。",
            "実行担当にレビュー結果の確認を依頼してください。根拠のない質問は作成しません。")
    if any(x in lowered for x in (
            "publication", "remote issue branch already exists", "open pr already exists",
            "remote pr", "push response")):
        return _result("publication", "maintenance", "PR・ブランチの公開結果を照合する必要があります。",
            "GitHub の既存 PR と factory/issue ブランチを確認してください。公開済みなら既存 PR を確認し、"
            "不要な PR・ブランチは人が整理します。照合が済むまで再試行しません。")
    if any(x in lowered for x in (
            "must be signed in", "not logged in", "authentication", "unauthorized",
            "api key", "rate limit", "rate_limit", "quota", "requested model",
            "model is not available", "model not found", "login required")):
        return _result("auth", "maintenance", "認証・利用可能なモデル・サブスク利用枠の確認が必要です。",
            "実行担当にアカウントと利用枠の確認を依頼してください。コードの修正や仕様への回答では直りません。"
            "API キーやパスワードを Issue に書かず、復旧後に状態を確認してください。")
    if any(x in lowered for x in (
            "cleanup", "orphan", "docker", "colima", "vm profile",
            "runtime startup", "runtime unavailable", "command timed out")) and not hasattr(error, "step"):
        return _result("runtime", "maintenance", "実行環境の復旧・停止処理の確認が必要です。",
            "実行担当に環境の確認を依頼してください。復旧が確認できるまで追加のモデル試行を行いません。")
    if any(x in lowered for x in (
            "protected", "symlink", "non-regular", "unsafe archive", "candidate changed",
            "review does not match", "committed tree differs", "planning modified",
            "invalid review finding", "schema", "strict config", "manifest")):
        return _result("policy", "maintenance", "ファクトリーの保護条件または検証証拠の確認が必要です。",
            "実行担当に保護対象・出力契約・候補コードの整合性の確認を依頼してください。"
            "保護条件を回避して再試行しません。")
    if "review still requires changes after one bounded repair" in lowered:
        return _result("technical", "retry", "技術レビューの指摘が自動修正の上限（1 回）までに解決しませんでした。",
            "これはコード修正の上限到達で、業務上の判断ではありません。"
            "追加のサブスク利用を許可する場合だけ、もう一度試行できます。")
    if "one-hour" in lowered or "one hour" in lowered:
        return _result("technical", "retry", "試行全体の 1 時間の上限に達しました。",
            "作業を小さく分けるか、追加のサブスク利用を許可する場合だけ再試行してください。")
    if "issue changed" in lowered:
        return _result("input", "retry", "Issue の本文・状態・停止条件が変更されたため停止しました。",
            "現在の Issue 内容とラベルを確認してください。open で実行対象のまま続ける場合だけ再試行します。")
    if "staging advanced" in lowered:
        return _result("technical", "retry", "基点の staging が更新され、候補コードの作り直しが必要です。",
            "仕様の判断は不要です。現在の staging から追加のサブスク利用で試行し直す場合だけ再試行してください。")
    detail = _without_traceback(raw, 450)
    return _result("unknown", "maintenance", "実行担当による原因の確認が必要です。" + (" " + detail if detail else ""),
        "原因が確認できるまで再試行しません。実行担当にこの Issue の状態を確認するよう依頼してください。")
