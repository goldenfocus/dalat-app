import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "ĐàLạt.app · Events · People · Moments · Love";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Decorative elements - stylized pine trees */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "200px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: "40px",
            opacity: 0.15,
          }}
        >
          {[120, 180, 140, 200, 160, 190, 130].map((h, i) => (
            <div
              key={i}
              style={{
                width: "0",
                height: "0",
                borderLeft: "40px solid transparent",
                borderRight: "40px solid transparent",
                borderBottom: `${h}px solid #4ade80`,
              }}
            />
          ))}
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          {/* Logo/Brand */}
          <div
            style={{
              fontSize: "72px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-2px",
            }}
          >
            ĐàLạt.app
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: "32px",
              color: "#94a3b8",
              display: "flex",
              gap: "16px",
              alignItems: "center",
            }}
          >
            <span>Events</span>
            <span style={{ color: "#4ade80" }}>·</span>
            <span>People</span>
            <span style={{ color: "#4ade80" }}>·</span>
            <span>Moments</span>
            <span style={{ color: "#4ade80" }}>·</span>
            <span>Love</span>
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: "24px",
              color: "#64748b",
              marginTop: "16px",
            }}
          >
            Discover and organize events in Da Lat
          </div>
        </div>

        {/* Subtle glow effect */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "600px",
            height: "600px",
            background: "radial-gradient(circle, rgba(74, 222, 128, 0.1) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
