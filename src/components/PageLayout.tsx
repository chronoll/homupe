interface PageLayoutProps {
  title: string;
  maxWidth?: number;
  children: React.ReactNode;
}

export function PageLayout({ title, maxWidth = 800, children }: PageLayoutProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8f9fa 0%, #f0f1f3 100%)",
        padding: "24px var(--body-padding)",
        margin: "calc(-1 * var(--body-padding))",
      }}
    >
      <div style={{ maxWidth, margin: "0 auto", padding: "0 16px" }}>
        <h1
          style={{
            textAlign: "center",
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: "#2d3436",
            margin: "0 0 24px",
            letterSpacing: "0.05em",
          }}
        >
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

interface ContentFrameProps {
  children: React.ReactNode;
}

export function ContentFrame({ children }: ContentFrameProps) {
  return (
    <div
      style={{
        border: "6px solid #dee2e6",
        background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
        borderRadius: "12px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.08), inset 0 0 20px rgba(0,0,0,0.03)",
      }}
    >
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  label: string;
  color: string;
  paddingTop?: string;
}

export function SectionHeader({ label, color, paddingTop = "12px" }: SectionHeaderProps) {
  return (
    <div
      style={{
        fontFamily: "'Noto Sans JP', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: "#495057",
        padding: `${paddingTop} 24px 0`,
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
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
      {label}
    </div>
  );
}
