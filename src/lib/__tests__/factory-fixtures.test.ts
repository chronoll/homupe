/** @jest-environment node */
import { Client } from "@notionhq/client";
import { createClient } from "redis";
import Redis from "ioredis";
import { getClient } from "@/lib/redis";
import { NextRequest } from "next/server";
import { getBlogPosts, getBlogPost, getRelatedArticles, getBooks, getContents } from "@/lib/notion";
import { FIXTURE_BLOG_ID, isFactoryFixtureMode } from "@/lib/factory-fixtures";
import { GET as listArticles } from "@/app/api/notion/blog/route";
import { GET as article } from "@/app/api/notion/blog/[id]/route";
import { GET as bbs, POST as postBBS } from "@/app/api/bbs/route";
import { GET as counter, POST as increment } from "@/app/api/visitor-count/route";
import { GET as redisDiagnostic } from "@/app/api/test-redis/route";

jest.mock("@notionhq/client", () => ({ Client: jest.fn(() => { throw new Error("Unexpected Notion connection"); }) }));
jest.mock("redis", () => ({ createClient: jest.fn(() => { throw new Error("Unexpected Redis connection"); }) }));
jest.mock("ioredis", () => jest.fn(() => { throw new Error("Unexpected ioredis connection"); }));

const originalEnv = process.env;
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv, FACTORY_FIXTURES: "1", VERCEL_ENV: "development",
    NOTION_API_KEY: "must-not-be-used", NOTION_DATABASE_ID: "must-not-be-used",
    NOTION_BOOKS_DATABASE_ID: "must-not-be-used", NOTION_CONTENTS_DATABASE_ID: "must-not-be-used",
    REDIS_URL: "redis://must-not-be-used.invalid:6379",
  };
  global.fetch = jest.fn(() => { throw new Error("Unexpected external fetch"); });
});

afterEach(() => {
  expect(Client).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
  expect(Redis).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  process.env = originalEnv;
  global.fetch = originalFetch;
});

test("fixture repositories return real content without using configured service credentials", async () => {
  expect(await getBlogPosts()).toHaveLength(2);
  expect((await getBlogPost(FIXTURE_BLOG_ID)).blocks).toHaveLength(3);
  expect(await getRelatedArticles(FIXTURE_BLOG_ID)).toHaveLength(1);
  expect((await getBooks())[0].title).toBe("検証用の技術書");
  expect((await getContents())[0].title).toBe("検証用コンテンツ");
  const changed = await getBlogPosts();
  changed[0].title = "mutated";
  expect((await getBlogPosts())[0].title).toBe("ファクトリー検証用の記事");
});

test("both Notion APIs use fixture data and unknown IDs return 404", async () => {
  expect(await (await listArticles()).json()).toHaveLength(2);
  const response = await article(new Request("http://localhost/api/notion/blog/test"), { params: Promise.resolve({ id: FIXTURE_BLOG_ID }) });
  expect(response.status).toBe(200);
  expect((await response.json()).title).toBe("ファクトリー検証用の記事");
  expect((await article(new Request("http://localhost/api/notion/blog/missing"), { params: Promise.resolve({ id: "missing" }) })).status).toBe(404);
  await expect(getBlogPost("missing")).rejects.toThrow("Fixture article not found");
});

test("Redis reads are deterministic and write-capable diagnostics are blocked", async () => {
  expect((await (await bbs()).json()).posts[0].message).toBe("検証用の掲示板です。");
  expect(await (await counter()).json()).toEqual({ count: 1234 });
  expect(await (await increment()).json()).toEqual({ count: 1234 });
  expect((await redisDiagnostic()).status).toBe(403);
  expect(getClient).toThrow("disabled in fixture mode");
});

test("BBS validates input and rejects writes without pretending to persist a post", async () => {
  const request = (message: string) => new NextRequest("http://localhost/api/bbs", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "E2E", message }),
  });
  expect((await postBBS(request(""))).status).toBe(400);
  expect((await postBBS(request("x".repeat(201)))).status).toBe(400);
  expect((await postBBS(request("a valid post"))).status).toBe(403);
  expect((await (await bbs()).json()).posts).toHaveLength(1);
});

test("Preview always uses fixtures, while production refuses an explicit fixture flag", () => {
  delete process.env.FACTORY_FIXTURES;
  process.env.VERCEL_ENV = "preview";
  expect(isFactoryFixtureMode()).toBe(true);
  process.env.VERCEL_ENV = "production";
  expect(isFactoryFixtureMode()).toBe(false);
  process.env.FACTORY_FIXTURES = "0";
  expect(isFactoryFixtureMode()).toBe(false);
  process.env.FACTORY_FIXTURES = "1";
  expect(isFactoryFixtureMode).toThrow("cannot be enabled in production");
});

test("normal unconfigured reads retain their existing empty-data fallback", async () => {
  delete process.env.FACTORY_FIXTURES;
  process.env.VERCEL_ENV = "development";
  delete process.env.NOTION_DATABASE_ID;
  delete process.env.REDIS_URL;
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  try {
    expect(isFactoryFixtureMode()).toBe(false);
    expect(await getBlogPosts()).toEqual([]);
    expect(await (await counter()).json()).toEqual({ count: 123 });
    expect(await (await bbs()).json()).toEqual({ posts: [] });
  } finally { warn.mockRestore(); log.mockRestore(); }
});
