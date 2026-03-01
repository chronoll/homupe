# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

90年代レトロデザインのホームページ。ブログ（Notion連携）、タスク管理（Redis永続化）、掲示板、訪問者カウンターなどの機能を持つ。

- **Framework**: Next.js 16 (App Router) + TypeScript (strict)
- **UI**: Tailwind CSS v4 + Mantine UI + レトロ風カスタムCSS
- **Data**: Redis (タスク/カテゴリー/タイマー/訪問者数), Notion API (ブログ), ローカルJSON (掲示板)
- **Deploy**: Vercel

## Commands

```bash
npm run dev          # 開発サーバー（Turbopack）
npm run build        # 本番ビルド
npm run lint         # ESLint + TypeScript チェック
npm test             # Jest テスト全実行
npm test -- TaskCard.test.tsx  # 単一テスト実行
```

PR前: `npm run lint && npm test`

## Architecture

```
src/
├── app/           # App Router: pages, layouts, API routes (api/**/route.ts)
├── components/    # UIコンポーネント（テストは __tests__/ 配下）
└── lib/
    ├── types.ts           # 型定義集約（Task, Category, Timer, BlogPost）
    ├── notion.ts          # Notion API統合（ブログ取得、ISR対応）
    ├── redis.ts           # Redis接続
    ├── utils.ts           # バリデーション、フォーマット
    └── repositories/      # データ永続化層（taskRepository, categoryRepository, timerRepository）
data/              # ローカルJSON永続化（BBS投稿, 訪問者数）
```

### Key Patterns

- **Server Components**がデフォルト。Client Componentsは`'use client'`で明示
- **ISR**: ブログページは`revalidate: 900`（15分）で再検証
- **Suspense**でストリーミング対応（VisitorCounter, BBSBoard等）
- **React Compiler**有効（`reactCompiler: true`）で自動メモ化
- **リポジトリパターン**: `src/lib/repositories/`でRedisアクセスを抽象化
- **Notion Block Renderer**: `NotionBlockRenderer.tsx`でNotionブロックを再帰的にレンダリング

## Coding Style

- 2スペースインデント、セミコロンあり、ダブルクォート
- コンポーネント: PascalCase、変数/関数: camelCase
- importは`@/`エイリアス（`./src/*`）を使用
- コミット: Conventional Commits (`feat:`, `fix:`, `refactor:`)

## Environment Variables

`.env.local`に設定（`.env.local.example`参照）:
- `REDIS_URL` - Redis接続URL
- `TASKS_PASSWORD` - タスク管理の認証パスワード
- `NOTION_API_KEY` - Notion APIキー
- `NOTION_DATABASE_ID` - NotionデータベースID

## Testing

- Jest + @testing-library/react (jsdom環境)
- テストファイル: `__tests__/*.test.tsx`
- 外部依存（Redis, Notion等）はモックして安定テスト
