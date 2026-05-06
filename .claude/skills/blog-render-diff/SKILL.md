---
name: blog-render-diff
description: Notion DB駆動の `/blog/[id]` ページがNotion本来のリッチコンテンツ（テーブル、ネストリスト、トグル中身、インデント、callout子要素、未対応ブロックタイプなど）を再現できているかを検証し、未対応箇所を修正項目リストとして出力するスキル。NotionページURLまたはhomupeのblog URL (/blog/[id]) を受け取り、Notion APIで取得した実ブロック構造と src/components/NotionBlockRenderer.tsx の実装を照合して差分を機械的に洗い出す。さらにplaywrightでblogページの実際のスクリーンショットも取得して視覚確認できるようにする。「blogの表示崩れ確認」「ブログレンダラの差分」「Notion再現性チェック」「リッチコンテンツが反映されてない」「この記事ちゃんと表示されてる？」「テーブル/トグル/インデントが消えてる」「Notionページとblog比較して」など、blogページのレンダリング品質確認・差分洗い出しのリクエストで積極的に発火すること。NotionBlockRenderer.tsxの改善作業の起点として使う。
---

# blog-render-diff

homupe `/blog/[id]` ページがNotionのリッチコンテンツをどこまで再現できているかを検証し、`src/components/NotionBlockRenderer.tsx` の改修項目を洗い出すスキル。

## 入力

ユーザーは以下のいずれかを渡してくる:

- NotionページURL: `https://www.notion.so/Title-1234abcd...`
- homupe blog URL: `http://localhost:<port>/blog/1234abcd...` または本番URL

どちらでも末尾の **32文字hex** または **UUID形式** を抽出してNotion page IDとして扱う。

## 処理フロー

順番に進める。各ステップで失敗したら次に進む前にユーザーに伝える。

### 0. 出力ファイルのスラッグ決定

複数回実行しても上書きされないように、各実行で一意のスラッグを作る。後段のレポート・スクリーンショットのファイル名に共通で使う:

```bash
SLUG="$(date +%Y%m%d-%H%M%S)-${PAGE_ID:0:8}"
# 例: 20260505-101920-356fe3f5
```

### 1. ページIDの抽出

URLから `[a-f0-9]{32}` または `[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}` を抽出する。両方マッチしうるので長い方（UUID形式）を優先。両方失敗したらユーザーにIDが見つからない旨を返す。

### 2. Notionブロックの再帰取得

プロジェクトルートで `scripts/fetch-notion-blocks.mjs` を実行:

```bash
mkdir -p /tmp/blog-render-diff
node .claude/skills/blog-render-diff/scripts/fetch-notion-blocks.mjs "$PAGE_ID" \
  > "/tmp/blog-render-diff/${SLUG}-blocks.json"
```

このスクリプトは:

- `.env.local` から `NOTION_API_KEY` を読み込む
- `notion.blocks.children.list` をページネーション（`has_more` / `next_cursor`）対応で全取得
- `has_children: true` のブロックは再帰的に子も取得して `block.children` に格納
- ページタイトルとブロックツリーをJSON出力

エラー時の対応:

- `NOTION_API_KEY` がない → ユーザーに `.env.local` の確認を促す
- `object_not_found` → Notion側で integration「Connections」にページが共有されていない。ユーザーに「対象ページの右上 ••• → Connections → integration 追加」を依頼する

**重要: APIキーをコマンドラインの環境変数 (`NOTION_API_KEY=... node ...`) で渡してはいけない**。shell history と process listing に平文で残るため、必ず `.env.local` を経由する。ユーザーがチャットに直接APIキーを貼ってきた場合も使い回さず、ローテートを推奨して `.env.local` に書いてもらう。

### 3. レンダリング対応状況の解析

```bash
node .claude/skills/blog-render-diff/scripts/analyze-render-coverage.mjs \
  "/tmp/blog-render-diff/${SLUG}-blocks.json" \
  > "/tmp/blog-render-diff/${SLUG}-report.md"
```

このスクリプトは:

- `src/components/NotionBlockRenderer.tsx` の switch文をパースして対応済みブロックタイプを動的抽出
- 各 case 節の本体を見て「再帰描画しているか（`<NotionBlockRenderer>` または `<BlockRenderer` を子に対して呼んでいるか）」を判定
- ブロックツリーを再帰走査して以下を検出:
  - **未対応ブロックタイプ**（switchのdefault: nullに落ちる）
  - **子ブロック未描画**（`has_children: true` だがrendererが children を描画していない）
  - **table の特別扱い**（現状ハードコードでプレースホルダ表示のみ）
  - **heading_*.is_toggleable**（heading内のトグル機能、現状未対応）
  - **annotations.color / block.<type>.color**（文字色・背景色マーカーの未対応）
  - **連続リストアイテムの個別`<List>`分割**
- 構造化Markdownレポートを出力

### 4. 視覚確認用のスクリーンショット取得

#### 4a. dev サーバーの実ポートを必ず検出する

**`localhost:3000` を仮定しない**。ユーザーは複数ローカルアプリを並行で起動しており、3000は別アプリの可能性が高い。プロセスから実ポートを検出する:

```bash
ps aux | grep -E "next dev|next-server" | grep -v grep
lsof -i -P -n 2>/dev/null | grep LISTEN | grep node
```

`ps` で `homupe/node_modules/.bin/next dev` のプロセスを特定し、同じユーザーで動いている `next-server` の listening ポートを `lsof` から拾う。複数のNext.jsが走っているときは作業ディレクトリ (`homupe`) のものを選ぶ。

サーバーが見つからなければユーザーに `npm run dev` の起動を依頼する。

#### 4b. スクリーンショット取得

```
mcp__playwright__browser_navigate
  → http://localhost:<実ポート>/blog/<pageId>
mcp__playwright__browser_take_screenshot
  → filename: .playwright-mcp/blog-render-diff-${SLUG}.png
  → fullPage: true
```

playwright MCP は `.playwright-mcp/` または プロジェクトルート以下にしか書けないので、`/tmp` 直下は指定しない。

`/blog/<id>` で 404 が返る場合、対象ページが blog DB (`NOTION_DATABASE_ID`) 配下でない可能性が高い。その旨をユーザーに伝え、視覚確認はスキップして静的解析の結果のみ提示する。

### 5. 修正項目リストの提示

`/tmp/blog-render-diff/${SLUG}-report.md` の中身を読み、ユーザーに以下を要約して提示する:

- ページのタイトルとブロック総数
- 検出された問題（Critical / Warning別）
- 修正の優先度
- 保存パス: レポート (`/tmp/blog-render-diff/${SLUG}-report.md`) と スクリーンショット (`.playwright-mcp/blog-render-diff-${SLUG}.png`)

ユーザーが「全件出して」と言ったら詳細を出す。デフォルトでは要約 + Criticalのみ列挙。

提示の最後に「次のアクション例」を1行添える。例:

> 次のアクション例: 「このレポートに沿って実装計画立てて」「Critical の table だけ直して」「優先度1から順に着手して」「再分析回して」

このスキル自体は分析と修正項目の洗い出しまでが責務。実装計画の作成や実コード修正は通常モード（Plan agent / Edit）に引き継ぐ。

## 設計方針

- **静的解析を優先**: rendererのswitchをパースして「対応リスト」を動的に取得することで、NotionBlockRendererが進化しても自動で追従する。固定リストをスキル内に持たない。
- **視覚確認は補助**: スクショは「最終的な見た目を人間が確認するため」に取得。プログラム的なpixel diffはしない。
- **誤検知を避ける**: 「has_children=trueなのに描画していない」判定は、rendererのコードを実際にパースして「再帰呼び出しがあるか」も確認する。
- **出力ファイルは一意**: 同じスキルを複数回呼んでも履歴が残るよう `${timestamp}-${pageIdShort}` のスラッグで命名する。

## 既知の限界

- Notion 公開 API では画像の表示幅・配置 (`block.image.width` 等) は提供されず、段落・heading の alignment も同様。ドラッグでリサイズ・中央寄せした画像/段落は API 経由では検出できないため、視覚確認で補う。
- `synced_block` の同期元解決は対応しない（同期先も同じrendererなので問題は別ページに転嫁される）。
- Notion 非公開ページの公式レンダリングとの直接視覚比較はしない（認証必要のため）。Notion APIから取得したブロック情報を「真実の値」として扱う。

## 参考

- `references/known-issues.md` — NotionBlockRenderer.tsx の現状分析（手動更新可能なメモ）
- `scripts/fetch-notion-blocks.mjs` — Notionブロック再帰取得スクリプト
- `scripts/analyze-render-coverage.mjs` — レンダリング対応状況解析スクリプト
