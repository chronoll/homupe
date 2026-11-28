# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

90年代レトロデザインのホームページ。ブログ（Notion連携）、本棚、コンテンツ一覧、掲示板、訪問者カウンターなどの機能を持つ。

- **Framework**: Next.js 16 (App Router) + TypeScript (strict)
- **UI**: Tailwind CSS v4 + Mantine UI + レトロ風カスタムCSS
- **Data**: Redis (訪問者数), Notion API (ブログ・本棚), ローカルJSON (掲示板)
- **Deploy**: Vercel

## Commands

```bash
npm run dev          # 開発サーバー（Turbopack）
npm run build        # 本番ビルド
npm run lint         # ESLint（警告なし）
npm run typecheck    # Next.js route 型生成 + TypeScript
npm test             # Jest テスト全実行
npm run check        # lint + typecheck + Jest CI
npm run build:fixtures # 外部接続なしの検証用ビルド
npm run test:e2e     # 1440px / 390px の Playwright 検証
```

PR前: `npm run check` と変更に関係する build / E2E を実行。
Node.js 22を使用。Previewは固定fixtureデータを使い、本番サービスへ接続しない。
手順・制約・Previewのコミット確認は `docs/factory-verification.md` を参照。

## Architecture

```
src/
├── app/           # App Router: pages, layouts, API routes (api/**/route.ts)
├── components/    # UIコンポーネント
└── lib/
    ├── types.ts           # 型定義集約（Book, YouTubeVideo 等）
    ├── notion.ts          # Notion API統合（ブログ・本棚取得、ISR対応）
    └── redis.ts           # Redis接続
data/              # ローカルJSON永続化（BBS投稿, 訪問者数）
```

### Key Patterns

- **Server Components**がデフォルト。Client Componentsは`'use client'`で明示
- **ISR**: ブログページは`revalidate: 900`（15分）で再検証
- **Suspense**でストリーミング対応（VisitorCounter, BBSBoard等）
- **React Compiler**有効（`reactCompiler: true`）で自動メモ化
- **Notion Block Renderer**: `NotionBlockRenderer.tsx`でNotionブロックを再帰的にレンダリング

## Coding Style

- 2スペースインデント、セミコロンあり、ダブルクォート
- コンポーネント: PascalCase、変数/関数: camelCase
- importは`@/`エイリアス（`./src/*`）を使用
- コミット: Conventional Commits (`feat:`, `fix:`, `refactor:`)

## Environment Variables

`.env.local`に設定（`.env.local.example`参照）:
- `REDIS_URL` - Redis接続URL
- `NOTION_API_KEY` - Notion APIキー
- `NOTION_DATABASE_ID` - NotionデータベースID
- `NOTION_BOOKS_DATABASE_ID` - Notion本棚DBのID

## Testing

- Jest + @testing-library/react (jsdom環境)
- テストファイル: `__tests__/*.test.tsx`
- 外部依存（Redis, Notion等）はモックして安定テスト
