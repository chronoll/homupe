# Notion「📚 本棚」データベース スキーマ定義

## 概要

- **DB名**: 📚 本棚
- **Database ID**: `315fe3f55f9a80b1b0cbedd2cc21e016`
- **Data Source ID**: `315fe3f5-5f9a-8069-8d84-000b2fd7c3c0`
- **用途**: 読書記録の管理。`/books` ページへの同期元データ。

## プロパティ一覧

| プロパティ名 | 型 | 説明 |
|---|---|---|
| タイトル | `title` | 本のタイトル（主キー） |
| 著者 | `text` | 著者名 |
| 出版社 | `text` | 出版社名 |
| ステータス | `status` | 読書状態（下記参照） |
| 選択 | `select` | カテゴリ分類（下記参照） |
| 購入日 | `date` | 購入日 |
| 読了日 | `date` | 読み終えた日 |
| URL | `url` | 本のリンク（Amazon等） |
| 🎆 blog | `relation` | ブログ記事DBとのリレーション |
| 本棚とのリレーション | `relation` | 自己リレーション（シリーズ等の紐付け用） |
| 数 | `formula` | 計算式（自動算出） |

### ページレベルのメタデータ（プロパティ外）

| フィールド | 取得方法 | 説明 |
|---|---|---|
| カバー画像 | `page.cover` | ページヘッダーに設定された画像（ギャラリービューのサムネイルにも使用） |

#### カバー画像の取得

`@notionhq/client` の `PageObjectResponse` に含まれる `cover` フィールドから取得可能。
DBスキーマのプロパティではなく、ページオブジェクト自体のメタデータとして返される。

```typescript
// page.cover の構造（2パターン）
if (page.cover?.type === "external") {
  // 外部URL — 永続的に有効
  const url = page.cover.external.url;
} else if (page.cover?.type === "file") {
  // Notion内部ファイル — 署名付きS3 URLで約1時間で失効
  const url = page.cover.file.url;
  const expiry = page.cover.file.expiry_time;
}
// page.cover が null の場合はカバー画像未設定
```

**注意事項:**
- `type: "external"` — 外部URLを直接参照。永続的に使える
- `type: "file"` — Notionにアップロードされた画像。一時的な署名付きURLのため約1時間で失効する
- ISR（`revalidate: 900` = 15分）で定期再取得すれば `file` タイプでも実用上問題ない
- MCP Notionツール（`notion-fetch`）ではカバー情報は返らない。`@notionhq/client` SDK経由で取得する必要がある

## ステータス（status型）の選択肢

| 値 | グループ | 色 |
|---|---|---|
| 未読 | to_do | デフォルト |
| 読書中 | in_progress | blue |
| 読了 | complete | green |

## 選択（select型）の選択肢

| 値 | 色 |
|---|---|
| 一般 | green |
| 技術書 | yellow |

## ビュー

| ビュー | タイプ | 表示プロパティ |
|---|---|---|
| ギャラリー | gallery | タイトル（カバー画像付き） |
| テーブル | table | 全プロパティ |

## リレーション先DB

- **🎆 blog** → `collection://253fe3f5-5f9a-807e-a3f1-000b793d47a2`（既存のブログ記事DB）
- **本棚とのリレーション** → 自分自身（自己参照リレーション）

## `/books` ページ同期時の設計メモ

### 現状との差分

現在の `/books` ページ（`src/app/books/page.tsx`）はハードコードされたデータを使用。
Notion DB には現在のページにない以下のフィールドが存在する:

- `出版社` — 現在未使用
- `ステータス`（未読/読書中/読了）— 現在は読了のみ表示
- `選択`（一般/技術書）— カテゴリ分けが可能
- `購入日` — 現在未使用
- `URL` — 書籍リンク（表紙画像URL等に活用可能）
- `🎆 blog` — 関連ブログ記事へのリンクが可能

### 既存ブログとの連携パターン参照

ブログ記事の Notion 連携は `src/lib/notion.ts` に実装済み。同様のパターンで書籍データ取得関数を追加可能。

```
環境変数（追加が必要）:
  NOTION_BOOKS_DATABASE_ID=315fe3f55f9a80b1b0cbedd2cc21e016
```
