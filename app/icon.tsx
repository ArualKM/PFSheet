import { ImageResponse } from "next/og";

// Favicon / general app icon, generated from the PathForge forge-mark (matches public/icons/icon.svg).
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex" }}>
        <svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="512" height="512" rx="112" fill="#0E151D" />
          <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#2C3A4A" strokeWidth="4" />
          <path
            d="M256 96 L392 168 V312 L256 416 L120 312 V168 Z"
            fill="none"
            stroke="#F0B35A"
            strokeWidth="18"
            strokeLinejoin="round"
          />
          <path d="M256 168 V416" stroke="#67D5FF" strokeWidth="16" strokeLinecap="round" />
          <path d="M256 168 L344 216" stroke="#F0B35A" strokeWidth="16" strokeLinecap="round" />
          <path d="M256 256 L168 304" stroke="#F0B35A" strokeWidth="16" strokeLinecap="round" />
          <circle cx="256" cy="168" r="22" fill="#F0B35A" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
