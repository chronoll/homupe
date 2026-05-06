#!/usr/bin/env node
/**
 * Notion ブロックツリーを NotionBlockRenderer.tsx と照合し、
 * 未対応箇所を Markdown レポートとして出力する
 *
 * Usage:
 *   node analyze-render-coverage.mjs <blocks-json-path> [<renderer-path>]
 *
 * デフォルトの renderer-path:
 *   src/components/NotionBlockRenderer.tsx (CWDからの相対)
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function parseRendererCoverage(source) {
  const switchMatch = source.match(
    /switch\s*\(\s*block\.type\s*\)\s*\{([\s\S]+)\n\s*\}\s*\n\}/,
  );
  if (!switchMatch) {
    throw new Error(
      "switch(block.type) ブロックが NotionBlockRenderer.tsx で見つからない",
    );
  }
  const switchBody = switchMatch[1];

  // 各 case を抽出
  const caseRegex =
    /case\s+['"]([^'"]+)['"]\s*:([\s\S]*?)(?=\n\s*case\s+['"]|\n\s*default\s*:|\n\s*\}\s*$)/g;
  const cases = new Map();
  let m;
  while ((m = caseRegex.exec(switchBody)) !== null) {
    const [, type, body] = m;
    cases.set(type, body);
  }

  // case 本体に再帰描画があるか判定するヒューリスティック
  // 1. <NotionBlockRenderer ... blocks={...}/> を呼んでいる
  // 2. <BlockRenderer ... block={...}/> を呼んでいる
  // 3. block.children を参照している（任意のhelper/コンポーネント経由でも検出する）
  const descendsInto = (body) => {
    if (/<NotionBlockRenderer[\s\S]*?blocks\s*=/.test(body)) return true;
    if (/<BlockRenderer[\s\S]*?block\s*=/.test(body)) return true;
    if (/block\.children/.test(body)) return true;
    return false;
  };

  const handled = new Map();
  for (const [type, body] of cases) {
    handled.set(type, {
      supported: true,
      descendsIntoChildren: descendsInto(body),
      body,
    });
  }

  return handled;
}

function describeChildrenImpact(type) {
  switch (type) {
    case "toggle":
      return "トグルを開いたときの中身が消える";
    case "callout":
      return "callout内の補足テキスト・リスト等が消える";
    case "bulleted_list_item":
    case "numbered_list_item":
      return "ネストしたリストアイテムが消える";
    case "to_do":
      return "ToDoのサブアイテムが消える";
    case "quote":
      return "引用内のネストブロックが消える";
    case "column_list":
    case "column":
      return "カラムレイアウトの中身が消える";
    case "paragraph":
      return "段落のインデント（子ブロック）が消える";
    case "synced_block":
      return "同期ブロックの内容が表示されない";
    case "table":
      return "table_row（行・セル）が描画されない";
    default:
      return "子ブロックの内容が表示されない";
  }
}

function main() {
  const blocksPath = process.argv[2];
  const rendererPath =
    process.argv[3] ||
    resolve(process.cwd(), "src/components/NotionBlockRenderer.tsx");

  if (!blocksPath) {
    process.stderr.write(
      "Usage: node analyze-render-coverage.mjs <blocks-json-path> [<renderer-path>]\n",
    );
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(blocksPath, "utf-8"));
  const rendererSource = readFileSync(rendererPath, "utf-8");
  const handled = parseRendererCoverage(rendererSource);

  // table case のプレースホルダ判定（特別扱い）
  const tableCaseBody = handled.get("table")?.body || "";
  const tableIsPlaceholder = /テーブルコンテンツは別途取得が必要/.test(
    tableCaseBody,
  );

  // RichTextRenderer / Renderer が annotations.color と block-level color を扱っているか判定
  // （helper関数経由 / マッピング定数経由でも検出する）
  const richTextRendererSection =
    rendererSource.match(/function\s+RichTextRenderer[\s\S]+?\n\}/)?.[0] || "";
  const hasColorMapping =
    /NOTION_(TEXT_|BG_)?COLOR_MAP/i.test(rendererSource) ||
    /colorToStyle\s*\(/.test(rendererSource);
  const supportsTextColor =
    /annotations\?\.color/.test(richTextRendererSection) ||
    /annotations\.color/.test(richTextRendererSection) ||
    (hasColorMapping &&
      /annotations[\s\S]*?\.color/.test(rendererSource));
  const supportsBlockColor =
    /\b\w+\.color\b[\s\S]{0,80}!==\s*['"]default['"]/.test(rendererSource) ||
    hasColorMapping;

  // NotionBlockRenderer のトップレベル走査関数本体を抽出（list_item の特別処理を判定するため）
  const wrapperBody =
    rendererSource.match(
      /export\s+default\s+function\s+NotionBlockRenderer[\s\S]+?\n\}/,
    )?.[0] || "";
  // 連続リストアイテムをグループ化する処理が走査ループ内に書かれているか
  // ヒューリスティック:
  //   - while/for ループ内で list_item の連続を見ているか
  //   - <ul>/<ol> または <List> で複数 item をまとめて出力する別コンポーネント (例: ListGroup) を呼んでいるか
  const groupsListItems =
    /<ListGroup\b/.test(rendererSource) ||
    (/(while|for)\s*\([\s\S]*?\)/.test(wrapperBody) &&
      /(bulleted_list_item|numbered_list_item)/.test(wrapperBody));
  // list_item の children を外部処理で扱っているか
  // (case body は return null; だが ListGroup などで item.children を再帰描画している場合)
  const handlesListItemChildrenExternally =
    groupsListItems &&
    /(item|child|li)\.children/.test(rendererSource);

  // caption をサポートする可能性のあるブロックタイプ
  const CAPTIONABLE_TYPES = ["image", "video", "code", "bookmark", "embed"];
  const captionHandled = {};
  for (const type of CAPTIONABLE_TYPES) {
    const body = handled.get(type)?.body || "";
    captionHandled[type] = /\.caption\b/.test(body);
  }

  // ブロック種別ごとの「対応の最低基準」チェック
  // 「switch case がある = ✅」では足りないため、case body の中身を見て
  // Notion 本来の表現を再現する最低限の構造があるかをヒューリスティックで判定する。
  // 失敗しても false positive リスクは低くないので Warning(品質)として軽めに報告する。
  // 注意: pattern は case body 全文に対する正規表現。
  // body には `block.<type>.url` 等が必ず含まれるため、type名と被るキーワード(例: link_preview に含まれる "preview")を避けて
  // 「明示的なカード/埋め込み描画コンポーネント or 取得関数」のシグナルだけを拾う。
  const QUALITY_CHECKS = {
    link_preview: {
      description:
        "OGP / GitHub permalink / 埋め込みプレビュー (Notion はカード表示するが、URL文字列のみのレンダリングだとプレビューカードが再現できていない)",
      pattern: (body) =>
        /<iframe\b/.test(body) ||
        /<(img|Image)\b/.test(body) ||
        /\b(getOgp|fetchOgp|fetchMetadata|opengraph|og:image|og:title)\b/i.test(body) ||
        /<\w*(LinkCard|OgpCard|PermalinkCard)\b/.test(body),
      hint:
        "OGP取得API or Server Component でURLをカード化する。GitHub permalink は line range のコード抽出 + syntax highlight があるとさらに再現度が上がる。",
    },
    bookmark: {
      description:
        "サムネイル / タイトル / 説明文 (Notion はリンクカード表示するが、URL のみだと再現不足)",
      pattern: (body) =>
        /<(img|Image)\b/.test(body) ||
        /\b(getOgp|fetchOgp|fetchMetadata|opengraph|og:image|og:title)\b/i.test(body) ||
        /<\w*(BookmarkCard|LinkCard|OgpCard)\b/.test(body),
      hint: "OGP fetch でtitle/description/imageを取得してカード化する。",
    },
    embed: {
      description: "実際の埋め込み (iframe / oEmbed) — URL文字列だけでは埋め込みにならない",
      pattern: (body) => /<iframe\b/.test(body) || /<\w*Embed\w*\b/.test(body),
      hint: "Tweet / YouTube / Figma 等は iframe 埋め込み or 専用ライブラリ (react-tweet 等) を使う。",
    },
    image: {
      description: "幅制御 (max-width / maw 等) — 巨大画像を本文枠内に収める",
      pattern: (body) =>
        /\b(maw|maxWidth|max-width)\b/.test(body),
      hint: "<Image maw=\"100%\"> 等で本文幅を超えないようにする。",
    },
  };
  const qualityIssues = new Map(); // type → { description, hint, blockIds }
  for (const [type, check] of Object.entries(QUALITY_CHECKS)) {
    const body = handled.get(type)?.body;
    if (body && !check.pattern(body)) {
      qualityIssues.set(type, { ...check, blockIds: [] });
    }
  }

  // 1パス目: 走査して問題を集める
  const findings = {
    unsupportedTypes: new Map(),
    childrenIgnored: new Map(),
    tablePlaceholder: [],
    toggleableHeadings: [],
    sequentialListSplit: 0,
    textColors: new Set(),       // annotations.color の使用色
    textColorBlockIds: new Set(),
    blockColors: new Set(),      // block.<type>.color の使用色
    blockColorBlockIds: new Set(),
    captionMissing: new Map(),   // type → [{id, captionText}]
  };

  const allBlocksFlat = [];
  const walk = (blocks, depth = 0) => {
    let prevType = null;
    for (const b of blocks) {
      allBlocksFlat.push({ type: b.type, id: b.id, depth, has_children: !!b.has_children });

      // 1. 未対応ブロックタイプ
      if (!handled.has(b.type)) {
        if (!findings.unsupportedTypes.has(b.type)) {
          findings.unsupportedTypes.set(b.type, []);
        }
        findings.unsupportedTypes.get(b.type).push(b.id);
      }

      // 2. table の特別扱い
      if (b.type === "table" && tableIsPlaceholder) {
        findings.tablePlaceholder.push(b.id);
      }

      // 3. has_children: true だが renderer が再帰描画しない
      //   除外:
      //   - table (別カテゴリで報告)
      //   - list_item (case body は return null; でも外部の ListGroup 等で children処理されている場合)
      const listItemExternallyOk =
        (b.type === "bulleted_list_item" || b.type === "numbered_list_item") &&
        handlesListItemChildrenExternally;
      if (
        b.has_children &&
        handled.has(b.type) &&
        !handled.get(b.type).descendsIntoChildren &&
        b.type !== "table" &&
        !listItemExternallyOk
      ) {
        if (!findings.childrenIgnored.has(b.type)) {
          findings.childrenIgnored.set(b.type, []);
        }
        findings.childrenIgnored.get(b.type).push(b.id);
      }

      // 4. heading_*.is_toggleable
      if (["heading_1", "heading_2", "heading_3"].includes(b.type)) {
        const v = b[b.type];
        if (v?.is_toggleable) {
          findings.toggleableHeadings.push({ id: b.id, type: b.type });
        }
      }

      // 5. 連続リストアイテムが個別<List>で分割される問題（Renderer設計上の問題）
      // ただし Renderer 側で連続グループ化していると判定できた場合は誤検出になるのでスキップ
      if (
        !groupsListItems &&
        (b.type === "bulleted_list_item" || b.type === "numbered_list_item") &&
        prevType === b.type
      ) {
        findings.sequentialListSplit++;
      }
      prevType = b.type;

      // 6.5. 品質チェック: 「対応はしているが見た目が貧弱」なブロックの該当ID集計
      if (qualityIssues.has(b.type)) {
        qualityIssues.get(b.type).blockIds.push(b.id);
      }

      // 7. caption の未対応（image/video/code/bookmark/embed）
      if (CAPTIONABLE_TYPES.includes(b.type) && !captionHandled[b.type]) {
        const cap = b[b.type]?.caption;
        if (Array.isArray(cap) && cap.length > 0) {
          const text = cap.map((c) => c.plain_text || "").join("");
          if (text.trim().length > 0) {
            if (!findings.captionMissing.has(b.type)) {
              findings.captionMissing.set(b.type, []);
            }
            findings.captionMissing.get(b.type).push({ id: b.id, text });
          }
        }
      }

      // 6. 色 (annotations.color / block-level color)
      const blockData = b[b.type];
      if (blockData?.color && blockData.color !== "default") {
        findings.blockColors.add(blockData.color);
        findings.blockColorBlockIds.add(b.id);
      }
      const richTextArrays = [];
      if (Array.isArray(blockData?.rich_text))
        richTextArrays.push(blockData.rich_text);
      if (Array.isArray(blockData?.caption))
        richTextArrays.push(blockData.caption);
      if (b.type === "table_row" && Array.isArray(b.table_row?.cells)) {
        for (const cell of b.table_row.cells) {
          if (Array.isArray(cell)) richTextArrays.push(cell);
        }
      }
      for (const arr of richTextArrays) {
        for (const rt of arr) {
          const c = rt?.annotations?.color;
          if (c && c !== "default") {
            findings.textColors.add(c);
            findings.textColorBlockIds.add(b.id);
          }
        }
      }

      if (b.children?.length) {
        walk(b.children, depth + 1);
      }
    }
  };

  walk(data.blocks);

  // レポート出力
  const lines = [];
  lines.push(`# Blog Render Diff Report`);
  lines.push("");
  lines.push(`- **Title**: ${data.title}`);
  lines.push(`- **Page ID**: \`${data.pageId}\``);
  lines.push(`- **Total blocks (flatten)**: ${allBlocksFlat.length}`);
  lines.push("");

  // ブロックタイプ別サマリ
  const counts = {};
  for (const b of allBlocksFlat) {
    counts[b.type] = (counts[b.type] || 0) + 1;
  }
  lines.push(`## ブロックタイプ別サマリ`);
  lines.push("");
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [type, n] of sorted) {
    let mark;
    const listItemHandledOk =
      (type === "bulleted_list_item" || type === "numbered_list_item") &&
      handlesListItemChildrenExternally;
    const hasQualityIssue =
      qualityIssues.has(type) && qualityIssues.get(type).blockIds.length > 0;
    if (!handled.has(type)) mark = "❌ 未対応";
    else if (type === "table" && tableIsPlaceholder) mark = "⚠️  プレースホルダ";
    else if (hasQualityIssue) mark = "⚠️  実装が貧弱";
    else if (handled.get(type).descendsIntoChildren || listItemHandledOk)
      mark = "✅";
    else if (allBlocksFlat.some((b) => b.type === type && b.has_children))
      mark = "⚠️  children未描画";
    else mark = "✅";
    lines.push(`- ${mark} \`${type}\` × ${n}`);
  }
  lines.push("");

  // 検出された問題
  lines.push(`## 検出された問題`);
  lines.push("");

  let hasCritical = false;
  let hasWarning = false;

  // Critical: table プレースホルダ
  if (findings.tablePlaceholder.length > 0) {
    hasCritical = true;
    lines.push(`### Critical: tableが空プレースホルダ表示`);
    lines.push("");
    lines.push(
      `現在のNotionBlockRenderer.tsxは \`table\` ブロックの中身（行・セル）を取得・描画せず、「テーブルコンテンツは別途取得が必要です」というメッセージのみ表示している。`,
    );
    lines.push("");
    lines.push(`該当: ${findings.tablePlaceholder.length} 件`);
    for (const id of findings.tablePlaceholder.slice(0, 5)) {
      lines.push(`- \`${id}\``);
    }
    if (findings.tablePlaceholder.length > 5) {
      lines.push(`- ...他 ${findings.tablePlaceholder.length - 5} 件`);
    }
    lines.push("");
    lines.push(
      `**修正方針**: 親rendererから \`block.children\` を渡せるようにし、\`table_row\` ブロックの \`cells\` (RichText配列の配列) を描画する。\`block.table.has_column_header\` / \`has_row_header\` も尊重する。`,
    );
    lines.push("");
  }

  // Critical: 未対応ブロックタイプ
  if (findings.unsupportedTypes.size > 0) {
    hasCritical = true;
    lines.push(`### Critical: 未対応ブロックタイプ`);
    lines.push("");
    lines.push(`switchのdefault節に落ちて何も表示されないブロック:`);
    lines.push("");
    for (const [type, ids] of findings.unsupportedTypes) {
      lines.push(`- **\`${type}\`** × ${ids.length} 件`);
      for (const id of ids.slice(0, 3)) lines.push(`  - \`${id}\``);
      if (ids.length > 3) lines.push(`  - ...他 ${ids.length - 3} 件`);
    }
    lines.push("");
  }

  // Warning: children未描画
  if (findings.childrenIgnored.size > 0) {
    hasWarning = true;
    lines.push(`### Warning: 子ブロックが描画されていない`);
    lines.push("");
    lines.push(
      `\`has_children: true\` だが、rendererが子ブロックを再帰描画していない:`,
    );
    lines.push("");
    for (const [type, ids] of findings.childrenIgnored) {
      lines.push(
        `- **\`${type}\`** × ${ids.length} 件 — ${describeChildrenImpact(type)}`,
      );
      for (const id of ids.slice(0, 3)) lines.push(`  - \`${id}\``);
      if (ids.length > 3) lines.push(`  - ...他 ${ids.length - 3} 件`);
    }
    lines.push("");
  }

  // Warning: ブロックの実装が貧弱で Notion 本来の見た目を再現していない
  const activeQualityIssues = [...qualityIssues.entries()].filter(
    ([, info]) => info.blockIds.length > 0,
  );
  if (activeQualityIssues.length > 0) {
    hasWarning = true;
    lines.push(`### Warning: ブロックの実装が貧弱で Notion 本来の見た目を再現していない`);
    lines.push("");
    lines.push(
      `switch case は存在するが、case body の中身が最低限で Notion 上で見るのと比べて視覚的な情報が大きく欠落している:`,
    );
    lines.push("");
    for (const [type, info] of activeQualityIssues) {
      lines.push(`- **\`${type}\`** × ${info.blockIds.length} 件`);
      lines.push(`  - 不足: ${info.description}`);
      for (const id of info.blockIds.slice(0, 3)) {
        lines.push(`  - \`${id}\``);
      }
      if (info.blockIds.length > 3) {
        lines.push(`  - ...他 ${info.blockIds.length - 3} 件`);
      }
      lines.push(`  - **修正方針**: ${info.hint}`);
    }
    lines.push("");
    lines.push(
      `※ これはヒューリスティックによる検出で、判定基準は \`analyze-render-coverage.mjs\` 内の \`QUALITY_CHECKS\` で定義。本来は実画面と Notion 公式表示の視覚比較が望ましい（このスキル単体では限界がある）。`,
    );
    lines.push("");
  }

  // Warning: caption が描画されていないメディアブロック
  if (findings.captionMissing.size > 0) {
    hasWarning = true;
    lines.push(`### Warning: メディアブロックの caption が描画されていない`);
    lines.push("");
    lines.push(
      `Notion 側でブロック (image / video / code / bookmark / embed) にキャプションを設定しているのに、renderer が caption を読んでいないため画面に出ない。`,
    );
    lines.push("");
    for (const [type, items] of findings.captionMissing) {
      lines.push(`- **\`${type}\`** × ${items.length} 件`);
      for (const it of items.slice(0, 3)) {
        const preview =
          it.text.length > 40 ? it.text.slice(0, 40) + "…" : it.text;
        lines.push(`  - \`${it.id}\` — "${preview}"`);
      }
      if (items.length > 3) lines.push(`  - ...他 ${items.length - 3} 件`);
    }
    lines.push("");
    lines.push(
      `**修正方針**: 各 case で \`block.<type>.caption\` (RichText[]) を読み、空でなければ \`<RichTextRenderer richText={...}>\` で描画する。image / bookmark の case が既存の参考実装。`,
    );
    lines.push("");
  }

  // Warning: トグル付き見出し
  if (findings.toggleableHeadings.length > 0) {
    hasWarning = true;
    lines.push(`### Warning: トグル付き見出しが通常見出しとして描画されている`);
    lines.push("");
    lines.push(
      `\`is_toggleable: true\` の見出しは現状通常の見出しとして描画され、トグル機能と中身が失われる。`,
    );
    for (const { id, type } of findings.toggleableHeadings) {
      lines.push(`- \`${type}\` (\`${id}\`)`);
    }
    lines.push("");
  }

  // Warning: 連続リスト分割
  if (findings.sequentialListSplit > 0) {
    hasWarning = true;
    lines.push(`### Warning: 連続リストアイテムが個別の <List> で分割される`);
    lines.push("");
    lines.push(
      `現状のrendererは \`bulleted_list_item\` / \`numbered_list_item\` を1ブロックずつ別々の \`<List>\` でラップしているため、HTML上で \`<ul>\` / \`<ol>\` が連続して並び、間隔やスタイルが不自然になる可能性がある。`,
    );
    lines.push(
      `連続して隣接しているリストアイテムは ${findings.sequentialListSplit} 箇所検出。`,
    );
    lines.push("");
    lines.push(
      `**修正方針**: \`NotionBlockRenderer\` でブロック配列を走査するときに連続するリストアイテムをグループ化して1つの \`<List>\` にまとめる。`,
    );
    lines.push("");
  }

  // Warning: 文字色 / 背景色（マーカー）が反映されていない
  const hasTextColor = findings.textColors.size > 0 && !supportsTextColor;
  const hasBlockColor = findings.blockColors.size > 0 && !supportsBlockColor;
  if (hasTextColor || hasBlockColor) {
    hasWarning = true;
    lines.push(`### Warning: 文字色・背景色（Notionの太字背景マーカー含む）が反映されていない`);
    lines.push("");
    lines.push(
      `Notion の \`annotations.color\` / ブロック単位の \`color\` は、\`gray\`・\`red\` などの文字色と、\`yellow_background\`・\`blue_background\` などの背景色（太字マーカー的な見た目）を表す。NotionBlockRenderer はこれらを参照していないため、色付けされたテキストやマーカーが平文として描画される。`,
    );
    lines.push("");
    if (hasTextColor) {
      lines.push(
        `- **annotations.color**: \`${[...findings.textColors].sort().join("`, `")}\` を使用（${findings.textColorBlockIds.size} ブロックに影響）`,
      );
    }
    if (hasBlockColor) {
      lines.push(
        `- **block.<type>.color**: \`${[...findings.blockColors].sort().join("`, `")}\` を使用（${findings.blockColorBlockIds.size} ブロックに影響）`,
      );
    }
    lines.push("");
    lines.push(
      `**修正方針**: \`RichTextRenderer\` で \`text.annotations.color\` を CSS の \`color\` / \`background-color\` にマッピング（\`*_background\` は背景色、それ以外は文字色）。各ブロックの case 内では \`block.<type>.color\` を読んでラッパー要素にも同様に適用する。Notion の標準色 9 色 × {文字色, 背景色} のマッピングテーブルを1つ用意して使い回すのが楽。`,
    );
    lines.push("");
  }

  if (!hasCritical && !hasWarning) {
    lines.push(`このページでは特に問題は検出されなかった。`);
    lines.push("");
  }

  // 全ページ共通の既知の限界
  lines.push(`## このスキルでは検出できない既知の問題`);
  lines.push("");
  lines.push(
    `- **ページネーション**: \`getBlogPost\` が \`page_size: 100\` のみで \`has_more\` 未対応のため、100ブロック超の記事で末尾が切れる可能性がある (\`src/lib/notion.ts\` 参照)。`,
  );
  lines.push(
    `- **画像の表示幅・配置**: Notion 公開 API は \`block.image\` に width / alignment フィールドを返さない。Notion 上で「左寄せ・中央寄せ」「ドラッグでリサイズした幅」を指定しても API では取得できないため、機械的な検出は不可能。視覚比較で確認するしかない。`,
  );
  lines.push(
    `- **段落・heading の alignment**: 同様に、ブロック単位の左/中央/右寄せは公開 API のスキーマに含まれない。`,
  );
  lines.push("");

  // 修正の優先度
  lines.push(`## 修正の優先度（このページで検出された範囲）`);
  lines.push("");
  const priorities = [];
  if (findings.tablePlaceholder.length > 0) {
    priorities.push(
      "**table の中身レンダリング** — `table_row` を子ブロックとして取得し、セル描画を行う",
    );
  }
  if (findings.childrenIgnored.has("toggle")) {
    priorities.push(
      "**toggle の子ブロック再帰描画** — 現状はsummary行のみ表示で中身が見えない",
    );
  }
  if (
    findings.childrenIgnored.has("bulleted_list_item") ||
    findings.childrenIgnored.has("numbered_list_item")
  ) {
    priorities.push(
      "**ネストリスト対応** — リストアイテムの子ブロックが平坦化されている",
    );
  }
  if (findings.childrenIgnored.has("callout")) {
    priorities.push("**callout の子要素描画**");
  }
  if (findings.childrenIgnored.has("paragraph")) {
    priorities.push("**段落のインデント対応** — paragraphの子ブロックが消える");
  }
  if (findings.unsupportedTypes.size > 0) {
    priorities.push(
      `**未対応ブロックタイプの追加** (${[...findings.unsupportedTypes.keys()].join(", ")})`,
    );
  }
  if (findings.sequentialListSplit > 0) {
    priorities.push(
      "**連続リストの<ul>/<ol>統合** — 個別<List>ラップを解消",
    );
  }
  if (hasTextColor || hasBlockColor) {
    priorities.push(
      "**文字色・背景色（マーカー）対応** — `annotations.color` と `block.<type>.color` を CSS にマッピング",
    );
  }
  if (findings.captionMissing.size > 0) {
    priorities.push(
      `**caption 描画対応** (${[...findings.captionMissing.keys()].join(", ")}) — \`block.<type>.caption\` の RichText 配列を描画する`,
    );
  }
  if (activeQualityIssues.length > 0) {
    const types = activeQualityIssues.map(([t]) => t).join(", ");
    priorities.push(
      `**ブロック実装の品質強化** (${types}) — Notion 本来の見た目（OGP/プレビュー/iframe等）を再現する`,
    );
  }
  if (priorities.length === 0) {
    lines.push("（このページから抽出された修正項目はなし）");
  } else {
    priorities.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  }
  lines.push("");

  process.stdout.write(lines.join("\n"));
}

main();
