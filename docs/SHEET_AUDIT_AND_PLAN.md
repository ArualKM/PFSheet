<!-- Generated 2026-06-27 via a 10-agent grounded audit of the schema + editors + view + UX, then synthesized. A prioritized plan, not yet executed. -->

The two highest-priority claims are confirmed: languages has schema + factory seed (`["Common"]`) but zero editor/view-model references, and the compute engine only has the hardcoded `armorCheckPenalty: 0` with no reads of conditions/DR/ER/nonlethal/languages. The `bg-surface-sunken` token is undefined yet used 8 times. The findings are solid; I'll synthesize the plan.

# PathForge Sheet Audit & Pre-S4 Plan

PathForge has a strong computed core (AC/saves/abilities/BAB/skills math, buff stacking, spellcasting slots, privacy view-model, import/export round-trips), but the audit found a consistent failure pattern across every domain: **data is modeled in the schema and often editable, but never reaches the rules engine or the read-only sheet.** The single worst case is the product-owner-flagged **LANGUAGES** gap — confirmed end-to-end: the schema exists (`meta.ts:5`), the factory seeds `["Common"]` (`factory.ts:145`), importers/exporters read it, yet there is **zero** editor UI and **zero** view-model/dashboard surfacing (grep returns nothing outside importers). The same "captured but invisible/inert" defect independently recurs for conditions, damage reduction, energy resistance, immunities, spell resistance, encumbrance/ACP, character traits, and inventory→AC/attack linkage. A second cluster is **core PF1e math that is purely manual**: HP from Hit Dice, iterative attacks, weapon damage, armor check penalty, carrying capacity, and favored-class bonuses. Below, P0 items are things a real player is blocked on or must track entirely off-app; P1 are important gaps and trust-eroding UX bugs; P2 is polish.

## P0 — core sheet features missing/broken

| Item | Domain | Why it matters | Effort |
|---|---|---|---|
| **Languages: no editor, no display, no derivation** | Identity/Skills | Schema (`meta.ts:5`) + factory seed (`factory.ts:145`) + import/export all exist, but no UI to add/remove/view languages and the dashboard/view-model never render them. No Int-mod bonus languages, no Linguistics-rank→language derivation (`skills.ts:90`). The flagged "core feature, no real UI" — fully confirmed. | M |
| **No structured conditions system (free-text tags, disconnected from math)** | Health | `health.conditions` is `string[]` (`vitals.ts:22`) never read by the engine; only 3 conditions (Fatigued/Shaken/Sickened) work, and only via a separate Buff-Center path. Prone/grappled/staggered/stunned/etc. change nothing and aren't surfaced. | L |
| **DR, energy resistance, nonlethal, conditions never reach the read sheet/view-model** | Health/Defenses | Editor captures DR 10/magic, Resist Fire 10, nonlethal, conditions — `compute.ts` and `view-model.ts` ignore all of them; dashboard/share/API show none. A silent data black hole. | M |
| **Immunities: no schema field, no editor, no display** | Defenses | Basic defensive block (immune to fear/poison/disease/mind-affecting). Foundry importer dumps them to `metadata.unmapped` because there's nowhere to put them. | M |
| **Character Spell Resistance (SR) field: no editor, no compute, no display** | Defenses | `defenses.spellResistance` exists (`combat.ts:59`) but is unreachable; every other `spellResistance` ref is the *spell's* property. Drow/monk/golem PCs can't record SR. | S |
| **No conditional defenses (+2 vs fear, +4 vs poison, etc.)** | Defenses | Engine deliberately separates conditional mods (`compute.ts:111-112,127-128`) but there is **no UI to add one** and no display anywhere. Pervasive racial/class bonuses are untrackable. | L |
| **Max HP hand-entered; no HD + Con + FCB computation; `hitDice` array has no editor** | Health | `summary.hp.max` just echoes the stored number (`compute.ts:631`). Level-ups require recomputing HP by hand; `favoredClassBonus:'hp'` field is dead. | L |
| **No iterative attacks / full-attack (BAB +6 never becomes +6/+1)** | Combat | Engine computes one to-hit per attack; no iteration field in `attackEntrySchema`. Every martial tracks iteratives off-app. | L |
| **Combat maneuvers collapsed into one CMB (no per-maneuver bull rush/grapple/trip/disarm…)** | Combat | Single generic `cmb` bucket (`combat.ts:8`); no place for Improved Trip +2, weapon bonuses, size mods per maneuver. | L |
| **Armor check penalty hardcoded to 0; never applied to skills** | Skills/Inventory | `compute.ts:575` sets `armorCheckPenalty: 0` for every skill; armor items have no ACP field. Full-plate characters show un-penalized Acrobatics/Climb/Stealth/Swim — silently wrong. | L |
| **Craft / Perform / Profession (repeatable skills) cannot exist on the sheet** | Skills | Factory filters out repeatable skills (`factory.ts:41`); no Add-Skill/specialty UI. Bards/crafters/most NPCs can't record these. | M |
| **Character TRAITS: schema + compute support, but no editor and not surfaced** | Feats | Nearly every PC takes 2 traits; engine ingests trait automation (`compute.ts:175-178`) but there's no way to create one and view-model omits them. | M |
| **Armor/shield items carry no stats and don't feed AC** | Inventory | No armorBonus/maxDex/ACP/speed/ASF on items; AC is disconnected manual `ac_armor` entries. Equipping a breastplate does nothing automatic. | L |
| **Weapons have no combat stats; inventory weapons ≠ combat attacks** | Inventory/Combat | Two unlinked lists; a weapon is maintained twice and enhancement bonuses hand-typed into formulas. | L |
| **Item modifiers/automation: engine reads them, but no UI to add them** | Inventory | Hand-made Cloak of Resistance +2 / Ring of Protection +1 grant zero bonus; only importer items work. Editor empty-state promises a path that's unreachable. | M |
| **Inventory & wealth never rendered on read/share sheet** | Inventory | `CharacterViewModel` has no inventory/wealth field; gear/money/weapons invisible on overview, public share, and GM audit. | L |
| **Domains have no model (no domain slots, no domain spells, no granted powers)** | Spells | Clerics/inquisitors/warpriests can't represent their daily loadout; druids' nature bonus also absent. | L |
| **Bloodlines / mysteries / patrons + revelations / bloodline powers unmodeled** | Spells | Sorcerer/oracle/witch/shaman class-defining daily resources only hand-typeable as inert "features" with no uses tracker surfaced. | L |
| **Wizard specialization + opposition schools unsupported** | Spells | No bonus specialist slot (slot count wrong by one/level), no double-cost or banned-school enforcement. | L |
| **Metamagic cannot be applied to a prepared/known spell** | Spells | Schema is ready (`metamagicIds`/`effectiveLevel`, honored at `compute.ts:487`) but no UI ever populates it — the whole data path is dead. | M |

## P1 — important gaps + UX bugs

| Item | Domain | Why it matters | Effort |
|---|---|---|---|
| Int-mod bonus languages + Linguistics-rank→languages not computed | Identity/Skills | `bonusLanguageCount` unused; language budget tracked off-app. | M |
| Editable-but-invisible identity fields (deity/homeland/ethnicity/gender/age/height/weight) | Identity | 7 first-class inputs vanish from read/share view — a trust problem; deity matters for clerics/paladins/oracles. | S |
| Appearance detail fields (skin/hair/eyes/distinguishing) have no editor | Identity | Schema models them; ProfileEditor edits only `description`. | S |
| Size is free-text → typos silently break AC/attack/CMB/CMD; no carrying capacity/creature type | Identity | `getSizeModifiers` returns 0 on any unrecognized string with no warning; needs a `<select>` of the 9 sizes. | M |
| Carrying capacity / encumbrance schema-only — no UI, no Str×size computation, no load category/penalties | Inventory | Core derived value can't even be hand-entered; load/Dex-cap/speed penalties unmodeled. | M |
| Speed variants (fly/swim/climb/burrow) editable but only land speed computed/surfaced; no fly maneuverability | Identity/Combat | Entered fly/swim speeds disappear from the sheet. | M |
| Racial ability modifier entry double-gated (point-buy + advanced) and missing on manual path | Abilities | Manual users have no "racial" bucket; helper text omits it; new players won't find it. | M |
| Ability damage/drain/penalty invisible on read sheet (only net effective score) | Abilities | A poisoned/enervated character looks identical to a healthy one. | M |
| No max-ranks-per-skill (=level) cap; no skill-point budget/spent-vs-available | Skills | Illegal allocations accepted with no feedback; FCB skill option absent. | M/L |
| Per-skill misc modifiers & ability override not editable; trained-only not enforced | Skills | No UI for Skill Focus/racial Perception etc.; trained-only skills with 0 ranks still show usable totals. | M |
| Background Skills variant: setting exists, no behavior | Skills | Toggle + per-skill flags present but unread; no separate pool/UI. | M |
| Feat editor captures only name+type (no benefit/prereq/automation) | Feats | Feats are bare labels; user-entered feats can never affect computed values. | M |
| Feature editor captures only name+category (no uses/per-day tracking) | Feats | Rage rounds, channel, ki, smite, lay-on-hands uses all tracked off-app. | M |
| Class features 100% manual — not derived from class+level | Feats | Despite class catalog, every bonus feat/talent/sneak-attack die hand-typed. | XL |
| Favored Class Bonus modeled but no editor and never summed by engine | Feats | `SECONDARY_MILESTONES.md:363` admits FCB isn't summed; +1 HP/skill applied by hand; levelPlan has no UI. | L |
| Drawbacks unsupported (no concept, no UI) | Feats | Standard for the "drawback → extra trait" pattern; only home is free-text notes. | S |
| Nonlethal damage stored but never compared to HP (no staggered/unconscious), not surfaced | Health | Inert number the player can't even see. | M |
| No negative-level / energy-drain tracking | Health | Common heavy status (−1 atk/saves/checks, −5 HP, −1 level) applied entirely by hand. | L |
| Wounds & Vigor variant toggle does nothing | Health | No vigor pool/wound threshold fields or compute branch. | L |
| Two disconnected "conditions" surfaces (inert Health chips vs functional Buff templates) | Health UX | Player types "Shaken" in Health tab, sees no change, concludes math is broken. | M |
| Weapon damage free-text (STR/1.5×/Power Attack never computed) | Combat | Hand-type `1d8+7`, re-edit on every STR/buff change. | L |
| No per-weapon enhancement bonus; no equipped-weapon→attack link | Combat | +1 flaming longsword's +1 isn't applied automatically. | L |
| No two-weapon-fighting / off-hand support | Combat | Dual-wielders compute both penalty sets + off-hand damage by hand. | M |
| Computed general melee/ranged attack bonus never shown | Combat UX | Dashboard shows only CMB/CMD; a standard top-line number is missing. | S |
| Spell-like abilities & metamagic entries never on read/public/API view; SLA uses untrackable | Spells | At-will/3-per-day SLAs invisible; no decrement control. | M |
| No scroll/wand/staff use (no charges, CL, DC, "cast from item") | Spells/Inventory | Wand of CLW (50 charges) tracked off-app; item spells not castable. | M |
| Container nesting: schema only, no UI (can't create container, assign items, or get weight reduction) | Inventory | "Exists" is schema-only; Handy Haversack/Bag of Holding non-functional. | M |
| No charges/uses tracking for consumables | Inventory | Wands/scrolls/charged wondrous items only get a free-text note. | M |
| Encumbrance free-text; never computed; load category/Dex-cap/ACP/speed not derived | Inventory | Overlaps carrying-capacity P1 above; consolidate. | M |
| Inventory items render in one flat undifferentiated list (no grouping/filter/sort) | Inventory UX | 20+ items become an unscannable wall of identical rows. | M |
| Editing DR/ER gives no feedback it's discarded (silent black hole) | Defenses UX | Editor invites entry into fields silently dropped from every read surface; Foundry import warning points users there. | M |
| No miss-chance/concealment/defensive-ability tracking (Evasion/Uncanny Dodge/Defensive Roll) | Defenses | No structured home; only flat-named "features". | L |
| Race free-text only; no racial ability modifiers applied; no race catalog | Abilities | No auto +2/+2/−2 or size-from-race; manual bake-in. | L |
| Feats/Features rows can't expand to enter detail | Feats UX | Flat lists can't hold a real character's data; detail forced into Profile notes. | M |
| Undefined `bg-surface-sunken` token renders transparent in 8 places (5 files) | UX/CSS | Confirmed: token never defined; recessed contrast lost on public spell pills, prepared-spell chips, preset preview, Settings/Developers code blocks. | S |
| No skip-to-content link; keyboard users tab through full nav + 10-item rail before fields | UX/a11y | Standard a11y fix absent. | S |
| Skills table overflows horizontally on small screens (`overflow-hidden`, not scrollable) | UX/responsive | Total column clipped with no scroll in the constrained center column. | S |
| No quick HP damage/heal control — only raw Current HP entry | Health UX | Most frequent in-combat edit requires opening editor → Health tab → absolute number. | M |

## P2 — polish & nice-to-haves

| Item | Domain | Why it matters | Effort |
|---|---|---|---|
| No creature type/subtype concept | Identity | Non-Humanoid races (aasimar=Outsider) can't record type; gates targeting/bane/DR. | M |
| Size: no fall-through warning when unrecognized | Identity | Subsumed by the size-`<select>` fix. | S |
| No age-category modifiers; no creature templates (young/advanced) | Abilities | Age is cosmetic; no template field/compute. | L |
| Point-buy "racial" split silently double-counts; no auto-decompose | Abilities | Prose-only warning; footgun on race-adjusted characters. | M |
| Advanced ability-adjust: cramped 3-col abbreviated labels, weak a11y naming | Abilities | Six numeric inputs per card, no ability context for SR; "Temp" ambiguous. | S |
| Condition input has no autocomplete/picker; case-sensitive dedupe | Health UX | Free-typed misspellings of a fixed vocabulary. | S |
| Hero Points variant toggle has no pool tracking | Health | Catalog-only; no spend/gain UI. | M |
| No fast healing / regeneration / hardness | Health | Monstrous/construct PCs and `regenerate` have nowhere to record. | M |
| DR/ER entries unstructured (bypass/energy type only in free-text label) | Defenses | Can't reason about "DR 10/magic and silver" vs an attack. | S |
| `defensiveItemIds`/`defensiveFeatureIds` dead fields | Defenses | Inert placeholders; intended linkage absent. | M |
| Dashboard has no dedicated Defenses card | Defenses UX | Once gaps fixed, DR/SR/immunities/conditional need a home. | M |
| Ranged increments not modeled (no −2/increment penalty); ammo has no editor | Combat | Free-text range string shown verbatim. | M |
| `offensiveFeatureIds` dead field (special attacks homeless) | Combat | Breath weapon/sneak dice/smite/rage powers only as notes. | M |
| BAB single number, no iterative/progression breakdown shown | Combat UX | `bab.progression` unused. | S |
| Attack crit one free-text field; `critMultiplier` unreachable; crit/range never render | Combat UX | Two schema fields crammed into one box; not surfaced. | S |
| At-will/cantrip flag (`atWill`) has no UI and isn't surfaced | Spells | Can't mark/see unlimited 0-level spells (math is otherwise correct). | S |
| Spell-vs-SR caster check (d20+CL, Spell Penetration) not computed/shown | Spells | SR-beat bonus computed by hand each cast. | S |
| Spells-per-day manual grid disconnected from computed tracker; bonus slots not editable/visible | Spells UX | User can't tell whether ability bonus spells are folded in. | M |
| DC/concentration exposed as raw `@{...}` formula strings, no guided picker | Spells UX | Usability cliff for the most-used spellcasting numbers. | M |
| Known-spell list: no cast affordance for spontaneous casters, no level grouping | Spells UX | Sorcerer with 40+ known is hard to scan. | M |
| No feat-slot accounting (expected vs taken) | Feats | No warning for too few/too many feats. | L |
| No retraining support | Feats | Optional subsystem; long-campaign feature. | M |
| Read view: feats/features bare chips, traits never appear | Feats UX | No benefit/detail; traits invisible even if imported. | M |
| Favored-class entry is a free-text string list unlinked to class rows | Feats UX | Two unsynced representations; invites typos. | M |
| No magic-item body slots / slot-conflict aid | Inventory | Can equip 3 rings with no warning. | M |
| No starting-wealth-by-class helper; no WBL reference | Inventory | No creation gold or GM gauge. | S |
| `carriedStoredSplit` dead; coin weight unmodeled | Inventory | Split has no UI/effect; 50 coins=1 lb never added. | S |
| Every new item starts as "gear", must be re-categorized; one flex-wrap row of 8 controls | Inventory UX | Friction + unpredictable mobile wrap. | S/M |
| Wealth total ignores valuables, lumps stored coin, excludes coin weight | Inventory UX | Inconsistent wealth/encumbrance picture. | S |
| Skills table read-only beyond ranks/class — no per-skill breakdown/misc-bonus attach | Skills UX | Users reverse-engineer totals. | M |
| Dashboard skills omit ranks/ability/class/trained context; sort by total only; no grouping | Skills UX | Reader/GM can't see how a total is built; hard to find a skill. | S |
| Knowledge/homebrew skills can't be added/removed (fixed seeded set) | Skills | `custom:true` supported in schema, no UI. | M |
| Skills rank input 32px (<44px touch); inline selects/inputs 40px skip shared sizing | UX/responsive | Inconsistent with the app's enforced 44px tap target. | S/M |
| Dual tablists both claim `aria-controls="editor-panel"` | UX/a11y | Ambiguous tabpanel pairing for AT. | M |
| No page-level Save button; autosave status off-screen when scrolled deep | UX | Save/conflict/offline state easy to miss; no near-field unsaved cue. | M |
| Portrait raw URL, no broken-image fallback, no upload | UX | Dead/hotlink-protected URL shows broken-image icon. | M |
| Chip-remove "×" tiny hit area; add-row inputs aria-label only | UX/a11y | Easy to mis-tap on touch. | S |

## Proposed execution sequence

Group the P0/P1 work into coherent passes. Recommended order — the first pass is the highest-leverage and clears the product-owner's flagged item; "wire to engine + view-model" is the recurring theme, so each pass should add the read-only **Defenses/Languages/etc. surfacing** at the same time it adds the editor, to avoid the "captured but invisible" pattern that caused most findings.

1. **Pass 1 — Languages + skills depth.** Languages editor (add/remove/view) + Int-mod and Linguistics-rank derivation + a Languages line in the view-model and dashboard. Then skills depth: repeatable Craft/Perform/Profession with specialty + Add/remove/custom skill UI, per-skill misc modifiers + ability override, max-rank cap and a skill-point budget tracker, armor check penalty derived from equipped armor and actually applied (`compute.ts:575`), trained-only gating, and Background Skills behavior. *(Languages first — it's the flagged P0 and shares the read-surface plumbing skills will reuse.)*

2. **Pass 2 — Combat & attacks depth.** Iterative/full-attack derivation from BAB, weapon damage computation (STR/1.5×/0.5×, Power Attack), per-weapon enhancement bonus, equipped-weapon→attack linkage, per-maneuver combat-maneuver set, two-weapon fighting, and surfacing the general melee/ranged attack bonus + crit/range on the dashboard.

3. **Pass 3 — Conditions, defenses & health.** A structured conditions system unified with the working Buff-Center mechanics (retire the inert Health-tab chips or make them apply effects), plus surfacing DR / energy resistance / immunities (new field) / character SR / nonlethal / conditional defenses through the engine **and** a new dashboard Defenses card. Add negative-level tracking and HP-from-Hit-Dice + Con + FCB computation here (it ties into the HD array editor and favored-class bonus).

4. **Pass 4 — Inventory↔compute + items.** Armor/shield stats feeding AC (bonus/maxDex/ACP/speed/ASF), item modifier/automation editor so hand-made magic items work, charges/uses on consumables, container UI with weight reduction, carrying-capacity computation, and rendering inventory + wealth on the read/share/GM view.

5. **Pass 5 — Feats, traits & spellcasting depth.** Traits + drawbacks editor (engine already consumes them) and view-model surfacing; expandable feat/feature rows with benefit/uses/automation; FCB editor + engine summation. Spellcasting: domains, bloodlines/mysteries/patrons, wizard specialization/opposition, metamagic-on-slot, and surfacing SLAs/metamagic on the read view. *(Highest-effort pass; class-feature auto-population from class+level is XL and can be split out or deferred.)*

6. **Pass 6 — Identity/profile + size.** Surface the 7 write-only identity fields + appearance detail fields on the read view, convert size to a `<select>` of the 9 sizes (eliminates the silent-math-error class), speed-variant computation/display.

7. **Pass 7 — UX/responsive/a11y fixes.** Define the missing `bg-surface-sunken` token, add a skip-to-content link, fix the skills-table horizontal overflow, normalize 32/40px controls to the 44px tap target, resolve the dual-`aria-controls` tablist ambiguity, add a page-level save affordance / scrolled save-status echo, portrait broken-image fallback, and enlarge chip-remove hit areas. Many are quick wins; batch the cheap ones early in the pass.

8. **Real-browser UX verification pass (its own step, run after Passes 6–7 and spot-checked after each prior pass).** The code audit cannot catch every rendered bug — flex-wrap collapse in the constrained editor center column, the transparent `bg-surface-sunken` elements, touch-target sizing, and table overflow all manifest only at real widths. Drive the live app (Playwright/Chrome MCP) and capture **screenshots at mobile (~375px) and desktop (~1280px) widths** on the key screens: dashboard/overview, the editor (each major section: Abilities, Skills, Combat, Inventory, Spells), the public `/c/[slug]` share, and the GM audit view. Confirm every newly-surfaced read field renders, no element is invisibly transparent, dense rows don't wrap raggedly, and all touch targets meet 44px. This is the gate before declaring the audit work done and before starting S4.

## Already solid (do not redo)

- **Core computed math:** AC (touch/flat-footed + typed components), three saves, ability scores/modifiers with enhancement/inherent stacking, BAB, CMB/CMD, initiative, and per-skill totals (rank + ability + class + indexed misc) all compute correctly via the formula engine — never `eval`. The "Show Math" inspector exposes terms per value.
- **Buff Center:** stacking-conflict detection, live affected-value deltas, duration/round countdown, formula-valued effects, and a 20-entry PF1e buff library — the 3 working condition-buffs (Fatigued/Shaken/Sickened) prove the path.
- **Spellcasting engine fundamentals:** per-level slot counts with ability bonus, caster level, concentration, per-level save DC; 0-level handling is correct (bardic cantrips get no slot row, orisons get no ability bonus — covered by tests). Prepared-caster prepare→cast→rest flow and the compendium picker (class/level-aware, ranked, debounced) are good.
- **Privacy view-model & sharing:** §15 section gating, the public `/c/[slug]` anonymous view, and the GM audit re-applying the viewer's gating (a prior privacy-leak class was caught and fixed) are robust — new read fields must flow through this same gating.
- **Class presets:** `class-catalog.ts` recomputes BAB/saves/HP from a class preset (one-time HP average) and is wired to `presetKey`.
- **Import/export:** PathForge/Foundry/Myth-Weavers/PDF adapters with round-trip tests; importers already populate `languages`, `hitDice`, item modifiers, and traits — the schema and ingestion are ahead of the UI, so most P0 work is "build the missing editor + surface it," not "design new data."
- **Mobile/responsive foundation (S5a):** drawer nav, responsive editor, density pass, and a defined 44px tap target + `tap-target` utility exist — the responsive findings are deviations from an established system, not a missing one.