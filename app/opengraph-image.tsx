import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// The picture shown when the site's link is shared.
export const alt = `${BRAND.name}: online appointment booking`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #1b7d76, #43b7aa)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, opacity: 0.9 }}>{BRAND.name}</div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>
          Book your clinic visit in a few clicks
        </div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 32, opacity: 0.9 }}>{BRAND.tagline}</div>
      </div>
    ),
    size,
  );
}
