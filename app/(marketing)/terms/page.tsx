import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using PathForge.",
};

const UPDATED = "June 28, 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          By using PathForge you agree to these terms. PathForge is a free, ad-free hobby project; we
          aim to keep it running well but provide it on an &ldquo;as is&rdquo; basis.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Your account</h2>
          <p>
            You&rsquo;re responsible for keeping your login secure and for activity under your account.
            Provide accurate sign-up details and don&rsquo;t impersonate others.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Your content</h2>
          <p>
            You own the characters, campaigns, and notes you create. You grant us only the limited
            permission needed to store, display, and share that content as you direct (for example,
            rendering a sheet you choose to publish). You&rsquo;re responsible for the content you
            upload and for having the rights to it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Acceptable use</h2>
          <p>Don&rsquo;t use PathForge to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>break the law or infringe others&rsquo; rights;</li>
            <li>upload malicious content, or attempt to disrupt, overload, or reverse-engineer the service;</li>
            <li>access accounts or data that aren&rsquo;t yours, or abuse the API beyond its rate limits.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Pathfinder &amp; third-party content</h2>
          <p>
            PathForge is an independent fan-made toolkit and is not affiliated with or endorsed by
            Paizo Inc. Pathfinder and associated marks are property of their respective owners. Game
            content is used under the Open Game License and the relevant community-use and third-party
            licenses; you&rsquo;re responsible for owning the rulebooks and third-party material you use.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Availability &amp; changes</h2>
          <p>
            Because this is a free project, we may change, suspend, or discontinue features at any
            time, and the service may occasionally be unavailable. We may also update these terms; your
            continued use after a change means you accept the updated terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Termination</h2>
          <p>
            You can stop using PathForge and request deletion at any time. We may suspend or remove
            accounts that violate these terms or put the service or other users at risk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Disclaimer &amp; liability</h2>
          <p>
            The service is provided &ldquo;as is,&rdquo; without warranties of any kind. To the extent
            permitted by law, PathForge isn&rsquo;t liable for any indirect or consequential damages, or
            for lost data — please keep your own backups of anything important (you can export your
            characters at any time).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Contact</h2>
          <p>
            Questions about these terms:{" "}
            <a href="mailto:meirne4727@gmail.com" className="font-medium text-rune hover:underline">
              meirne4727@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
