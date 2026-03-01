"use client";

import { useState } from "react";
import { Tabs, Modal, Text, Badge, Group, Stack, Button } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import type { Book, BookCategory } from "@/lib/types";

interface BookShelfProps {
  books: Book[];
}

const BOOK_W = 100;
const BOOK_H = 148;
const SHELF_GAP = 34; // row-gap: 棚板 + 余白
const PERIOD = BOOK_H + SHELF_GAP; // グリッド1行分の周期

// 棚板を背景グラデーションで描画（行の折り返しに自動対応）
const shelfBackground = `repeating-linear-gradient(
  to bottom,
  transparent 0px,
  transparent ${BOOK_H}px,
  #6B3410 ${BOOK_H}px,
  #A0522D ${BOOK_H + 2}px,
  #CD853F ${BOOK_H + 10}px,
  #A0522D ${BOOK_H + 18}px,
  #5C2E0A ${BOOK_H + 22}px,
  rgba(0,0,0,0.12) ${BOOK_H + 22}px,
  rgba(0,0,0,0.03) ${BOOK_H + 28}px,
  transparent ${BOOK_H + 30}px,
  transparent ${PERIOD}px
)`;

const STATUS_BADGE_COLOR: Record<string, string> = {
  "未読": "gray",
  "読書中": "blue",
  "読了": "green",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

function BookCover({ book, onClick }: { book: Book; onClick: () => void }) {
  if (book.coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={book.coverImageUrl}
        alt={book.title}
        onClick={onClick}
        style={{
          width: 100,
          height: 148,
          objectFit: "cover",
          borderRadius: "2px",
          boxShadow: "2px 2px 8px rgba(0,0,0,0.4), -1px 0 2px rgba(0,0,0,0.15)",
          cursor: "pointer",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-10px) scale(1.05)";
          e.currentTarget.style.boxShadow = "4px 8px 16px rgba(0,0,0,0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0) scale(1)";
          e.currentTarget.style.boxShadow = "2px 2px 8px rgba(0,0,0,0.4), -1px 0 2px rgba(0,0,0,0.15)";
        }}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        width: 100,
        height: 148,
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: "2px",
        boxShadow: "2px 2px 8px rgba(0,0,0,0.4), -1px 0 2px rgba(0,0,0,0.15)",
        cursor: "pointer",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px",
        color: "white",
        fontSize: "11px",
        textAlign: "center",
        lineHeight: 1.3,
        wordBreak: "break-word",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-10px) scale(1.05)";
        e.currentTarget.style.boxShadow = "4px 8px 16px rgba(0,0,0,0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = "2px 2px 8px rgba(0,0,0,0.4), -1px 0 2px rgba(0,0,0,0.15)";
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{book.title}</div>
      <div style={{ fontSize: "9px", opacity: 0.8 }}>{book.author}</div>
    </div>
  );
}

function ShelfSection({ books, onBookClick }: { books: Book[]; onBookClick: (b: Book) => void }) {
  if (books.length === 0) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: BOOK_H,
            padding: "20px 24px",
          }}
        >
          <Text size="sm" c="dimmed" style={{ fontStyle: "italic" }}>
            この棚にはまだ本がありません
          </Text>
        </div>
        <div
          style={{
            height: 22,
            background: "linear-gradient(90deg, #8B4513 0%, #A0522D 20%, #CD853F 50%, #A0522D 80%, #8B4513 100%)",
            borderTop: "2px solid #6B3410",
            borderBottom: "3px solid #5C2E0A",
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, ${BOOK_W}px)`,
          justifyContent: "center",
          columnGap: 14,
          rowGap: SHELF_GAP,
          gridAutoRows: BOOK_H,
          alignItems: "end",
          padding: "16px 24px 0",
          backgroundOrigin: "content-box",
          backgroundImage: shelfBackground,
        }}
      >
        {books.map((book) => (
          <BookCover key={book.id} book={book} onClick={() => onBookClick(book)} />
        ))}
      </div>
      <div
        style={{
          height: 22,
          background: `linear-gradient(to bottom, #6B3410 0px, #A0522D 2px, #CD853F 10px, #A0522D 18px, #5C2E0A 22px)`,
          boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
}

function BookDetailModal({ book, onClose }: { book: Book | null; onClose: () => void }) {
  if (!book) return null;

  return (
    <Modal
      opened={!!book}
      onClose={onClose}
      title={book.title}
      centered
      size="md"
      lockScroll={false}
      styles={{
        title: { fontWeight: 700, fontSize: "18px" },
      }}
    >
      <Group align="flex-start" gap="lg" wrap="wrap">
        {book.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverImageUrl}
            alt={book.title}
            style={{
              width: 140,
              height: 207,
              objectFit: "cover",
              borderRadius: "4px",
              boxShadow: "2px 2px 8px rgba(0,0,0,0.3)",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 140,
              height: 207,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "14px",
              textAlign: "center",
              padding: "12px",
              flexShrink: 0,
            }}
          >
            {book.title}
          </div>
        )}

        <Stack gap="sm" style={{ flex: 1, minWidth: 180 }}>
          <div>
            <Text size="xs" c="dimmed">著者</Text>
            <Text size="sm">{book.author || "—"}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">出版社</Text>
            <Text size="sm">{book.publisher || "—"}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">ステータス</Text>
            <Badge color={STATUS_BADGE_COLOR[book.status] || "gray"} variant="filled" size="sm">
              {book.status}
            </Badge>
          </div>
          <div>
            <Text size="xs" c="dimmed">購入日</Text>
            <Text size="sm">{formatDate(book.purchaseDate)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">読了日</Text>
            <Text size="sm">{formatDate(book.finishDate)}</Text>
          </div>

          {book.url && (
            <Button
              component="a"
              href={book.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="light"
              size="sm"
              leftSection={<IconExternalLink size={16} />}
              mt="xs"
            >
              詳細を見る
            </Button>
          )}
        </Stack>
      </Group>
    </Modal>
  );
}

export default function BookShelf({ books }: BookShelfProps) {
  const [activeTab, setActiveTab] = useState<BookCategory>("一般");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const filteredBooks = books.filter((b) => b.category === activeTab);

  const activeBooks = filteredBooks.filter(
    (b) => b.status === "未読" || b.status === "読書中"
  );
  const finishedBooks = filteredBooks.filter((b) => b.status === "読了");

  const counts = {
    "一般": books.filter((b) => b.category === "一般").length,
    "技術書": books.filter((b) => b.category === "技術書").length,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f5e6d3 0%, #e8d5c0 100%)",
        padding: "24px var(--body-padding)",
        margin: "calc(-1 * var(--body-padding))",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px" }}>
        {/* ヘッダー */}
        <h1
          style={{
            textAlign: "center",
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: "#5C2E0A",
            margin: "0 0 24px",
            letterSpacing: "0.05em",
          }}
        >
          本棚
        </h1>

        {/* タブ */}
        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab((value ?? "一般") as BookCategory)}
          mb="lg"
          styles={{
            list: {
              borderBottom: "2px solid #8B4513",
            },
            tab: {
              color: "#5C2E0A",
              fontWeight: 600,
              fontFamily: "'Noto Sans JP', sans-serif",
              "&[data-active]": {
                color: "#8B4513",
                borderColor: "#8B4513",
                backgroundColor: "rgba(139, 69, 19, 0.1)",
              },
              "&:hover": {
                backgroundColor: "rgba(139, 69, 19, 0.05)",
              },
            },
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="一般">一般 ({counts["一般"]})</Tabs.Tab>
            <Tabs.Tab value="技術書">技術書 ({counts["技術書"]})</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {/* 本棚フレーム */}
        <div
          style={{
            borderLeft: "14px solid #6B3410",
            borderRight: "14px solid #6B3410",
            borderBottom: "14px solid #6B3410",
            borderTop: "14px solid #6B3410",
            borderImage: "linear-gradient(180deg, #8B4513 0%, #A0522D 50%, #8B4513 100%) 1",
            background: "linear-gradient(180deg, #faf3eb 0%, #f0e4d4 100%)",
            borderRadius: "4px",
            boxShadow: "4px 4px 16px rgba(0,0,0,0.25), inset 0 0 20px rgba(139,69,19,0.08)",
          }}
        >
          {/* 読書中 / 未読 セクション */}
          <div
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "#5C2E0A",
              padding: "12px 24px 0",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: 18,
                backgroundColor: "#2196F3",
                borderRadius: 2,
              }}
            />
            読書中 / 未読
          </div>
          <ShelfSection books={activeBooks} onBookClick={setSelectedBook} />

          {/* 読了 セクション */}
          <div
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "#5C2E0A",
              padding: "16px 24px 0",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: 18,
                backgroundColor: "#4CAF50",
                borderRadius: 2,
              }}
            />
            読了
          </div>
          <ShelfSection books={finishedBooks} onBookClick={setSelectedBook} />
        </div>
      </div>

      <BookDetailModal book={selectedBook} onClose={() => setSelectedBook(null)} />
    </div>
  );
}
