export default function PageLoading() {
  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "20px 28px",
        background: "rgba(255, 255, 255, 0.95)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
        zIndex: 9999,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/starrideanime.gif"
        alt="Loading"
        style={{ width: 100, height: "auto" }}
      />
      <p
        style={{
          margin: 0,
          fontFamily: "'Noto Sans JP', sans-serif",
          fontSize: 14,
          fontWeight: 700,
          color: "#2d3436",
          letterSpacing: "0.05em",
        }}
      >
        Loading..
      </p>
    </div>
  );
}
