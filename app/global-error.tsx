"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for a throw in the root layout itself — it replaces the whole document, so it
 * must render its own <html>/<body> and can't rely on globals.css (the root layout never mounted).
 * Inline styles keep it self-contained and on-brand (obsidian palette).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#090d12",
          color: "#e7e2d6",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Something went sideways
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#9b958a", margin: "0 0 1rem", lineHeight: 1.5 }}>
            A critical error stopped the app from loading. Try reloading the page.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#6f6a61", margin: "0 0 1rem" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              cursor: "pointer",
              borderRadius: "0.5rem",
              border: "1px solid #3a3f47",
              background: "#1a1f26",
              color: "#e7e2d6",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
