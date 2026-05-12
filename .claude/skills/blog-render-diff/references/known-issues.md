# NotionBlockRenderer.tsx 現状分析メモ

このファイルはスキル実行時に必要な背景情報。スクリプトで自動検出されるが、人間が読むときの参考用に残しておく。

## switchで対応している type

`paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list_item`,
`numbered_list_item`, `to_do`, `toggle`, `code`, `quote`, `divider`, `image`,
`video`, `bookmark`, `link_preview`, `embed`, `table`, `callout`

## 既知の問題（2026-05-04時点）

### 1. table がプレースホルダ表示

```tsx
case 'table':
  // Tableブロックは子ブロックを別途取得する必要があるため、
  // ここでは簡易的な実装とする
  return (
    <Box ...>
      <Text c="dimmed" size="sm">テーブルコンテンツは別途取得が必要です</Text>
    </Box>
  );
```

→ table_row の cells を取得・描画する実装が必要

### 2. 子ブロックの再帰描画が全くない

`toggle` / `callout` / `bulleted_list_item` / `numbered_list_item` / `to_do` /
`quote` / `paragraph` は Notion 上で `has_children: true` になりうるが、
rendererは children を一切描画しない。

特に問題が大きいのは:
- **toggle**: 開いたときの中身が完全に消える
- **callout**: callout内のリスト・補足が消える
- **list_item**: ネストリストが平坦化

→ 親rendererでchildrenを `<NotionBlockRenderer blocks={block.children}>` 的に
再帰描画する設計に変える必要がある

### 3. 連続リストアイテムが分割される

```tsx
case 'bulleted_list_item':
  return (
    <List type="unordered" mb="xs">
      <List.Item>...</List.Item>
    </List>
  );
```

各アイテムごとに `<List>` でラップしているため、連続したリストが
個別の `<ul>` として描画される。HTML的にも見た目的にも不自然。

→ 上位の走査ロジックで連続アイテムをグループ化する

### 4. heading_*.is_toggleable 未対応

Notion の見出しはトグル化できる（中身を持つ）が、rendererはこれを無視する。

### 5. ページネーション未対応 (`src/lib/notion.ts`)

`getBlogPost` が `page_size: 100` のみで `has_more` を見ていない。
100ブロック超の記事で末尾が切れる。

### 6. annotations.color が未対応

`RichTextRenderer` は bold / italic / strike / underline / code / href のみ。
Notionの文字色・背景色は反映されない。

### 7. 未対応ブロックタイプ

おそらく未対応:
- `column_list` / `column` (Notionの2カラムレイアウト)
- `synced_block`
- `child_page` / `child_database`
- `equation`
- `file` / `pdf` / `audio`
- `table_of_contents`
- `breadcrumb`
- `link_to_page`
