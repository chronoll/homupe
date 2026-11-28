import type { PageObjectResponse, RichTextItemResponse } from "@notionhq/client/build/src/api-endpoints";
import type { BlogPost, BlogPostDetail, BlockWithChildren, ContentEntry } from "./notion";
import type { Book } from "./types";

export const FIXTURE_BLOG_ID = "11111111-1111-4111-8111-111111111111";
export const FIXTURE_RELATED_ID = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-01-01T00:00:00.000Z";
const USER = { object: "user", id: FIXTURE_BLOG_ID } as const;

/** Preview deployments are always isolated from production services. */
export function isFactoryFixtureMode(): boolean {
  if (process.env.VERCEL_ENV === "production" && process.env.FACTORY_FIXTURES === "1") {
    throw new Error("FACTORY_FIXTURES cannot be enabled in production");
  }
  return process.env.VERCEL_ENV === "preview" || process.env.FACTORY_FIXTURES === "1";
}

export class FixtureArticleNotFound extends Error {}

function copy<T>(value: T): T {
  if (!isFactoryFixtureMode()) throw new Error("Fixture data is disabled");
  return structuredClone(value);
}

function richText(content: string): RichTextItemResponse[] {
  return [{ type: "text", text: { content, link: null }, plain_text: content, href: null,
    annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }];
}

const posts: BlogPost[] = [
  { id: FIXTURE_BLOG_ID, title: "ファクトリー検証用の記事", date: DATE, tags: ["検証"], category: "テック", url: `/blog/${FIXTURE_BLOG_ID}` },
  { id: FIXTURE_RELATED_ID, title: "関連記事の表示確認", date: DATE, tags: ["検証"], category: "一般", url: `/blog/${FIXTURE_RELATED_ID}` },
];

export function getFixtureBlogPosts(): BlogPost[] { return copy(posts); }

export function getFixtureBlogPost(id: string): BlogPostDetail {
  const post = posts.find((item) => item.id === id);
  if (!post) throw new FixtureArticleNotFound("Fixture article not found");
  const page: PageObjectResponse = {
    object: "page", id, created_time: DATE, last_edited_time: DATE,
    created_by: USER, last_edited_by: USER, archived: false, in_trash: false,
    cover: null, icon: null, parent: { type: "database_id", database_id: FIXTURE_BLOG_ID },
    url: post.url, public_url: null,
    properties: {
      名前: { id: "title", type: "title", title: richText(post.title) },
      公開日: { id: "date", type: "date", date: { start: DATE, end: null, time_zone: null } },
      タグ: { id: "tags", type: "multi_select", multi_select: [{ id: "tag", name: "検証", color: "blue" }] },
      選択: { id: "category", type: "select", select: { id: "category", name: post.category, color: "blue" } },
      AI利用: { id: "ai", type: "checkbox", checkbox: false },
    },
  };
  const common = {
    object: "block", created_time: DATE, last_edited_time: DATE,
    created_by: USER, last_edited_by: USER, has_children: false, archived: false, in_trash: false,
    parent: { type: "page_id", page_id: id },
  } as const;
  const blocks: BlockWithChildren[] = [
    { ...common, id: "33333333-3333-4333-8333-333333333333", type: "paragraph",
      paragraph: { rich_text: richText("外部サービスに接続せず表示を確認できます。"), color: "default" } },
    { ...common, id: "44444444-4444-4444-8444-444444444444", type: "heading_2",
      heading_2: { rich_text: richText("検証のポイント"), color: "default", is_toggleable: false } },
    { ...common, id: "55555555-5555-4555-8555-555555555555", type: "bulleted_list_item",
      bulleted_list_item: { rich_text: richText("記事本文と関連記事が表示されます。"), color: "default" } },
  ];
  return copy({ page, blocks });
}

export function getFixtureRelatedArticles(id: string): BlogPost[] {
  return copy(posts.filter((post) => post.id !== id));
}

export function getFixtureBooks(): Book[] {
  return copy([{ id: "fixture-book", title: "検証用の技術書", author: "検証用著者", publisher: "検証出版",
    status: "読書中", category: "技術書", purchaseDate: "2026-01-01", finishDate: null,
    url: null, coverImageUrl: "/images/books/book1.jpg" }]);
}

export function getFixtureContents(): ContentEntry[] {
  return copy([{ id: "fixture-content", title: "検証用コンテンツ", url: null, imageUrl: "/images/gecko.png",
    media: "記事", date: "2026-01-01", body: "固定データでコンテンツ一覧を確認します。", pickup: false }]);
}

export function getFixtureBBSPosts() {
  return copy([{ id: 1, name: "検証用ユーザー", message: "検証用の掲示板です。", timestamp: "2026/1/1 9:00:00" }]);
}
