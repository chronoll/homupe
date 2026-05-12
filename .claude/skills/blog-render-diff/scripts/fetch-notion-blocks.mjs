#!/usr/bin/env node
/**
 * Notionページから全ブロックを再帰取得するスクリプト
 *
 * Usage:
 *   node fetch-notion-blocks.mjs <pageId or URL>
 *
 * 出力: stdoutに { pageId, title, blocks } のJSON
 *
 * 必要な環境変数: NOTION_API_KEY (.env.local から自動読み込み)
 */
import { Client } from "@notionhq/client";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadDotenvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) {
        const [, key, value] = m;
        if (!process.env[key]) {
          process.env[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch (e) {
    process.stderr.write(
      `Warning: .env.local could not be read (${e.message}). Falling back to existing env.\n`,
    );
  }
}

function extractPageId(input) {
  if (!input) return null;
  // UUID形式優先
  const uuidMatch = input.match(
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
  );
  if (uuidMatch) return uuidMatch[0].toLowerCase();
  // 32文字hex (Notion URLの末尾形式)
  const hexMatch = input.match(/[a-f0-9]{32}/i);
  if (hexMatch) return hexMatch[0].toLowerCase();
  return null;
}

async function fetchBlockChildren(notion, blockId) {
  const all = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of res.results) {
      if (block.has_children) {
        block.children = await fetchBlockChildren(notion, block.id);
      }
      all.push(block);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return all;
}

function extractTitle(page) {
  if (!page?.properties) return "Untitled";
  for (const value of Object.values(page.properties)) {
    if (value?.type === "title" && value.title?.[0]?.plain_text) {
      return value.title.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

async function main() {
  loadDotenvLocal();

  const arg = process.argv[2];
  if (!arg) {
    process.stderr.write(
      "Usage: node fetch-notion-blocks.mjs <pageId or URL>\n",
    );
    process.exit(1);
  }

  const pageId = extractPageId(arg);
  if (!pageId) {
    process.stderr.write(
      `Could not extract Notion page ID from input: ${arg}\n`,
    );
    process.exit(1);
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      "NOTION_API_KEY is not set. Check .env.local in the project root.\n",
    );
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });

  let page;
  try {
    page = await notion.pages.retrieve({ page_id: pageId });
  } catch (e) {
    process.stderr.write(
      `Failed to retrieve page (${pageId}): ${e.message}\n`,
    );
    process.exit(1);
  }

  const blocks = await fetchBlockChildren(notion, pageId);

  const out = {
    pageId,
    title: extractTitle(page),
    blocks,
  };
  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e.message || e}\n`);
  process.exit(1);
});
