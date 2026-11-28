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

function notificationBody(event) {
  const issueUrl = `https://github.com/${REPOSITORY}/issues/${event.issue}`;
  const statusUrl = `${issueUrl}#issuecomment-${event.status_comment}`;
  const descriptions = {
    started: "ファクトリーがこのIssueの処理を開始しました。",
    "needs-human": "ファクトリーが停止し、確認が必要になりました。状態コメントを確認してください。",
    "draft-complete": "検証とレビューを終え、staging向けDraft PRを作成しました。",
  };
  const lines = [notificationMarker(event.key), "", `@${OWNER} ${descriptions[event.kind]}`,
    "", `[状態を確認する](${statusUrl})`];
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
    ...target, issue_number: event.issue, body: notificationBody(event),
  });
  return { status: "delivered", comment_id: created.id };
}

module.exports = { notify, validateEvent, notificationBody, EVENT_PREFIX, STATUS_PREFIX };
