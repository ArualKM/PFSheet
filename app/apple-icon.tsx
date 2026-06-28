import { ImageResponse } from "next/og";

// Apple touch icon (iOS home screen ignores SVG manifest icons). Full-bleed opaque square — iOS
// applies its own corner mask, so we skip the rounded corners and let the dark field fill the tile.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#0E151D" }}>
        <svg width="180" height="180" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M256 96 L392 168 V312 L256 416 L120 312 V168 Z"
            fill="none"
            stroke="#F0B35A"
            strokeWidth="22"
            strokeLinejoin="round"
          />
          <path d="M256 168 V416" stroke="#67D5FF" strokeWidth="20" strokeLinecap="round" />
          <path d="M256 168 L344 216" stroke="#F0B35A" strokeWidth="20" strokeLinecap="round" />
          <path d="M256 256 L168 304" stroke="#F0B35A" strokeWidth="20" strokeLinecap="round" />
          <circle cx="256" cy="168" r="26" fill="#F0B35A" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
