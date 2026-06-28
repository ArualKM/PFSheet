import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PathForge handles your data.",
};

const UPDATED = "June 28, 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          PathForge is a free, ad-free Pathfinder 1e character and campaign tool. We collect only what
          we need to run your account and store your characters, and we don&rsquo;t sell your data or
          use third-party advertising trackers. This page explains what we keep and why.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">What we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Account details</strong> — your email address, and a
              display name and handle you choose. If you sign in with Google or Discord, we receive the
              basic profile information that sign-in provides (such as your email).
            </li>
            <li>
              <strong className="text-foreground">Your content</strong> — the characters, campaigns,
              notes, and settings you create in the app.
            </li>
            <li>
              <strong className="text-foreground">Operational data</strong> — basic logs and security
              information (such as timestamps and request metadata) needed to keep the service running
              and safe, including API-key usage if you create developer keys.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">How we use it</h2>
          <p>
            We use your data to provide the service: authenticating you, saving and computing your
            characters, sharing the sheets you choose to publish, running campaigns you join, and
            keeping the platform secure. We don&rsquo;t use it for advertising.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Sharing &amp; visibility</h2>
          <p>
            Characters are private by default. When you publish a sheet or share a link, only the
            sections you mark visible are exposed — private notes, GM-only details, and restricted
            sections are filtered out on the server before anything leaves it. You control per-section
            visibility in each character&rsquo;s settings.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Service providers</h2>
          <p>
            We rely on a small number of infrastructure providers to operate: <strong className="text-foreground">Supabase</strong>{" "}
            (database, authentication, and storage) and <strong className="text-foreground">Vercel</strong>{" "}
            (application hosting). If you choose social sign-in, <strong className="text-foreground">Google</strong> or{" "}
            <strong className="text-foreground">Discord</strong> processes that authentication. These
            providers process data on our behalf to deliver the service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Cookies</h2>
          <p>
            We use cookies only for essential functions — keeping you signed in and remembering your
            theme. We don&rsquo;t use advertising or cross-site tracking cookies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Retention &amp; deletion</h2>
          <p>
            We keep your data while your account is active. You can delete individual characters at any
            time. To delete your account and associated data, contact us at the address below and
            we&rsquo;ll remove it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Children</h2>
          <p>
            PathForge isn&rsquo;t directed at children under 13, and we don&rsquo;t knowingly collect
            their data.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Changes</h2>
          <p>
            We may update this policy as the app evolves. Material changes will be reflected by the
            &ldquo;last updated&rdquo; date above.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Contact</h2>
          <p>
            Questions or deletion requests:{" "}
            <a href="mailto:meirne4727@gmail.com" className="font-medium text-rune hover:underline">
              meirne4727@gmail.com
            </a>
            .
          </p>
        </section>

        <p className="border-t border-border/60 pt-6 text-xs text-muted-foreground/80">
          PathForge is a fan-made toolkit and is not affiliated with or endorsed by Paizo Inc.
        </p>
      </div>
    </article>
  );
}
