"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal, Button } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import type { ContentEntry, ContentMedia } from "@/lib/notion";
import { SectionHeader } from "@/components/PageLayout";

const MEDIA_COLORS: Record<ContentMedia, string> = {
  Youtube: "#FF0000",
  Podcast: "#9933CC",
  PrimeVideo: "#00A8E1",
  TVer: "#00B900",
  ラジオ: "#00A0E9",
  Music: "#1DB954",
  記事: "#3EA8FF",
  SpeakerDeck: "#009287",
  note: "#41C9B4",
  書籍: "#8B4513",
};

const MEDIA_LABELS: Record<ContentMedia, string> = {
  Youtube: "YouTube",
  Podcast: "Podcast",
  PrimeVideo: "Prime Video",
  TVer: "TVer",
  ラジオ: "ラジオ",
  Music: "Music",
  記事: "記事",
  SpeakerDeck: "Speaker Deck",
  note: "note",
  書籍: "書籍",
};

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const md = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;
  return `${start.getFullYear()}.${md(start)} ~ ${md(end)}`;
}

function MediaBadge({ media, size = "sm" }: { media: ContentMedia; size?: "sm" | "md" }) {
  const isMd = size === "md";
  return (
    <span
      style={{
        fontSize: isMd ? "11px" : "9px",
        fontWeight: 600,
        color: "#fff",
        backgroundColor: MEDIA_COLORS[media] ?? "#868e96",
        borderRadius: isMd ? 4 : 3,
        padding: isMd ? "1px 8px" : "0px 4px",
        lineHeight: 1.6,
      }}
    >
      {MEDIA_LABELS[media] ?? media}
    </span>
  );
}

function PickupCard({ item, onClick }: { item: ContentEntry; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "block",
        width: "clamp(280px, 80vw, 380px)",
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      <div
        className="video-card"
        style={{
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          position: "relative",
        }}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title}
            style={{
              display: "block",
              width: "100%",
              aspectRatio: "16 / 9",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              backgroundColor: "#e9ecef",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 32, color: "#adb5bd" }}>🎬</span>
          </div>
        )}
        <span
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#fff",
            backgroundColor: "#ff6b35",
            borderRadius: 4,
            padding: "2px 8px",
            textTransform: "uppercase",
          }}
        >
          Pickup
        </span>
        <div style={{ padding: "10px 14px 12px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: 700,
              fontFamily: "'Noto Sans JP', sans-serif",
              color: "#2d3436",
              lineHeight: 1.4,
              height: "calc(14px * 1.4 * 2)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.title}
          </p>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <MediaBadge media={item.media} size="md" />
            {item.date && (
              <span style={{ fontSize: "11px", color: "#868e96" }}>{item.date}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentCard({ item, onClick }: { item: ContentEntry; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "block",
        width: 192,
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      <div
        className="video-card"
        style={{
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title}
            width={192}
            height={108}
            style={{
              display: "block",
              width: "100%",
              height: 108,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: 108,
              backgroundColor: "#e9ecef",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 20, color: "#adb5bd" }}>🎬</span>
          </div>
        )}
        <div style={{ padding: "5px 8px 6px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              fontWeight: 700,
              fontFamily: "'Noto Sans JP', sans-serif",
              color: "#2d3436",
              lineHeight: 1.4,
              height: "calc(11px * 1.4 * 2)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.title}
          </p>
          <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
            <MediaBadge media={item.media} />
            {item.date && (
              <span style={{ fontSize: "9px", color: "#868e96" }}>{item.date}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentDetailModal({
  item,
  onClose,
}: {
  item: ContentEntry | null;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <Modal
      opened={!!item}
      onClose={onClose}
      title={item.title}
      centered
      size="lg"
      lockScroll={false}
      styles={{ title: { fontWeight: 700, fontSize: "18px" } }}
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt={item.title}
          style={{
            width: "100%",
            maxHeight: 360,
            objectFit: "cover",
            borderRadius: 8,
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: 200,
            backgroundColor: "#e9ecef",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 40, color: "#adb5bd" }}>🎬</span>
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <MediaBadge media={item.media} size="md" />
        {item.date && (
          <span style={{ fontSize: "13px", color: "#868e96" }}>{item.date}</span>
        )}
      </div>

      {item.body && (
        <div
          style={{
            marginTop: 16,
            fontSize: "14px",
            fontFamily: "'Noto Sans JP', sans-serif",
            color: "#2d3436",
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
          }}
        >
          {item.body}
        </div>
      )}

      {item.url && (
        <Button
          component="a"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          variant="light"
          size="sm"
          leftSection={<IconExternalLink size={16} />}
          mt="lg"
          fullWidth
        >
          コンテンツを見る
        </Button>
      )}
    </Modal>
  );
}

interface ContentsViewProps {
  entries: ContentEntry[];
  currentPage?: number;
  totalPages?: number;
}

export default function ContentsView({
  entries,
  currentPage = 1,
  totalPages = 1,
}: ContentsViewProps) {
  const [selected, setSelected] = useState<ContentEntry | null>(null);

  const sortByDateDesc = (a: ContentEntry, b: ContentEntry) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  };

  const isFirstPage = currentPage === 1;
  const pickups = entries.filter((e) => e.pickup).sort(sortByDateDesc);
  const others = entries.filter((e) => !e.pickup);

  // 週単位でグループ化（ピックアップ以外）
  const grouped = new Map<string, ContentEntry[]>();
  for (const entry of others) {
    const key = entry.date ? getWeekStart(entry.date) : "undated";
    const list = grouped.get(key) || [];
    list.push(entry);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    list.sort(sortByDateDesc);
  }

  const sections = [...grouped.entries()].sort((a, b) => {
    if (a[0] === "undated") return 1;
    if (b[0] === "undated") return -1;
    return b[0].localeCompare(a[0]);
  });

  const pageNum = currentPage;

  return (
    <>
      {pickups.length > 0 && (
        <div>
          <SectionHeader label="ピックアップ" color="#ff6b35" />
          <div style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "flex",
                gap: "16px",
                width: "max-content",
                padding: "12px clamp(8px, 3vw, 24px) 20px",
              }}
            >
              {pickups.map((item) => (
                <PickupCard
                  key={item.id}
                  item={item}
                  onClick={() => setSelected(item)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      {sections.map(([weekKey, items], idx) => {
        const label =
          weekKey === "undated" ? "日付なし" : formatWeekLabel(weekKey);
        const isLatest = idx === 0 && weekKey !== "undated" && isFirstPage;
        return (
          <div key={weekKey}>
            <SectionHeader label={label} color="#495057" />
            <div style={{ overflowX: isLatest ? "visible" : "auto" }}>
              <div
                style={
                  isLatest
                    ? {
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, 192px)",
                        gap: "12px",
                        justifyContent: "center",
                        padding: "12px clamp(8px, 3vw, 24px) 16px",
                      }
                    : {
                        display: "flex",
                        gap: "12px",
                        flexWrap: "nowrap",
                        width: "max-content",
                        padding: "12px clamp(8px, 3vw, 24px) 16px",
                      }
                }
              >
                {items.map((item) => (
                  <ContentCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
      {sections.length === 0 && pickups.length === 0 && (
        <div style={{ padding: "24px", textAlign: "center" }}>
          <p
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              color: "#868e96",
              fontStyle: "italic",
            }}
          >
            コンテンツがありません
          </p>
        </div>
      )}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 24,
            padding: "24px 16px 32px",
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 14,
          }}
        >
          {pageNum > 1 ? (
            <Link
              href={pageNum - 1 === 1 ? "/contents" : `/contents?page=${pageNum - 1}`}
              style={{ color: "#495057", textDecoration: "none", fontWeight: 600 }}
            >
              ← 前へ
            </Link>
          ) : (
            <span style={{ color: "#ced4da", fontWeight: 600 }}>← 前へ</span>
          )}
          <span style={{ color: "#495057" }}>
            {pageNum} / {totalPages}
          </span>
          {pageNum < totalPages ? (
            <Link
              href={`/contents?page=${pageNum + 1}`}
              style={{ color: "#495057", textDecoration: "none", fontWeight: 600 }}
            >
              次へ →
            </Link>
          ) : (
            <span style={{ color: "#ced4da", fontWeight: 600 }}>次へ →</span>
          )}
        </div>
      )}
      <ContentDetailModal item={selected} onClose={() => setSelected(null)} />
    </>
  );
}
