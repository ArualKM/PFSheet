import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

// Public, dependency-light fallback served by the service worker when a navigation
// fails offline. Kept text-only so its SSR HTML renders without extra chunks.
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        <p className="font-display text-3xl font-semibold text-gold">PathForge</p>
        <h1 className="text-xl font-semibold text-foreground">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">
          PathForge can&apos;t reach the network right now. Reconnect to load your characters — any
          edits you made were saved as you went.
        </p>
        <a
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </a>
      </div>
    </main>
  );
}
