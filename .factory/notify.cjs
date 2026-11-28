"use strict";

// The event and status comments come from the fixed host controller. Issue text,
// model output and comment text never become executable code or notification text.
const REPOSITORY = "chronoll/homupe";
const OWNER = "chronoll";
const BOT = "github-actions[bot]";
const EVENT_PREFIX = "<!-- homupe-factory-event:v1 -->\n";
const HIDDEN_SUFFIX = "\n-->\nFactoryの状態を更新しました。";
const STATUS_PREFIX = "<!-- homupe-factory-status:v1 -->\n";
const KEYS = ["issue", "key", "kind", "pr", "status_comment"];
const KINDS = new Set(["started", "needs-human", "draft-complete"]);

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function trustedUser(user) {
  return user?.login === OWNER && user.type === "User";
}

function issueApiUrl(number) {
  return `https://api.github.com/repos/${REPOSITORY}/issues/${number}`;
}

function validateEvent(context) {
  const payload = context?.payload;
  const issue = payload?.issue;
  const comment = payload?.comment;
  if (context?.eventName !== "issue_comment" || payload?.action !== "created"
      || context.actor !== OWNER || context.repo?.owner !== OWNER
      || context.repo?.repo !== "homupe" || payload.repository?.full_name !== REPOSITORY
      || !trustedUser(payload.sender) || !trustedUser(comment?.user)
      || !trustedUser(issue?.user) || Object.hasOwn(issue, "pull_request")
      || !positiveInteger(issue.number) || context.issue?.number !== issue.number
      || !positiveInteger(comment.id) || comment.issue_url !== issueApiUrl(issue.number)
      || typeof comment.body !== "string" || Buffer.byteLength(comment.body, "utf8") > 2048
      || !comment.body.startsWith(EVENT_PREFIX)) {
    return null;
  }
  let event;
  try {
    let raw = comment.body.slice(EVENT_PREFIX.length);
    if (raw.startsWith("<!--\n")) {
      if (!raw.endsWith(HIDDEN_SUFFIX)) return null;
      raw = raw.slice("<!--\n".length, -HIDDEN_SUFFIX.length);
      // The flat event contract never needs HTML delimiters inside JSON.
      if (raw.includes("<!--") || raw.includes("-->")) return null;
    }
    // Retain the original JSON-only form for already submitted events.
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!event || Array.isArray(event) || typeof event !== "object"
      || JSON.stringify(Object.keys(event).sort()) !== JSON.stringify(KEYS)
      || typeof event.key !== "string" || !/^[a-f0-9]{64}$/.test(event.key)
      || !KINDS.has(event.kind) || event.issue !== issue.number
      || !positiveInteger(event.status_comment)
      || (event.kind === "draft-complete" ? !positiveInteger(event.pr) : event.pr !== null)) {
    return null;
  }
  return event;
}

function notificationMarker(key) {
  return `<!-- homupe-factory-notify:v1:${key} -->`;
}

function selectedText(value) {
  // These fields were selected and redacted by the host, but remain task data.
  // Re-escape for this comment and never allow a second mention or active HTML.
  let text = value.replace(/\\([\\`*_~\[\]<>#])/g, "$1")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, "")
    .replace(/\b(?:authorization|proxy-authorization)\s*[:=].*/gi, "認証情報は非表示")
    .replace(/\b[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY)[A-Za-z0-9_]*\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "認証情報は非表示")
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/g, "認証情報は非表示")
    .replace(/https?:\/\/[^\s<>"']+/g, "URLは非表示")
    .replace(/(?<![\w:/])(?:[A-Za-z]:[\\/]|~\/|\/)[^\s,;)'"<>]+/g, "ローカルパスは非表示")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "長い値は非表示")
    .replace(/@/g, "＠").replace(/\s+/gu, " ").trim();
  const characters = Array.from(text);
  if (characters.length > 300) text = characters.slice(0, 299).join("") + "…";
  const special = new Set(["\\", "`", "*", "_", "~", "[", "]", "<", ">", "#"]);
  return Array.from(text, (character) => special.has(character) ? "\\" + character : character).join("");
}

function selectedStatus(body) {
  const content = body.slice(STATUS_PREFIX.length);
  const action = /^<!-- homupe-factory-action:v1:(wait|answer|retry|maintenance|review) -->\n/.exec(content)?.[1] || null;
  const line = (label) => {
    const found = content.split("\n").find((item) => item.startsWith(label + ":"));
    return found ? selectedText(found.slice(label.length + 1)) : "";
  };
  return { action, question: line("確認事項"), reason: line("理由"),
    review: line("レビュー概要"), phase: line("状態") };
}

function notificationBody(event, statusBody = STATUS_PREFIX) {
  const issueUrl = `https://github.com/${REPOSITORY}/issues/${event.issue}`;
  const statusUrl = `${issueUrl}#issuecomment-${event.status_comment}`;
  const status = selectedStatus(statusBody);
  // The status may have advanced while a milestone was queued. Its explicit
  // current action takes precedence over an old event's next-step wording.
  const action = status.action || (event.kind === "started" ? "wait" :
    event.kind === "draft-complete" ? "review" : "legacy");
  const repairExhausted = /(?:自動|技術)修正.{0,12}上限|after one bounded repair|repair budget.{0,20}exhausted/i.test(status.reason);
  const descriptions = {
    wait: "ファクトリーが処理中です。あなたの操作は不要です。",
    answer: "回答が必要です。確認事項への回答をIssue本文に追記してください。",
    retry: repairExhausted ? "技術修正の上限に達して停止しました。業務上の判断や回答は不要です。" :
      "この試行は停止しています。停止理由を確認してください。",
    maintenance: "実行環境や認証の復旧が必要です。あなたの仕様判断や回答は不要です。",
    review: "人によるPRの確認が必要です。ChecksとPreviewを確認してください。",
    legacy: "ファクトリーが停止しました。必要な操作を状態コメントで確認してください。",
  };
  const summary = action === "answer" ? status.question || status.reason || status.phase :
    action === "wait" ? status.phase :
    action === "review" ? status.review || status.phase : status.reason || status.review || status.phase;
  const lines = [notificationMarker(event.key), "", `@${OWNER} ${descriptions[action]}`];
  if (summary) lines.push("", (action === "answer" && status.question ? "確認事項: " : "概要: ") + summary);
  if (action === "answer") {
    lines.push("", "回答をIssue本文に追記した後、新しいコメントで次の1行を送ってください。", "", "```", "/factory retry", "```");
  } else if (action === "retry") {
    lines.push("", "サブスク利用枠を使った追加の試行を希望する場合だけ、このIssueに新しいコメントで次の1行を送ってください。", "", "```", "/factory retry", "```");
  } else if (action === "maintenance") {
    lines.push("", "状態コメントの復旧案内に沿って対応し、復旧後の再開方法を確認してください。");
  }
  lines.push("", `[状態を確認する](${statusUrl})`);
  if (event.kind === "draft-complete") {
    lines.push(`[Draft PRを確認する](https://github.com/${REPOSITORY}/pull/${event.pr})`);
  }
  return lines.join("\n");
}

async function notify({ github, context }) {
  const event = validateEvent(context);
  if (!event) return { status: "ignored" };
  const target = { owner: OWNER, repo: "homupe" };
  // A bare comment number is not authority to link to another Issue or author.
  const { data: status } = await github.rest.issues.getComment({
    ...target, comment_id: event.status_comment,
  });
  if (status?.id !== event.status_comment || !trustedUser(status.user)
      || status.issue_url !== issueApiUrl(event.issue) || typeof status.body !== "string"
      || !status.body.startsWith(STATUS_PREFIX)) {
    return { status: "ignored" };
  }
  const marker = notificationMarker(event.key);
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...target, issue_number: event.issue, per_page: 100,
  });
  const existing = comments.find((comment) => comment.user?.login === BOT
    && comment.user.type === "Bot" && typeof comment.body === "string"
    && comment.body.startsWith(marker + "\n"));
  if (existing) return { status: "already-delivered", comment_id: existing.id };
  // Do not retry this POST here: a lost response may already have created the
  // comment. A same-key event re-delivery reconciles it through the list above.
  const { data: created } = await github.rest.issues.createComment({
    ...target, issue_number: event.issue, body: notificationBody(event, status.body),
  });
  return { status: "delivered", comment_id: created.id };
}

module.exports = { notify, validateEvent, notificationBody, EVENT_PREFIX, STATUS_PREFIX };
