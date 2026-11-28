"use strict";

// Exercise the same CommonJS loading contract used by actions/github-script.
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { notify, validateEvent, EVENT_PREFIX, STATUS_PREFIX } = require("./notify.cjs");

const KEY = "a".repeat(64);
const ISSUE = 42;
const STATUS = 1234;
const API_ISSUE = `https://api.github.com/repos/chronoll/homupe/issues/${ISSUE}`;
const user = (login = "chronoll", type = "User") => ({ login, type });
const marker = (key = KEY) => `<!-- homupe-factory-notify:v1:${key} -->`;

function event(kind = "started") {
  return { key: KEY, kind, issue: ISSUE, status_comment: STATUS,
    pr: kind === "draft-complete" ? 52 : null };
}

function hiddenBody(data) {
  return EVENT_PREFIX + "<!--\n" + JSON.stringify(data) + "\n-->\nFactoryの状態を更新しました。";
}

function context(data = event()) {
  return {
    eventName: "issue_comment", actor: "chronoll",
    repo: { owner: "chronoll", repo: "homupe" }, issue: { number: ISSUE },
    payload: {
      action: "created", repository: { full_name: "chronoll/homupe" }, sender: user(),
      issue: { number: ISSUE, user: user() },
      comment: { id: 9001, user: user(), issue_url: API_ISSUE,
        body: EVENT_PREFIX + JSON.stringify(data) },
    },
  };
}

function client(pages = []) {
  const calls = { get: [], list: [], create: [] };
  const status = { id: STATUS, user: user(), issue_url: API_ISSUE,
    body: STATUS_PREFIX + "ファクトリーの状態" };
  const listComments = () => { throw new Error("use pagination"); };
  const github = {
    rest: { issues: {
      getComment: async (args) => {
        calls.get.push(args);
        return { data: status };
      },
      listComments,
      createComment: async (args) => {
        calls.create.push(args);
        const created = { id: 8888, user: user("github-actions[bot]", "Bot"), body: args.body };
        pages.push([created]);
        return { data: created };
      },
    } },
    paginate: async (method, args) => {
      assert.equal(method, listComments);
      calls.list.push(args);
      return pages.flat();
    },
  };
  return { github, calls, status, pages };
}

function statusBody(action, lines = []) {
  return STATUS_PREFIX + `<!-- homupe-factory-action:v1:${action} -->\n`
    + ["Factory: Issue #42", ...lines].join("\n");
}

async function notification(kind, body) {
  const api = client();
  api.status.body = body;
  await notify({ github: api.github, context: context(event(kind)) });
  return api.calls.create[0].body;
}

test("accepts only the three defined milestone schemas", () => {
  for (const kind of ["started", "needs-human", "draft-complete"]) {
    const data = event(kind);
    assert.deepEqual(validateEvent(context(data)), data);
  }
});

test("accepts the hidden envelope for every milestone and dedupes legacy re-delivery", async () => {
  for (const kind of ["started", "needs-human", "draft-complete"]) {
    const data = event(kind);
    const c = context(data);
    c.payload.comment.body = hiddenBody(data);
    assert.deepEqual(validateEvent(c), data);
    const api = client();
    assert.equal((await notify({ github: api.github, context: c })).status, "delivered");
    assert.equal((await notify({ github: api.github, context: context(data) })).status, "already-delivered");
    assert.equal(api.calls.create.length, 1);
  }
});

test("rejects malformed hidden envelopes or additional visible text before API access", async () => {
  const good = hiddenBody(event());
  const invalid = [
    good + "\n追加の説明", good + "\n", "説明\n" + good,
    good.replace("Factoryの状態を更新しました。", "別の任意テキスト"),
    good.replace("\n-->\n", "\n--!>\n"),
    good.replace("<!--\n{", "<!--\r\n{"),
    good.replace("\n-->\n", "\n<!-- extra -->\n-->\n"),
    EVENT_PREFIX + "<!--\n" + JSON.stringify(event()) + "\n-->\n任意のJSON後テキスト",
    EVENT_PREFIX + "<!--\n{\"kind\":\"-->visible\","
      + JSON.stringify(event()).slice(1) + "\n-->\nFactoryの状態を更新しました。",
  ];
  for (const body of invalid) {
    const c = context();
    c.payload.comment.body = body;
    const api = client();
    assert.equal(validateEvent(c), null);
    assert.deepEqual(await notify({ github: api.github, context: c }), { status: "ignored" });
    assert.deepEqual(api.calls, { get: [], list: [], create: [] });
  }
});

test("rejects mismatched identities, repositories, triggers and PR contexts before API access", async (t) => {
  const cases = [
    ["wrong sender", (c) => { c.payload.sender.login = "outsider"; }],
    ["bot sender", (c) => { c.payload.sender.type = "Bot"; }],
    ["wrong comment author", (c) => { c.payload.comment.user.login = "outsider"; }],
    ["bot comment author", (c) => { c.payload.comment.user.type = "Bot"; }],
    ["wrong Issue author", (c) => { c.payload.issue.user.login = "outsider"; }],
    ["bot Issue author", (c) => { c.payload.issue.user.type = "Bot"; }],
    ["wrong actor", (c) => { c.actor = "outsider"; }],
    ["wrong owner", (c) => { c.repo.owner = "outsider"; }],
    ["wrong repo", (c) => { c.repo.repo = "other"; }],
    ["wrong payload repo", (c) => { c.payload.repository.full_name = "outsider/homupe"; }],
    ["wrong event", (c) => { c.eventName = "pull_request"; }],
    ["edited comment", (c) => { c.payload.action = "edited"; }],
    ["PR", (c) => { c.payload.issue.pull_request = { url: "https://example.com" }; }],
    ["null PR property", (c) => { c.payload.issue.pull_request = null; }],
    ["mismatched context Issue", (c) => { c.issue.number++; }],
    ["mismatched comment Issue", (c) => { c.payload.comment.issue_url += "0"; }],
    ["invalid Issue number", (c) => { c.payload.issue.number = 0; c.issue.number = 0; }],
    ["invalid event comment ID", (c) => { c.payload.comment.id = "9001"; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const c = context();
      mutate(c);
      const api = client();
      assert.equal(validateEvent(c), null);
      assert.deepEqual(await notify({ github: api.github, context: c }), { status: "ignored" });
      assert.deepEqual(api.calls, { get: [], list: [], create: [] });
    });
  }
});

test("requires the exact event prefix, bounded UTF-8 body and one JSON value", () => {
  const invalid = [
    "quoted " + EVENT_PREFIX + JSON.stringify(event()),
    EVENT_PREFIX.replace("\n", "\r\n") + JSON.stringify(event()),
    EVENT_PREFIX + "{broken}",
    EVENT_PREFIX + JSON.stringify(event()) + "\n{}",
    EVENT_PREFIX + "null",
    EVENT_PREFIX + "[]",
    EVENT_PREFIX + JSON.stringify(event()) + "あ".repeat(2048 / 2),
  ];
  for (const body of invalid) {
    const c = context();
    c.payload.comment.body = body;
    assert.equal(validateEvent(c), null);
  }
  const bounded = context();
  bounded.payload.comment.body += " ".repeat(2048 - Buffer.byteLength(bounded.payload.comment.body));
  assert.deepEqual(validateEvent(bounded), event());
  bounded.payload.comment.body += " ";
  assert.equal(validateEvent(bounded), null);
});

test("rejects extra, missing, malformed or inconsistent event values", async (t) => {
  const cases = [
    ["extra key", (e) => { e.body = "untrusted raw model output"; }],
    ["missing key", (e) => { delete e.pr; }],
    ["short key", (e) => { e.key = "a".repeat(63); }],
    ["uppercase key", (e) => { e.key = "A".repeat(64); }],
    ["non-string key", (e) => { e.key = 123; }],
    ["unknown kind", (e) => { e.kind = "planning"; }],
    ["different Issue", (e) => { e.issue++; }],
    ["string Issue", (e) => { e.issue = String(ISSUE); }],
    ["zero status", (e) => { e.status_comment = 0; }],
    ["string status", (e) => { e.status_comment = String(STATUS); }],
    ["fractional status", (e) => { e.status_comment = 1.5; }],
    ["unsafe status", (e) => { e.status_comment = Number.MAX_SAFE_INTEGER + 1; }],
    ["unexpected PR", (e) => { e.pr = 52; }],
    ["missing draft PR", (e) => { e.kind = "draft-complete"; }],
    ["string draft PR", (e) => { e.kind = "draft-complete"; e.pr = "52"; }],
    ["negative draft PR", (e) => { e.kind = "draft-complete"; e.pr = -1; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const e = event();
      mutate(e);
      assert.equal(validateEvent(context(e)), null);
    });
  }
});

test("validates status-comment owner, identity, Issue and marker before listing or posting", async (t) => {
  const cases = [
    ["different ID", (s) => { s.id++; }],
    ["wrong author", (s) => { s.user.login = "outsider"; }],
    ["bot author", (s) => { s.user.type = "Bot"; }],
    ["other Issue", (s) => { s.issue_url += "0"; }],
    ["missing marker", (s) => { s.body = "normal comment"; }],
    ["quoted marker", (s) => { s.body = "> " + s.body; }],
    ["wrong marker newline", (s) => { s.body = s.body.replace("\n", "\r\n"); }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const api = client();
      mutate(api.status);
      assert.deepEqual(await notify({ github: api.github, context: context() }), { status: "ignored" });
      assert.deepEqual(api.calls.get, [{ owner: "chronoll", repo: "homupe", comment_id: STATUS }]);
      assert.deepEqual(api.calls.list, []);
      assert.deepEqual(api.calls.create, []);
    });
  }
});

test("posts fixed Japanese mentions and validated links for all milestones exactly once", async (t) => {
  for (const kind of ["started", "needs-human", "draft-complete"]) {
    await t.test(kind, async () => {
      const api = client();
      const c = context(event(kind));
      const result = await notify({ github: api.github, context: c });
      assert.deepEqual(result, { status: "delivered", comment_id: 8888 });
      assert.deepEqual(api.calls.list, [{ owner: "chronoll", repo: "homupe", issue_number: ISSUE, per_page: 100 }]);
      assert.equal(api.calls.create.length, 1);
      const request = api.calls.create[0];
      assert.equal(request.owner, "chronoll");
      assert.equal(request.repo, "homupe");
      assert.equal(request.issue_number, ISSUE);
      assert.ok(request.body.startsWith(marker() + "\n\n@chronoll "));
      assert.equal(request.body.match(/@chronoll/g).length, 1);
      assert.ok(request.body.includes(`https://github.com/chronoll/homupe/issues/${ISSUE}#issuecomment-${STATUS}`));
      assert.equal(request.body.includes("https://github.com/chronoll/homupe/pull/52"), kind === "draft-complete");
      assert.ok(!request.body.includes(EVENT_PREFIX));
      assert.deepEqual(await notify({ github: api.github, context: c }), { status: "already-delivered", comment_id: 8888 });
      assert.equal(api.calls.create.length, 1);
    });
  }
});

test("processing notification makes the absence of required user action clear", async () => {
  const body = await notification("started", statusBody("wait", [
    "状態: 検証エラーを自動修正中。あなたの操作は不要です。",
    "理由: 内部の診断内容をここへ展開しない。",
  ]));
  assert.ok(body.includes("あなたの操作は不要です"));
  assert.ok(body.includes("概要: 検証エラーを自動修正中"));
  assert.ok(!body.includes("内部の診断内容"));
  assert.ok(!body.includes("/factory retry"));
});

test("technical repair limit requests an optional retry rather than a business answer", async () => {
  const body = await notification("needs-human", statusBody("retry", [
    "状態: 技術修正の上限に到達", "理由: 自動修正上限に達し、型検査がまだ失敗しています。",
    "確認事項: この行を業務判断の質問として扱わない。",
  ]));
  for (const text of ["技術修正の上限", "業務上の判断や回答は不要", "追加の試行を希望する場合だけ",
                      "概要: 自動修正上限に達し、型検査がまだ失敗", "\n/factory retry\n"]) {
    assert.ok(body.includes(text), text);
  }
  assert.ok(!body.includes("本文に追記"));
  assert.ok(!body.includes("この行を業務判断"));
});

test("other retryable stops do not invent a technical repair limit or a business-answer claim", async () => {
  for (const reason of ["stagingの基点が更新されました。", "Issue本文が変更されました。",
                        "試行全体の時間上限に到達しました。", "ユーザーから停止が要求されました。"] ) {
    const body = await notification("needs-human", statusBody("retry", ["理由: " + reason]));
    assert.ok(body.includes("この試行は停止しています"));
    assert.ok(body.includes(reason));
    assert.ok(body.includes("サブスク利用枠を使った追加の試行を希望する場合だけ"));
    assert.ok(body.includes("\n/factory retry\n"));
    assert.ok(!body.includes("技術修正の上限に達して"));
    assert.ok(!body.includes("業務上の判断や回答は不要"));
  }
});

test("answer notification includes the concrete question and exact GitHub next steps", async () => {
  const body = await notification("needs-human", statusBody("answer", [
    "確認事項: 公開日は12月1日と12月8日のどちらですか？",
    "理由: 計画を確定するために公開日が必要です。",
  ]));
  assert.ok(body.includes("回答が必要です"));
  assert.ok(body.includes("確認事項: 公開日は12月1日と12月8日のどちらですか？"));
  assert.ok(body.includes("回答をIssue本文に追記した後、新しいコメント"));
  assert.ok(body.includes("\n/factory retry\n"));
  assert.ok(!body.includes("技術修正の上限"));
});

test("maintenance notification asks for recovery without suggesting a blind retry", async () => {
  const body = await notification("needs-human", statusBody("maintenance", [
    "理由: 実装用のChatGPT認証を復旧する必要があります。",
  ]));
  for (const text of ["実行環境や認証の復旧が必要", "仕様判断や回答は不要",
                      "復旧案内に沿って対応", "概要: 実装用のChatGPT認証"]) {
    assert.ok(body.includes(text), text);
  }
  assert.ok(!body.includes("/factory retry"));
  assert.ok(!body.includes("本文に追記"));
});

test("completed draft notification asks for human Checks and Preview review", async () => {
  const body = await notification("draft-complete", statusBody("review", [
    "レビュー概要: 空表示の修正とPC・モバイル検証が完了しました。",
  ]));
  assert.ok(body.includes("人によるPRの確認が必要"));
  assert.ok(body.includes("ChecksとPreviewを確認"));
  assert.ok(body.includes("概要: 空表示の修正とPC・モバイル検証"));
  assert.ok(body.includes("https://github.com/chronoll/homupe/pull/52"));
  assert.ok(!body.includes("/factory retry"));
});

test("legacy or misplaced action markers fall back to reading status without inferring a retry", async () => {
  for (const body of [
    STATUS_PREFIX + "Factory: Issue #42\n理由: 古い状態です。",
    STATUS_PREFIX + "\n<!-- homupe-factory-action:v1:retry -->\n理由: 位置が違う。",
    STATUS_PREFIX + "> <!-- homupe-factory-action:v1:retry -->\n理由: 引用されたマーカー。",
    STATUS_PREFIX + "<!-- homupe-factory-action:v2:retry -->\n理由: 未対応の版。",
    statusBody("unknown", ["理由: 未対応の操作。"]),
  ]) {
    const result = await notification("needs-human", body);
    assert.ok(result.includes("必要な操作を状態コメントで確認"));
    assert.ok(!result.includes("/factory retry"));
    assert.ok(!result.includes("業務上の判断や回答は不要"));
  }
});

test("a queued old milestone uses the current action instead of contradicting it", async () => {
  const question = await notification("started", statusBody("answer", ["確認事項: 対象期間はいつですか？"]));
  assert.ok(question.includes("回答が必要です"));
  assert.ok(!question.includes("あなたの操作は不要です"));
  const running = await notification("needs-human", statusBody("wait", ["状態: 追加の技術修正中"]));
  assert.ok(running.includes("あなたの操作は不要です"));
  assert.ok(!running.includes("/factory retry"));
});

test("selected question is bounded, escaped and cannot add mentions, HTML, links or fences", async () => {
  const body = await notification("needs-human", statusBody("answer", [
    "確認事項: @outsider <img src=x> [link](https://bad.example/private) ``` \u0000\u202e" + "あ".repeat(400),
    "生ログ: PRIVATE-RAW-LOG-MUST-NOT-APPEAR",
  ]));
  const question = body.split("\n").find((line) => line.startsWith("確認事項: "));
  assert.ok(question.includes("＠outsider"));
  assert.ok(!question.includes("@outsider"));
  assert.ok(question.includes("\\<img"));
  assert.ok(question.includes("\\[link\\]"));
  assert.ok(!question.includes("https://bad.example"));
  assert.ok(!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(question));
  const visible = question.slice("確認事項: ".length).replace(/\\([\\`*_~\[\]<>#])/g, "$1");
  assert.equal(Array.from(visible).length, 300);
  assert.ok(visible.endsWith("…"));
  assert.equal(body.match(/^```$/gm).length, 2, "only the fixed command fence is active");
  assert.equal(body.match(/@[A-Za-z0-9_-]+/g).length, 1, "only the fixed owner mention is active");
  assert.ok(!body.includes("PRIVATE-RAW-LOG-MUST-NOT-APPEAR"));
});

test("selected summary redacts credential patterns and local paths as an extra boundary", async () => {
  const body = await notification("needs-human", statusBody("retry", [
    "理由: GH_TOKEN=ghp_TESTPRIVATEVALUE1234567890123456 /Users/private-owner/secret-file の検査が失敗。",
  ]));
  assert.ok(!body.includes("ghp_TESTPRIVATEVALUE"));
  assert.ok(!body.includes("private-owner"));
  assert.ok(body.includes("認証情報は非表示"));
  assert.ok(body.includes("ローカルパスは非表示"));
});

test("paginates through earlier forged markers and accepts only the exact bot marker", async () => {
  const fake = { id: 1, user: user(), body: marker() + "\nforged" };
  const real = { id: 9, user: user("github-actions[bot]", "Bot"), body: marker() + "\ndelivered" };
  const api = client([[fake, ...Array.from({ length: 99 }, (_, id) => ({ id, body: "unrelated" }))], [real]]);
  assert.deepEqual(await notify({ github: api.github, context: context() }), { status: "already-delivered", comment_id: 9 });
  assert.equal(api.calls.list[0].per_page, 100);
  assert.equal(api.calls.create.length, 0);
});

test("notification text excludes Issue text, status text and other raw payload data", async () => {
  const api = client();
  const c = context();
  const privateText = "PRIVATE-LOG-OR-MODEL-TEXT $(execute) @outsider";
  c.payload.issue.title = privateText;
  c.payload.issue.body = privateText;
  c.payload.sender.name = privateText;
  api.status.body += "\n" + privateText;
  await notify({ github: api.github, context: c });
  assert.ok(!api.calls.create[0].body.includes(privateText));
  assert.ok(!api.calls.create[0].body.includes("@outsider"));
});

test("does not trust another author, a quoted marker or a partial marker for idempotence", async (t) => {
  const cases = [
    { user: user(), body: marker() + "\nforged" },
    { user: user("other-bot[bot]", "Bot"), body: marker() + "\nforged" },
    { user: user("github-actions[bot]", "User"), body: marker() + "\nforged" },
    { user: user("github-actions[bot]", "Bot"), body: "> " + marker() + "\nquoted" },
    { user: user("github-actions[bot]", "Bot"), body: marker() + " extra\npartial" },
    { user: user("github-actions[bot]", "Bot"), body: marker("b".repeat(64)) + "\nother event" },
  ];
  for (let index = 0; index < cases.length; index++) {
    await t.test(String(index), async () => {
      const api = client([[{ id: 7, ...cases[index] }]]);
      assert.equal((await notify({ github: api.github, context: context() })).status, "delivered");
      assert.equal(api.calls.create.length, 1);
    });
  }
});

test("reconciles a successful POST with a lost response on same-key re-delivery", async () => {
  const api = client();
  const create = api.github.rest.issues.createComment;
  api.github.rest.issues.createComment = async (args) => {
    await create(args);
    throw new Error("response lost after creation");
  };
  await assert.rejects(notify({ github: api.github, context: context() }), /response lost/);
  assert.equal(api.calls.create.length, 1, "no immediate POST retry");
  assert.deepEqual(await notify({ github: api.github, context: context() }), { status: "already-delivered", comment_id: 8888 });
  assert.equal(api.calls.create.length, 1);
});

test("API read failure makes no notification write and no automatic retry", async () => {
  const api = client();
  let attempts = 0;
  api.github.rest.issues.getComment = async () => {
    attempts++;
    throw new Error("unavailable");
  };
  await assert.rejects(notify({ github: api.github, context: context() }), /unavailable/);
  assert.equal(attempts, 1);
  assert.deepEqual(api.calls.list, []);
  assert.deepEqual(api.calls.create, []);
});
