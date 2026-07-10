import Link from "next/link";
import type { CharacterViewModel } from "@/lib/character/view-model";
import { PortraitImage } from "./portrait-image";
import { MiniStat } from "./stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatModifier } from "@/lib/utils";

/**
 * Public-share hero band (S6 Pillar 4 §3.3, `docs/S6_UX_OVERHAUL/mockups/viewer.html` zone 2) —
 * the "everything up front" lead banner for a cold share-link click. Server Component; `{ vm }`
 * only — every value rendered here is pure re-presentation of the already-§15-gated
 * `CharacterViewModel` the page built (`vm.header`/`vm.vitals`), never a raw sheet field. No new
 * privacy surface, no new view-model work.
 */
export function ShareHero({ vm }: { vm: CharacterViewModel }) {
  return (
    <Card className="overflow-hidden border-gold/40 bg-gradient-to-br from-gold/10 to-transparent">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4 sm:gap-5">
          <div className="aspect-square w-20 shrink-0 overflow-hidden rounded-lg border-2 border-gold bg-surface-raised sm:w-24">
            <PortraitImage src={vm.header.portraitUrl} alt={vm.header.name} fallback={vm.header.name.charAt(0)} />
          </div>

          <div className="min-w-0 flex-1 basis-64">
            {/* Not a heading: the page's own <h1> (rendered by the sheet further down, inside
                #full-sheet) already carries the name — a second same-name h1 up here would be a
                duplicate heading in the screen-reader outline (same convention as
                CompanionInfoBox's banner variant in companion-sheet.tsx). */}
            <p className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {vm.header.name}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground sm:text-base">{vm.header.classLine}</p>
          </div>

          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <span className="inline-flex w-fit items-center gap-1.5 self-start rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:self-end">
              Public share
            </span>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg" className="tap-target">
                <Link href="/signup">Create your own character</Link>
              </Button>
              {/* Plain in-page anchor, no JS: jumps to (and, if the app ever sets `scroll-behavior:
                  smooth`, glides to) the existing SheetViewSwitch content below, anchored by
                  `#full-sheet` on the page. */}
              <Button asChild variant="ghost" size="lg" className="tap-target border border-border">
                <a href="#full-sheet">View full sheet ↓</a>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <MiniStat label="HP" value={`${vm.vitals.hp.current}/${vm.vitals.hp.max}`} />
          <MiniStat label="AC" value={vm.vitals.ac.total} />
          <MiniStat label="Init" value={formatModifier(vm.vitals.initiative)} />
          <MiniStat label="Fort" value={formatModifier(vm.vitals.saves.fortitude)} />
          <MiniStat label="Ref" value={formatModifier(vm.vitals.saves.reflex)} />
          <MiniStat label="Will" value={formatModifier(vm.vitals.saves.will)} />
        </div>
      </CardContent>
    </Card>
  );
}
