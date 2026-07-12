# S4 — Per-System Design Detail

> **STATUS (2026-07-12): SHIPPED.** Every system detailed below is live — Spheres of Power/
> Might/Guile, Akashic Magic, Psionics, Path of War, Mythic, Wounds & Vigor, Gestalt, and the
> small Phase-B systems (Hero Points, Background Skills, Honor, Stamina & Combat Tricks). See
> CLAUDE.md ("Spheres compendium", "The big 3pp update (S4 flagship) — COMPLETE") and
> `docs/3PP_MASTER_PLAN.md` for what actually shipped and where implementation diverged from
> this design (e.g. per-domain compendium tables instead of one generic table). Kept as the
> grounded per-system design record, not current status.

Companion to `S4_OPTIONAL_RULES_PLAN.md`. Full grounded design for each system from the research workflow. Standard ship order: schema+engine core → editor+read+privacy → compendium → parser, each pass reviewed + gated.

---

## Spheres of Power / Spheres of Might / Spheres of Guile (Drop Dead Studios) — Pathfinder 1e modular casting/martial/skill subsystem  — **XL**

**Summary.** Spheres replaces (or supplements) PF1e's Vancian magic and feat-driven martial/skill play with three parallel "talent" subsystems. Spheres of Power: a caster has a Caster Level (its own high/mid/low progression, like BAB — NOT class level), a Spell Point pool = total casting-class levels + Casting Ability Modifier (CAM, which is Int/Wis/Cha per the character's casting tradition), and a set of magic spheres each granting an at-will base ability refined by talents; sphere-effect save DC = 10 + ½ caster level + CAM, and opposed magic checks use MSB (= total casting class levels) vs MSD (= 11 + casting class levels). Spheres of Might mirrors this for martial practitioners: a Practitioner Level, martial spheres + martial talents, and a once-per-encounter Martial Focus resource expended to power talents or auto-pass a Str/Dex/Con save as a 10. Spheres of Guile adds skill/social/exploration spheres + talents (no pool of its own; gated by skill ranks). The mechanical pillars are: (1) talent acquisition (a few hundred discrete talents across spheres — the flagship compendium+paste-parser case), (2) the spell-point pool + caster-level math, (3) martial focus + practitioner level, (4) per-effect DCs/concentration via the MSB/MSD opposed-check layer, and (5) casting/martial traditions = drawbacks-grant-bonus-talents customization. Gestalt: multiple Spheres classes combine talents and spell pools and use the highest caster/practitioner level (CL boosts from class abilities don't stack).

**Core mechanics:**
- Caster Level: own progression (high = class level, mid ≈ level×3/4, low ≈ level×1/2), tracked per casting class then combined/highest; drives DCs, ranges, sphere scaling
- Spell Point pool: max = total casting-class levels + CAM (min 0); spent on sphere effects/augments; refresh on 8h rest — maps cleanly to resourceRef
- Casting Ability Modifier (CAM): one of Int/Wis/Cha set by the casting tradition; feeds spell points + all sphere save DCs
- MSB = total casting class levels; MSD = 11 + total casting class levels (opposed magic checks: counter/dispel/SR-analog)
- Sphere effect save DC = 10 + floor(caster level / 2) + CAM
- Concentration check = 1d20 + MSB + CAM (a derived bonus to surface)
- Magic talents: 2 free on first casting-class level; each talent buys a new base sphere OR a talent within a known sphere; spheres own at-will base abilities
- 20 core (22 Ultimate) magic spheres: Alteration, Blood, Conjuration, Creation, Dark, Death, Destruction, Divination, Enhancement, Fallen Fey, Fate, Illusion, Life, Light, Mind, Nature, Protection, Telekinesis, Time, War, Warp, Weather
- Spheres of Might: Practitioner Level (own progression), 22 martial spheres (Alchemy, Athletics, Barrage, Barroom, Beastmastery, Berserker, Brute, Counter, Dual-Wielding, Equipment, Fencing, Gladiator, Guardian, Leadership, Scoundrel, Scout, Shield, Sniper, Tinkerer, Trap, Warleader, Wrestling), martial talents
- Martial Focus: a regainable boolean/resource (regain by full attack/refocus); expend to power talents or treat a Str/Dex/Con save die as a 10
- Spheres of Guile: skill/social spheres + skill talents, gated by skill ranks; no dedicated pool
- Casting/Martial Traditions: a bundle of drawbacks (each grants bonus talents) + boons + the CAM choice — character-customization layer
- Gestalt rule: combine talents + spell pools across Spheres classes, use highest caster/practitioner level; class-ability CL boosts don't stack

**Data model.** New optional top-level block `character.spheres` (Zod `spheresBlockSchema`, optional on the character schema), revealed only when any of the three module keys is enabled. Sub-shape:\n\n`spheres.power?: { enabled, casterClasses: SphereCasterEntry[], spellPoints: ResourceRef, tradition?: CastingTraditionEntry, knownSpheres: KnownSphereEntry[], talents: SphereTalentRef[], notes }`\n- `SphereCasterEntry { id, className, presetKey?, castingProgression: enum['high','mid','low'], casterLevel: numberOrFormula (default '@{...}' from class level + progression), classLevel: int, castingAbility: abilityKeySchema }` — mirrors `spellcasterEntrySchema` so multi-class/gestalt combine.\n- `spellPoints` reuses the existing `resourceRefSchema` ({ id, label:'Spell Points', max: formulaRef '@{spheres.power.maxSpellPoints}', current, per:'rest' }).\n- `CastingTraditionEntry { id, name, castingAbility: abilityKeySchema, drawbacks: TraditionDrawbackRef[], boons: TraditionBoonRef[], bonusTalents: int }` (drawbacks grant bonusTalents).\n- `KnownSphereEntry { id, sphereKey: enum of the 20/22, name, source: sourceRefSchema }`.\n- `SphereTalentRef { id, compendiumId?, sphereKey, name, talentType: enum['base','talent','advanced','drawback'], system: enum['power','might','guile'], summary?, fullText?, spellPointCost?: numberOrFormula, grantsModifiers?: ModifierEntry[], grantsResources?: ResourceRef[], source }` — cached text fields mirror `spellRefSchema`'s paste-time caching so read/API/offline render with no DB round-trip.\n\n`spheres.might?: { enabled, practitionerClasses: PractitionerEntry[], practitionerLevel: numberOrFormula, martialFocus: ResourceRef (max:1, per:'encounter'), knownSpheres: KnownSphereEntry[], talents: SphereTalentRef[], tradition? }` — PractitionerEntry mirrors the caster entry with a `practitionerProgression` enum.\n\n`spheres.guile?: { enabled, knownSpheres, talents, notes }` (no pool).\n\nExtends existing blocks via the modifier system rather than new fields: sphere talents that grant static bonuses emit `ModifierEntry[]` (reusing `modifierEntrySchema` + `bonusType`) targeting `save.all`, `skill.<name>`, `ac`, `attack.all`, etc., so they flow through the existing buckets with no engine special-casing. New derived read-only outputs (casterLevelTotal, maxSpellPoints, msb, msd, sphereSaveDc, sphereConcentration) live on the ComputedCharacter, not the schema.

**Engine.** In `packages/pathforge-rules-pf1e/src/compute.ts`, gate a `computeSpheres(character)` pass behind `isModuleKeyEnabled(character,'spheres_of_power' | 'spheres_of_might' | 'spheres_of_guile')` (no-op + no output when off, like spellcasting). It must compute, each as a `CalculationResult` with `terms` for Show-Math:\n- per-caster `casterLevel` from `castingProgression` (high = classLevel, mid = floor(classLevel*3/4), low = floor(classLevel/2)) using the formula engine; `casterLevelTotal` = sum across Spheres casters of their progression-applied CL, but apply the gestalt/highest rule when classes are gestalt-linked (don't double-count CL boosts).\n- `maxSpellPoints` = Σ(casting class levels) + CAM(highest casting ability mod across casters per tradition); write into the `spellPoints` resourceRef `max` (the pool already reuses resourceRef, so the daily-uses tracker/Buff Center reset logic works unchanged).\n- `msb` = Σ casting class levels; `msd` = 11 + msb.\n- `sphereSaveDc` = 10 + floor(casterLevelTotal/2) + CAM; `sphereConcentration` bonus = msb + CAM (surface the bonus, not a roll).\n- For Might: `practitionerLevel` via progression; `martialFocus` is a 1-max resourceRef (engine just validates max=1).\n- Fold sphere-talent `grantsModifiers[]` into `buildModifierIndex` exactly like feats/items already do: iterate `spheres.*.talents[].grantsModifiers` and `push(classifyTarget(m.target), modifierEntryToMod(...))`. Talent `grantsResources[]` are surfaced as additional tracked pools. No new bucket types are needed — sphere bonuses reuse `save.all`, `attack.all`, `skill.all`, `ac`, ability buckets. Add a small `caster level` resolver path (`@{spheres.power.casterLevelTotal}`) so sphere-scaling formulas and talent spellPointCost formulas (`@{...}`) resolve via the existing CharacterResolver.

**Editor UI.** A new left-sidebar "Spheres" section in `components/character/editor/` (e.g. `spheres-editor.tsx`), revealed in the Abilities/Spells region only when a sphere module is enabled (Settings → Optional rules already toggles `spheres_of_power/might/guile`). Tabs/subsections inside it: (1) Power — caster-class rows (class, progression high/mid/low, casting ability) with a live readout of Caster Level, Spell Points max/current, MSB/MSD, sphere save DC; a Casting Tradition picker (drawbacks add bonus talents). (2) Known Spheres — multiselect of the 20/22 spheres. (3) Talents — the compendium picker (see below) listing picked talents grouped by sphere, each showing cached summary + spell-point cost; remove/reorder. (4) Might — practitioner rows + Martial Focus tracker + martial spheres/talents. (5) Guile — skill spheres/talents. Reuse `NumberField` for current-pool entry and the existing `resourceRef` tracker control used by feature daily-uses for the spell-point/martial-focus pools. The Buffs tab already ingests resourceRef pools, so spell points appear in bulk rest actions for free.

**Read surface.** On the read dashboard (`components/character/character-dashboard.tsx`) add a privacy-gated "Spheres" card cluster fed by the §15 view-model (`lib/character/view-model.ts` gains a `vm.spheres` section, gated like `vm.spellcasting`): a Magic summary (Caster Level, Spell Points current/max as a pool meter reusing the resource meter, MSB/MSD, sphere save DC, concentration bonus, casting tradition), a Spheres & Talents list grouped by sphere (base ability + talents, each with cached summary/spell-point cost so anonymous/offline/API render without DB), and parallel Might (Practitioner Level, Martial Focus pip, martial spheres/talents) and Guile cards. View-model must re-apply the viewer's section gating (the M7/M9 privacy-leak class): when the spheres section is private, gate it the same way abilities/spellcasting are. API/view shapes: add `spheres` to the public/anonymous view-model only when not private; the per-talent cached text is what surfaces (never a raw DB lookup). Privacy: tradition drawbacks and full talent text can be GM-sensitive — honor the section privacy level; default to summary-only on public.

**Compendium / parser.** Yes — this is the flagship compendium + paste-parser case. Mirror the proven spell_compendium infra exactly. Add a `public.sphere_talents` Postgres table (columns: id, system enum['power','might','guile'], sphere_key, name, talent_type enum['base','talent','advanced','drawback','boon'], summary, full_text, spell_point_cost, prerequisites, source_book, tsv search column + detail columns cached onto the ref), seeded separately (preserved like spell_compendium, never dropped). Add a `search_sphere_talents(query, system, sphere_key)` RPC modeled on `search_spell_compendium` (migrations 0008/0009/0013) — ranked name→sphere→summary→full_text, debounced, wildcard-safe, service-safe. The editor talent picker mirrors `spell-picker.tsx`: filter by system + known sphere + level/CL relevance, paste-time cache the detail fields onto `SphereTalentRef` (so read/API/offline need no round-trip). It SHARES infra with spell_compendium (same RPC pattern, same cached-ref-on-character pattern, same picker shape) but is a separate table/RPC because the row shape (talent_type, spell_point_cost, no spell level/school) differs. A paste-parser ImportAdapter-style helper (under `packages/pathforge-importers` or a local parser) lets users paste a block of talent names/text from a sheet and fuzzy-match them to compendium rows, falling back to a custom `SphereTalentRef` with the raw text preserved (never silently discard — same contract as the import adapters).

**Phases:**
1. Phase 0 — Schema + types: add optional `character.spheres` block (power/might/guile sub-schemas, SphereCasterEntry/PractitionerEntry/KnownSphereEntry/SphereTalentRef/CastingTraditionEntry) reusing resourceRef + modifierEntry; factory defaults; parse/round-trip unit tests. Shippable: schema validates, no UI.
2. Phase 1 — Engine (Power): computeSpheres caster-level progression, maxSpellPoints, MSB/MSD, sphere save DC + concentration as CalculationResults with terms; fold talent grantsModifiers into buildModifierIndex; resolver path @{spheres.power.casterLevelTotal}. Unit tests vs canonical examples (e.g. Wizard6/Ranger6 → 13 SP). Shippable behind toggle.
3. Phase 2 — Sphere talent compendium: migration adding public.sphere_talents + search_sphere_talents RPC (mirror 0006/0008/0009/0013); seed core Power talents; typed client regen. Shippable: searchable table, no UI.
4. Phase 3 — Editor (Power): spheres-editor.tsx section gated by spheres_of_power, caster rows + live readouts, tradition picker, known-spheres multiselect, talent picker reusing spell-picker pattern with paste-time caching + resourceRef pool tracker. Adversarial review pass.
5. Phase 4 — Read surface + view-model + API: gated vm.spheres section (re-apply viewer gating — privacy-leak guard), dashboard Spheres cards + pool meter, public/anonymous shapes from cached talent text. Privacy + render tests ('public never leaks private').
6. Phase 5 — Spheres of Might: practitionerLevel progression, Martial Focus resourceRef, martial spheres/talents in compendium + editor Might tab + read card. Shippable.
7. Phase 6 — Spheres of Guile + paste-parser + gestalt: guile spheres/talents (skill-rank gated), the paste-block talent parser (fuzzy-match → compendium, preserve unmatched), and gestalt CL/pool-combination rule (highest level, no double CL). Final adversarial review + import round-trip test.

**Dependencies:** optional-rules.ts — toggles spheres_of_power/spheres_of_might/spheres_of_guile already exist in rules.modules[]; gating uses isModuleKeyEnabled (no schema change needed there); resourceRefSchema (common.ts) — reused for the spell-point pool and martial-focus pool; ties into Buff Center bulk rest/reset; modifierEntrySchema + classifyTarget/buildModifierIndex (compute.ts) — sphere-talent static bonuses ride existing buckets (save.all/skill.all/attack.all/ac/abilities); spell_compendium infra (migrations 0006/0008/0009/0013 + spell-picker.tsx) — the sphere_talents table/RPC/picker is a direct mirror; shares pattern, separate table; §15 view-model (lib/character/view-model.ts) — must add a gated vm.spheres section and re-apply viewer gating (privacy-leak class fixed in M7/M9); import pipeline (packages/pathforge-importers) — the paste-parser should follow the ImportAdapter 'never silently discard' contract and could be surfaced as an adapter; CharacterResolver formula engine — new @{spheres.power.casterLevelTotal} resolver path for sphere-scaling + talent spellPointCost formulas; class-catalog.ts — Spheres base classes (Incanter, Mageknight, etc.) would eventually want presets, parallel to existing class presets

**Risks:**
- Caster Level is NOT class level — it has its own high/mid/low progression and is the most-confused mechanic; getting the per-class progression + gestalt 'highest, don't stack CL boosts' rule right is the central correctness risk
- Spell points = casting-class levels + CAM (not caster level + CAM); easy to mis-implement — anchor to the canonical Wizard6/Ranger6 = 13 example
- CAM is per casting tradition (Int/Wis/Cha), and a character can have multiple casters; deciding which CAM feeds DCs/pool in multi-tradition/gestalt builds needs an explicit rule (typically per-class for that class's effects)
- Talent spell-point costs and augments scale with caster level/CAM via formulas — the @{...} resolver must expose caster level; mis-scaled augments under/over-cost the pool
- MSB/MSD vs SR-bearing creatures and counterspelling are opposed checks, not flat numbers — surface MSB/MSD and concentration as bonuses, don't pretend to roll
- Hundreds of talents with prose abilities — most can't be fully automated; design must preserve full talent text (cached) and only auto-apply the subset that emits clean ModifierEntry[], flagging the rest as informational (avoid over-promising automation)
- Casting/martial traditions: drawbacks grant bonus talents and alter mechanics (e.g. somatic/verbal-free, energy focus) — the bonus-talent count must feed talent budget but most drawback effects are narrative; scope the mechanical subset carefully
- Martial Focus is a binary-ish encounter resource with many regain/expend triggers; modeling it as a max-1 resourceRef is right but the talent gating ('requires/expends focus') is largely textual
- Privacy: full talent text + tradition drawbacks can be GM-sensitive; the view-model MUST re-apply section gating (the exact privacy-leak class caught in M7/M9 audits) — default public to summary-only
- Ultimate vs original Spheres differ (20 vs 22 spheres, Blood/Fallen Fey/Universal); pick Ultimate as canonical superset to avoid enum churn, and keep sphereKey an extensible enum/string for 3pp expansions

---

## Akashic Magic (Akashic Mysteries / Akashic Trinity, Dreamscarred Press 3pp; the `akashic` module key already exists in OPTIONAL_RULE_MODULES)  — **L**

**Summary.** Akashic Magic is a Dreamscarred Press veilweaving subsystem for PF1e. Its three mechanical pillars are: (1) ESSENCE — a personal pool of points (fixed per class level, e.g. Vizier 2→30, Guru 2→20 across L1-20; pools from multiple veilweaving classes add into one shared pool) that is INVESTED into receptacles (veils, feats, class features, items) rather than spent; investment is reconfigurable (freely during daily prep, and a limited swift-action reinvest in combat). (2) VEILS — semi-permanent magic constructs the character "shapes" each day after rest from a veils-known list into distinct CHAKRA SLOTS (hands, feet, head, wrists, shoulders, headband, neck, belt, chest, body, plus ring/blood on some); a class shapes a fixed number of veils/day. Each veil has a base effect, an essence section scaling with invested essence, and a chakra-bind section. (3) CHAKRA BINDS — unlocked progressively per class (Vizier: every 2 levels hands→feet→head→wrist→…; Guru: every 3), binding a shaped veil to its chakra unlocks stronger abilities. The veil save DC = 10 + essence invested in that veil + veilweaving ability mod (Int for Vizier, Wis for Guru, etc.). Essence CAPACITY per single receptacle is capped by character level: 1 (L1-5), 2 (L6-11), 3 (L12-17), 4 (L18-20).

**Core mechanics:**
- Essence pool: a per-class fixed total by class level (Vizier 2,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,24,26,28,30; Guru tops at 20); multiple veilweaving classes' pools ADD into one shared personal pool
- Essence investment (not expenditure): essence is allocated into receptacles; allocation is reconfigured freely during daily prep and via a limited swift-action reinvest during play
- Essence capacity per receptacle (cap on essence in ONE veil/feat/item): 1 at L1-5, 2 at L6-11, 3 at L12-17, 4 at L18-20 (character level, modifiable by feats/features)
- Veilweaving ability score per class (Int=Vizier, Wis=Guru, Cha/others) drives the veil save DC and sometimes bonus essence
- Veil save DC = 10 + essence invested in that veil + veilweaving ability modifier (per-veil, not flat)
- Veils known list + veils shaped/day (fixed by class table, e.g. Vizier 1→11, Guru 1→8); shaped daily after rest, each into a distinct chakra slot
- Chakra slots: hands, feet, head, wrists, shoulders, headband, neck, belt, chest, body (+ ring, blood, hands(2)/feet(2)/ring(2) paired variants on some veils)
- Chakra binds: unlocked progressively per class in a fixed slot order/cadence (Vizier every 2 levels, Guru every 3); a shaped veil bound to its chakra unlocks its bind ability
- A veil occupies a chakra slot whether or not it is bound; only one veil per slot; binding consumes the slot for binding too
- Veilshifting / class capstones (e.g. Vizier veilshifting grants temporary essence = 3 + Int mod for 3 rounds) — class-specific, modeled as resources/notes not core engine

**Data model.** New optional block `character.akashic` (akashicBlockSchema), gated by the existing `akashic` module key, mirroring spellcasting.ts structure:

`akashicClassEntrySchema` (one per veilweaving class, analogous to spellcasterEntry): { id: string; className: string; presetKey?: string; veilweavingAbility: abilityKeySchema (default "int"); classLevel: z.number().int(); /* fixed progression table keyed by class level → essence total + veils shaped, seeded from catalog */ essenceTable?: z.record(z.string(), z.number().int()); veilsShapedTable?: z.record(z.string(), z.number().int()); /* override paths if a class differs */ essence: numberOrFormulaSchema.optional(); /* manual override when not auto */ veilsShaped: z.number().int().optional(); autoProgression: z.boolean().default(true); /* chakra binds unlocked: ordered slot list this class has access to at current level */ unlockedBinds: z.array(chakraSlotSchema).default([]); saveDcFormula: z.string().default("") }

`chakraSlotSchema = z.enum(["hands","feet","head","wrists","shoulders","headband","neck","belt","chest","body","ring","blood","hands2","feet2","ring2"])`

`veilRefSchema` (compendium-cached, mirrors spellRefSchema): { id: string; compendiumId?: string; name: string; classKeys: z.array(z.string()); /* which veil lists */ slots: z.array(chakraSlotSchema); /* slots it MAY be shaped into */ source?: sourceRefSchema; descriptor?: string; savingThrow?: string; baseEffect?: string; essenceEffect?: string; bindEffects?: z.record(z.string(), z.string()); /* chakra→bind text */ notes?: string }

`shapedVeilSchema` (the per-day loadout, analogous to preparedSpell): { id: string; veilId: string; /* -> veilRefSchema.id */ classId?: string; /* which akashic class shaped it */ slot: chakraSlotSchema; /* the chosen slot */ essenceInvested: z.number().int().min(0).default(0); bound: z.boolean().default(false); /* bind chakra (true only if class unlocked that slot's bind) */ enabled: z.boolean().default(true) }

`akashicBlockSchema = z.object({ classes: z.array(akashicClassEntrySchema).default([]); veilsKnown: z.array(veilRefSchema).default([]); shaped: z.array(shapedVeilSchema).default([]); /* non-veil receptacles (feats/class features/items) you can also pour essence into */ otherReceptacles: z.array(z.object({ id: z.string(), label: z.string(), essenceInvested: z.number().int().default(0), notes: z.string().optional() })).default([]) })`

EXTENDS existing blocks: add `akashic` to character.ts assembly (optional via `.default(() => emptyAkashic)` in factory so non-akashic sheets are untouched); reuse resourceRefSchema in `character.resources` for the essence POOL display (id "akashic-essence", max = computed total, current = total − sum invested). Reuse modifierEntrySchema embedded on veilRef/shapedVeil for the typed bonuses a shaped+invested veil grants (e.g. a veil giving +essence natural armor → modifierEntry{ target:"defenses.armorClass", bonusType:"natural_armor", value:"@{essenceInvested}" }).

**Engine.** Add `computeAkashic(character, abilities, resolver)` in compute.ts, called from computeCharacter() alongside computeSpellcasting, ONLY when the akashic module is enabled (isModuleKeyEnabled). It must compute:
1. Per class entry: essence total (autoProgression → essenceTable[classLevel]; else manual) and veils shaped allowed (veilsShapedTable[classLevel]).
2. POOL TOTALS: sum essence across all akashic classes into one sharedEssence total; sum essenceInvested across shaped[] + otherReceptacles[] into investedEssence; expose available = total − invested (warn if negative = over-invested).
3. ESSENCE CAPACITY by character level: cap = 1/2/3/4 by L1-5/6-11/12-17/18-20 (derive from progression.level.total); flag any shaped veil whose essenceInvested > cap.
4. PER-VEIL SAVE DC: for each shaped veil, dc = 10 + essenceInvested + abilities[class.veilweavingAbility].mod, emitted as a ComputedValue with terms (drives Show Math). Custom saveDcFormula override supported, injecting @{essenceInvested} as resolver.local (exactly like computeSpellcasting injects @{spellLevel}).
5. BIND VALIDITY: a shaped veil may be `bound:true` only if its slot is in that class's unlockedBinds; emit a warning otherwise. Enforce one-veil-per-slot (warn on slot collisions).
6. FEED THE MODIFIER BUCKETS: in buildModifierIndex, after buffs/items/features, iterate enabled shaped veils and push their embedded modifierEntries through classifyTarget() into the existing domain buckets (ac, save.*, skill.*, ability.*, attack.*, speed, init). Formula values like "@{essenceInvested}" or "@{essenceInvested}*2" are resolved by the base resolver (the same path effectToMod already uses for formula buff effects), so a veil's bonus scales with how much essence is currently invested — this is the key reuse of the existing bonus engine and means no new stacking logic is needed (applyStacking handles bonus-type stacking as-is). Bound veils may push an additional/stronger modifier set (bindEffects → modifiers) gated on `bound`.
Engine never reads rules text; all numbers come from the seeded tables + invested essence.

**Editor UI.** New "Veils" section in the editor left "Sheet Sections" sidebar (under a new "Akashic" group or within Spells), revealed only when isModuleKeyEnabled(character,"akashic"). Mirrors spellcasting-editor.tsx + spell-picker.tsx:
- Akashic Classes sub-editor: add/remove veilweaving class rows (className, veilweaving ability dropdown, classLevel via NumberField, autoProgression toggle; presetKey-linked catalog seeds essenceTable/veilsShapedTable/bind cadence like CLASS_CATALOG seeds caster entries). Shows computed essence total + veils-shaped allowance + unlocked binds for that class.
- Essence Pool panel: live readout of total / invested / available essence and the per-receptacle capacity cap, with an over-invested warning (reuses the live recompute + ConflictBanner-style warning surface).
- Veils Known: a veil compendium PICKER (VeilPicker, modeled on spell-picker.tsx) backed by the search RPC; picked veils cache their detail fields onto veilsKnown[] (paste-time caching, the proven pattern). Custom-veil form for homebrew (custom:true source), like custom buffs.
- Shaped (daily loadout): a grid of chakra slots (hands/feet/head/…); per slot, pick a known veil whose `slots` include it, set essenceInvested (NumberField, clamped to capacity cap), and a Bind checkbox enabled only if the class unlocked that slot. Live deltas show the affected values changing (reusing the buff-center activeBuffDelta/preview pattern). "Shape for the day" / reset action.
All gated behind the module toggle in Settings → Optional rules & 3pp (already wired).

**Read surface.** New "Veils & Essence" card on character-dashboard.tsx, gated by a new privacy section key ("akashic") in the §15 view-model so it can be hidden from public/party/GM viewers like spellcasting. View-model adds `vm.akashic` (built only when module enabled AND section visible to the viewer): { essence: { total, invested, available, capacityPerReceptacle }, classes: [{ className, veilweavingAbility, veilsShaped, unlockedBinds }], shaped: [{ name, slot, essenceInvested, bound, saveDc, descriptor, baseEffectSummary }] }. The card renders the essence pool (total/invested/available), a chakra-slot map of shaped veils with their invested essence + computed save DC + a bound badge, and per-class essence/veils stats. The detailed view expands each veil's base/essence/bind effect text (cached on the ref, so it renders for anonymous/offline viewers with no DB round-trip — same as cached spell detail). Privacy: essence amounts and shaped loadout are sensitive (reveal a build), so the akashic section defaults to gm_only/party like spells; the public API surface (api-shapes) exposes at most a veil COUNT + class names unless the section is public, mirroring how abilities/spells are gated. CMB/CMD-style summary chips (essence available, veils shaped X/Y) on the overview.

**Compendium / parser.** YES — a veil compendium is a strong fit and should mirror the proven spell_compendium infrastructure almost exactly. Veils are the discrete, numerous options (hundreds across Vizier/Guru/Daevic/Nexus/Radiant/Eclipse lists), each with structured fields (name, class lists, slots, descriptor, saving throw, base/essence/bind text) — the same shape that made spell_compendium worth a searchable table. Proposed: a new Postgres table `public.veil_compendium` (id, name, source/book, class_keys text[], slots text[], descriptor, saving_throw, base_effect, essence_effect, bind_effects jsonb, search_text) + a `search_veil_compendium(query, class_key, slot)` RPC ranked name→class→slot→descriptor→text (clone of search_spell_compendium from migrations 0008/0009/0013, with the same wildcard-safe/debounced/service-role hardening). The VeilPicker caches the picked veil's detail fields onto veilsKnown[] at pick time (the same paste-time caching as spell refs → renders offline/anonymous with no round-trip). It SHARES infra with spell_compendium (identical migration template, RPC pattern, cached-ref approach, picker UI) but is a SEPARATE table because the column set differs (slots/bind_effects vs spell levels/school). For homebrew veils not in the table, the custom-veil form writes a veilRef with source.custom=true (no compendium row), exactly like custom buffs/spells. A bulk paste-parser (paste a veil statblock → parse name/slot/essence/bind sections) is a reasonable Phase-4 add but lower priority than the picker, since most veils will come from the seeded table.

**Phases:**
1. Phase 0 — Schema + factory: add akashic.ts (akashicBlockSchema, chakraSlotSchema, veilRefSchema, shapedVeilSchema, akashicClassEntrySchema), wire optional `akashic` into character.ts, default-empty in factory.ts so existing sheets parse unchanged, add unit tests (parse/default/round-trip). Seed a small static AKASHIC_CLASS_CATALOG (Vizier, Guru to start) with essenceTable/veilsShapedTable/bind cadence. Shippable: schema validates, no UI yet.
2. Phase 1 — Engine: computeAkashic() (essence total/invested/available, per-receptacle capacity cap, per-veil save DC with terms, bind-validity + slot-collision warnings), hook shaped-veil modifierEntries into buildModifierIndex via classifyTarget (formula values like @{essenceInvested} resolved by base resolver). Unit tests proving a +essence natural-armor veil raises AC and the DC math + capacity cap. Reuse resourceRef for the essence pool readout.
3. Phase 2 — Editor section: akashic-editor.tsx (classes sub-editor, essence pool panel, shaped chakra-slot grid with capacity-clamped essence + bind toggles), gated by the akashic module toggle; live recompute + over-invested warning. Custom-veil form. Veils typed manually for now (no compendium yet).
4. Phase 3 — Veil compendium + picker: migration `0017` veil_compendium table + search_veil_compendium RPC (clone of spell-search infra incl. 0009/0013 hardening + detail columns), seed veil data, VeilPicker component caching detail fields onto veilsKnown[]. Replaces manual veil entry with search-and-pick.
5. Phase 4 — Read surface + privacy + API: vm.akashic in the §15 view-model behind a new `akashic` privacy section key, Veils & Essence dashboard card (essence pool + chakra map + save DCs + bind badges), overview summary chips, gated public/API exposure (count-only unless public), detailed effect text from cached refs. Adversarial privacy review (akashic must respect viewer gating, must not leak build details to public).
6. Phase 5 (deferred tail) — additional classes (Daevic/Nexus/Radiant/Eclipse) into the catalog, veilshifting/class-capstone temp-essence resources, bulk veil paste-parser, import/export adapter coverage (Foundry akashic-magic module maps onto this block).

**Dependencies:** optional-rules.ts — the `akashic` module key already exists; gating reads isModuleKeyEnabled(character,'akashic'); compute.ts — buildModifierIndex/classifyTarget/CharacterResolver (formula resolution of @{essenceInvested}) and the applyStacking bonus engine; computeAkashic slots in next to computeSpellcasting; common.ts — resourceRefSchema (essence pool), modifierEntrySchema (veil-granted typed bonuses), numberOrFormulaSchema, abilityKeySchema, sourceRefSchema; spellcasting.ts + spell-picker.tsx + class-catalog.ts — structural templates to mirror (caster entry → akashic class entry; spellRef cached-detail → veilRef; CLASS_CATALOG seeding → AKASHIC_CLASS_CATALOG); spell_compendium infra (migrations 0006/0008/0009/0013) — the veil_compendium table + search RPC clone this pattern; lib/character/view-model.ts §15 + privacy block — needs a new `akashic` privacy section key + gating; lib/character/api-shapes.ts for the gated public/API exposure; Potential conflict/overlap: Spheres of Power (also a 3pp magic subsystem) is independent but shares the 'module-gated optional magic section' UX slot; both can coexist as separate optional blocks. Mythic (veilshifting/akashic mythic) interacts at the tail (Phase 5).

**Risks:**
- Essence is INVESTED, not spent — the engine must treat invested essence as a live allocation that drives both save DCs AND scaling bonuses simultaneously; getting the available = total − invested accounting + the per-receptacle capacity cap right (and over-invest warnings) is the core correctness risk
- Formula-valued veil bonuses (@{essenceInvested}) create a dependency: a veil's AC/save bonus changes as essence is re-allocated; must resolve through the base resolver (no circular dep) exactly like existing formula buff effects, and recompute on every essence edit
- Multiple veilweaving classes share ONE essence pool but have SEPARATE veils-shaped counts, separate veilweaving abilities (so per-veil DC depends on WHICH class shaped it), and separate bind unlock orders/cadences (Vizier every 2 vs Guru every 3) — the model must attribute each shaped veil to a class
- Chakra slot semantics: a veil occupies a slot whether bound or not; only one veil per slot; binding requires the class to have unlocked that slot's bind; paired slots (hands(2), feet(2), ring(2)) and multi-slot veils (a veil listing several legal slots) complicate the slot grid
- Save DC is per-veil (10 + invested + ability mod), NOT a flat class DC — easy to mis-model as a single number; must compute per shaped veil and surface in Show Math
- Privacy: shaped loadout + essence allocation reveal a character's build/tactics; must gate like spells (default gm_only/party) and ensure the public API never leaks the full shaped list — same privacy-leak class the M7/M9 reviews caught
- Class essence/veils tables vary per class and some are non-monotonic edge cases (Guru L18 essence stays 17); seed exact published tables rather than deriving from a formula
- Veilshifting/temporary-essence and capstone abilities are class-specific and time-limited (e.g. 3 rounds) — model as notes/resources in a later phase, don't force into the core essence accounting

---

## Psionics (Pathfinder 1e, Dreamscarred Press — Psionics Unleashed / Ultimate Psionics; the "Psionic (system)" + "Psionic Game Mastery" pages on the Library of Metzofitz wiki reproduce this ruleset)  — **XL**

**Summary.** PF1e Psionics is a point-based spellcasting analogue. Instead of per-level slots, a manifester has a single per-day POWER POINT pool (base from a class table + bonus from a high key ability) and a list of POWERS KNOWN; manifesting a power spends power points. Its core mechanical pillars are: (1) a power-point pool reset on rest; (2) a manifester level (ML, usually = levels in psionic classes) that gates the maximum power level known and HARD-CAPS the most power points spendable on a single manifestation (you can never spend more PP on one power than your ML); (3) augmentation — spending extra PP at manifest time to scale a power, bounded by that ML cap; (4) six disciplines (clairsentience, metacreativity, psychokinesis, psychometabolism, psychoportation, telepathy) that flavor a psion's specialization and grant a discipline talent/restricted opposed disciplines; (5) psionic focus — a binary "focused/unfocused" state you gain by concentrating and expend to fuel psionic feats. Classes: Psion (Int), Psychic Warrior (Wis), Wilder (Cha, with wild surge/psionic enervation), Soulknife (forms a mind blade, largely non-PP), Vitalist/Tactician/Aegis/Cryptic/Dread/Marksman from Ultimate Psionics. Powers are the discrete options (hundreds) — a perfect compendium + paste-parser candidate that mirrors the existing spell_compendium infrastructure.

**Core mechanics:**
- Power point (PP) pool: per-day max = class base table value (by manifester level 1-20) + bonus PP from key ability modifier. Reset on rest. Single pool even with multiple psionic classes (pools from different classes effectively combine via total ML for most purposes but each class has its own powers-known/level limits).
- Bonus power points: equal to key-ability-modifier x manifester-level x 1/2 (rounded down), per the standard table. Key ability 9 or lower = cannot manifest from that class.
- Manifester level (ML): typically = levels in the psionic class (full manifesters); partial manifesters (psychic warrior, soulknife discipline powers) use reduced ML. Drives DCs, augmentation scaling, range/duration, and dispel-like checks.
- Maximum power level known: capped by ML/class table (full manifester reaches 9th-level powers at ML 17; psychic warrior caps at 6th).
- Powers known: a fixed list learned at level-up (NOT prepared daily) — a manifester can spend PP on ANY power he knows, any number of times, until the pool is empty. This is the key structural difference from Vancian slots.
- Power point cost limit: the total PP spent on a single manifestation (base power cost + augmentation + metapsionic surcharge + any feat cost) can NEVER exceed the manifester's ML. This single rule governs all augmentation.
- Augmentation: many powers list 'Augment' clauses ('For every additional power point you spend, ...'). Spending extra PP scales effect/DC/duration/targets, bounded by the ML cap. Augmenting a power by enough also raises the effective spell/power level for save-DC purposes (+1 power level per X PP for some powers).
- Save DC of a power: 10 + power level + key ability modifier (augmentation can raise effective power level and thus DC).
- Disciplines: a psion picks one of six as a specialization (becomes a seer/shaper/kineticist/egoist/nomad/telepath), gaining a discipline talent and usually 1-2 restricted/opposed disciplines whose powers cost +1 PP or are forbidden. Generalist psions skip this.
- Psionic focus: a binary state. Spend a full-round action concentrating (Concentration/autohypnosis-style check, DC 20) to 'become psionically focused'. You hold one focus; you 'expend focus' to power psionic feats (Psionic Weapon, Deadly Meditation, Wild Talent prerequisites, etc.). Maintaining/regaining focus is core action economy.
- Psionic feats: feats with the [Psionic] descriptor, many of which require/expend psionic focus. Psionic Shot, Greater/Empower/Maximize (metapsionic) feats add a PP surcharge to a manifestation (still bounded by the ML cap).
- Soulknife: forms a 'mind blade' (a quasi-weapon scaling with level, enhancement bonus, blade skills) — mostly NOT power-point based; needs its own small block, not the PP/powers model.
- Wilder: wild surge (boost ML at risk) + psionic enervation (backlash dazing the wilder) — a wilder-specific toggle/track.
- Psicrystal: a personality-fragment companion granted by the Psicrystal Affinity feat (Int-based, grants a skill/save bonus + abilities) — minor, feature-level.

**Data model.** New optional block character.psionics (gated by rules.modules psionics / isModuleKeyEnabled(c,"psionics")), mirroring spellcastingBlockSchema. Concrete Zod:

psionicClassEntrySchema (mirrors spellcasterEntrySchema):
 { id: string; className: string; archetype?: string; presetKey?: string;
   manifesterType: enum["full","partial","none"] (default "full");
   manifesterLevel: numberOrFormulaSchema (default 0);
   classLevel?: int;  // indexes powerPointTable, distinct from ML for partials
   keyAbility: abilityKeySchema (default "int");          // psion=int, psy.war=wis, wilder=cha
   saveDcFormula: string (default "10 + @{powerLevel} + @{keyAbilityMod}");
   maxPowerLevel?: int;                                   // derived if autoTable
   conditionalModifiers: modifierEntrySchema[];           // ML/PP boosts (buffs/items)
   discipline?: enum["clairsentience","metacreativity","psychokinesis","psychometabolism","psychoportation","telepathy","generalist"];
   restrictedDisciplines: string[] (default []);          // opposed/forbidden
   autoTable: boolean (default false);                    // engine derives pool+max from table
   powerPointTable?: Record<classLevel"1".."20", number>; // base PP/day, seeded from POWER_POINT_TABLES
   powersKnownTable?: Record<classLevel, number>;         // count of powers known
   maxPowerLevelTable?: Record<classLevel, number>; }     // highest manifestable power level

powerPointPoolSchema — REUSE resourceRefSchema directly: psionics.pool: resourceRefSchema with { id:"psionic-power-points", label:"Power Points", max: numberOrFormula (engine fills), current:number, per:"rest" }. (A single shared pool; per-class base contributions tracked in a derived breakdown, not stored separately.)

powerRefSchema (mirrors spellRefSchema; the compendium ref):
 { id; compendiumId?: string; name; level: int 0..9; classId?: string (links to psionicClassEntry.id);
   discipline?: string; subdiscipline?: string;
   // cached detail fields from power_compendium at pick time (offline/anon-safe, no DB round-trip):
   displayType?: string; powerPointsCost?: string; range?: string; duration?: string;
   savingThrow?: string; powerResistance?: string; augment?: string; description?: string;
   source?: sourceRefSchema; notes?: string; }

knownPowerEntrySchema = powerRefSchema.extend({ favored?: boolean, atWill?: boolean }).
psionicFocusSchema: { focused: boolean (default false), max: int (default 1), note?: string }.
psionicFeatRefSchema: { id; name; expendsFocus: boolean; ppSurcharge?: numberOrFormula; descriptor:"psionic"|"metapsionic"|"psionic-item"; notes? } (could also live in feats with a [Psionic] tag; recommend tagging existing feats + a thin mirror here).
soulknifeBlockSchema (optional, only for soulknife): { mindBladeEnhancement: int, bladeSkills: {id,name,notes}[], formList: string[] }.
wilderSurgeSchema (optional): { surgeBonus: int, enervationLevel: int }.

psionicsBlockSchema = z.object({
  manifesters: psionicClassEntrySchema[] (default []),
  pool: resourceRefSchema.optional(),
  powersKnown: knownPowerEntrySchema[] (default []),
  focus: psionicFocusSchema (default),
  psionicFeats: psionicFeatRefSchema[] (default []),
  soulknife: soulknifeBlockSchema.optional(),
  wilder: wilderSurgeSchema.optional(),
}).
Wire into character.ts as optional block: psionics: psionicsBlockSchema.optional() (optional so non-psionic sheets stay unchanged and migration is additive). Add seeding tables in a new packages/pathforge-schema/src/psionic-tables.ts (POWER_POINT_TABLES, POWERS_KNOWN_TABLES, MAX_POWER_LEVEL_TABLES, bonusPowerPoints(mod, ml)) exported from index.ts, exactly like spell-tables.ts.

**Engine.** Add computePsionics(character, abilities, resolver) to packages/pathforge-rules-pf1e/src/compute.ts, modeled on computeSpellcasting, returning ComputedPsionics[] and a summary roll-up. For each manifester entry it must calculate:
- manifesterLevel: resolveNumberOrFormula(entry.manifesterLevel) + any modifier-bucket boosts. Add a new bucket via classifyTarget for targets like 'psionics.ml' / 'psionics.<id>.ml' so buffs/items (e.g. a power-boosting item, wilder surge) push ML the same way attack.all/save.all work.
- basePowerPoints: if autoTable, POWER_POINT_TABLES[className][classLevel]; else read entry.powerPointTable[classLevel].
- bonusPowerPoints: bonusPowerPoints(abilities[entry.keyAbility].modifier, ML) = floor(keyMod * ML / 2). Guard: keyAbility score <= 9 -> 0 PP (cannot manifest).
- maxPowerLevel: from MAX_POWER_LEVEL_TABLES (or entry.maxPowerLevel override).
- powersKnownAllowed: POWERS_KNOWN_TABLES value (for validation/UI vs actual powersKnown count).
- ppCostCap: the ML value itself — exposed as a ComputedValue so the editor/read sheet can show 'max PP per manifestation = ML' and the power-manifest UI can validate base+augment <= cap.
- saveDcByPowerLevel: for L in 0..maxPowerLevel, DC = 10 + L + keyMod (via saveDcFormula with @{powerLevel}/@{keyAbilityMod} resolved through resolver.local overlay, exactly like the spell-DC machinery).
Then aggregate the single shared pool: psionics.pool.max = sum of (base + bonus) across manifesters; write a ComputedValue with terms breaking down each class's base + each ability bonus (drives Show-Math). current is player-tracked (resourceRef).
Each value returns ComputedValue.terms for the formula inspector. Add a compact summary: summary.psionics?: { manifesterCount, totalPowerPoints, currentPowerPoints, highestPowerLevel, focused }. Honor formula overrides (overrideFor(character,'psionics.<id>.ml') etc.) like every other computed value. The PP COST CAP and augmentation are advisory/validation only — the engine does not auto-resolve a specific manifestation's cost (that is interactive at the table), it just exposes the cap + per-power augment text so the read/edit UI can enforce 'cannot exceed ML'.

**Editor UI.** A new left-sidebar 'Psionics' section under the Spells/Abilities group, revealed only when isModuleKeyEnabled(character,"psionics") (the toggle already exists in optional-rules.ts and is wired through the Settings 'Optional rules & 3pp' framework). Build components/character/editor/psionics-editor.tsx mirroring spellcasting-editor.tsx:
- Manifesters list: add/remove psionic class rows (className + presetKey via a psionic CLASS_CATALOG addition, keyAbility, classLevel, manifesterType, discipline dropdown + restricted disciplines, autoTable toggle). Live derived display of base PP, bonus PP, ML, max power level, PP cost cap.
- Power Point pool card: current/max with quick spend/restore steppers and a 'Rest (restore to max)' button — reusing the resourceRef pool controls already used for feature daily uses.
- Powers Known: a power-picker (components/character/editor/power-picker.tsx) mirroring spell-picker.tsx — debounced search against the new power_compendium via a search_power_compendium RPC, class/level/discipline-aware, ranked, wildcard-safe; picking caches detail fields onto knownPowerEntry. Plus a custom/manual power add and a paste-parser entry point.
- Psionic Focus: a focused/unfocused toggle + 'expend focus' button and a list of psionic feats that consume it.
- Augmentation helper: each known power shows its augment text + a small calculator validating base+augment PP <= ML cap (no eval; arithmetic only).
- Conditional gating of soulknife/wilder subforms by className/archetype. All inputs use NumberField (int coercion + label association) per existing conventions.

**Read surface.** Add a 'Psionics' card to components/character/character-dashboard.tsx, gated by the §15 privacy view-model (lib/character/view-model.ts must add a psionics section gate, defaulting to the same visibility tier as spellcasting, with vm.psionics built only when the abilities/spellcasting-class of section is visible — never leak power-point totals or powers-known to viewers below the gate, exactly like vm.spellcasting). Card shows: power-point pool (current/max with a bar), manifester level(s) + discipline, highest power level, focused/unfocused indicator, and a powers-known list grouped by level with cached detail rows (display, PP cost, range, duration, save, augment) — rendered from the cached refs so it works for anonymous/offline viewers with no DB round-trip. Extend the view-model/API shapes (lib/character/api-shapes.ts) with an optional psionics summary { totalPowerPoints, currentPowerPoints, manifesterLevel, discipline, highestPowerLevel, focused } added to the stats/summary endpoints, public-safe and only when the section is visible. Privacy consideration: powers known can be tactically sensitive — treat the powers list like the spell list (gated), and keep current PP (a resource a GM/party may or may not see) behind the same tier as HP/resources.

**Compendium / parser.** YES — strongly applicable and should share infra with spell_compendium. Powers are the discrete options (hundreds across Psionics Unleashed/Ultimate Psionics), structurally near-identical to spells: name, level, discipline (≈ school), subdiscipline (≈ subschool), descriptor, display, manifesting/casting time, range, duration, power-points cost, saving throw, power resistance (≈ spell resistance), AUGMENT clause, description, class level list. Build a new Postgres table public.power_compendium with the same column shape as spell_compendium plus power_points (text) + augment (text) + discipline columns, seeded separately from a powers dataset; add a search_power_compendium RPC cloned from search_spell_compendium (0008/0009) — class/level-aware via a class_levels jsonb (e.g. {\"Psion\":3,\"Psychic Warrior\":2}), ranked name→discipline→descriptor→description, wildcard-safe, SECURITY INVOKER under a public-read RLS policy. The power-picker caches selected detail fields onto knownPowerEntry (same offline/anon pattern). Paste-parser: yes — a 'paste a power statblock' textarea that regex-parses the canonical block format (Discipline line, Level line 'Psion/Wilder 3, Psychic Warrior 2', Display/Manifesting Time/Range/Duration/Power Points/Saving Throw/Power Resistance/Augment) into a powerRef, then optionally reconciles against power_compendium by name. This shares the import-adapter mindset (never silently discard: unmapped lines → notes) and mirrors how the spell picker + search RPC already work. NOTE: this XL piece (table + dataset sourcing + RPC + parser) is the bulk of scope and is sequenced as its own phase so the core PP/ML mechanics can ship first with manual power entry.

**Phases:**
1. Phase 1 (M, ships alone): Schema + tables + engine core. Add psionic-tables.ts (POWER_POINT_TABLES, POWERS_KNOWN_TABLES, MAX_POWER_LEVEL_TABLES, bonusPowerPoints), psionicsBlockSchema (manifesters + resourceRef pool + powersKnown + focus, no compendium yet — manual power entry), wire optional psionics block into character.ts, add the psionics ML modifier bucket + computePsionics() to compute.ts with full Show-Math terms, unit tests for PP/bonus/ML/maxPowerLevel/cost-cap math. Review.
2. Phase 2 (M): Editor + read surface behind the existing psionics toggle. psionics-editor.tsx (manifesters, pool with rest, manual powers known, focus, augment cost-cap validator), view-model psionics gate + dashboard Psionics card + api-shapes summary. Manual power entry only. Review.
3. Phase 3 (XL): Power compendium + picker + search RPC. Create power_compendium table (migration), source/seed the powers dataset, search_power_compendium RPC (clone of 0008/0009), power-picker.tsx (class/level/discipline-aware, cached refs). Replaces manual entry as the primary path. Review.
4. Phase 4 (M): Paste-parser for power statblocks (regex → powerRef, reconcile vs compendium, unmapped→notes) + import-adapter integration so imported sheets (Foundry pf1-pow flag, Mythweavers Spheres/psionics flags already detected) map power points/powers. Review.
5. Phase 5 (S, optional/deferred): Subsystem depth — soulknife mind-blade block, wilder wild-surge/enervation track, psionic-feat focus automation (expend-focus surcharges feeding the PP cap), psicrystal as a feature. Each toggled on by className/archetype.

**Dependencies:** optional-rules.ts: the 'psionics' module key + isModuleKeyEnabled gate already exist (no new toggle needed) — Phase 1 just builds behind it.; common.ts resourceRefSchema: reused verbatim for the power-point pool (per:'rest') — same control the editor already renders for feature daily uses.; compute.ts modifier buckets / classifyTarget: extend with psionics.ml (and psionics.<id>.ml) targets so buffs/items/wilder-surge boost ML through the existing typed-modifier machinery.; spell_compendium + search_spell_compendium (migrations 0006/0008/0009/0013): the proven blueprint the power_compendium table + search_power_compendium RPC clone, and the spell-picker → power-picker, share infra with.; view-model.ts §15 privacy gating: must add a psionics section gate alongside the spellcasting gate (same leak-prevention discipline that the M9 review fixed for abilities/spellcasting).; class-catalog.ts: add psionic class presets (Psion/Psychic Warrior/Wilder/Soulknife/Vitalist/etc.) so autoTable seeding + add-vs-update matching work like spellcaster presets.; Potential overlap with Spheres of Power/Path of War 'pool + talents/maneuvers' systems — keep the resourceRef pool + compendium pattern generic enough to be reused, but do not couple them.

**Risks:**
- The PP cost cap rule (total PP on one manifestation <= ML, counting base + augment + metapsionic surcharge + feat costs) is THE rule players get wrong — must be surfaced and validated everywhere augmentation appears, but kept advisory (the engine exposes the cap; it does not auto-resolve a live manifestation's chosen augment).
- Manifester level vs class level vs caster-level confusion for partial manifesters (psychic warrior ML often = class level but power access caps at 6th; multiclass psionic ML stacking rules). Mirror the spellcasting classLevel-vs-casterLevel split exactly.
- Bonus PP formula floor(keyMod * ML / 2) and the 'key ability <= 9 means no manifesting' guard must match the published bonus-PP table — verify against the table, not memory, when seeding.
- Augmentation that raises effective power level (and thus save DC) — modeling DC scaling generically is hard; safest to store the augment text + compute base DC per power level and let the augment calculator show the delta, not bake every power's augment rule into the engine.
- Soulknife and Wilder are NOT PP/powers-shaped (mind blade; wild surge/enervation) — forcing them into the manifester schema would be wrong; gate them as optional subforms (Phase 5).
- Privacy leak risk: powers known + current PP are tactically sensitive; the view-model must gate them like the spell list/HP, and the M9-class 'section marked private still leaked' bug must not recur in the psionics gate or API summary.
- Discipline opposed/restricted-power costs (+1 PP or forbidden) interact with the cost cap and with which powers a psion may learn — model as restrictedDisciplines on the manifester + a +1 PP advisory, not a hard engine block, to avoid over-constraining homebrew.
- Sourcing a clean, legally-distributable powers dataset for power_compendium (Phase 3) is the real long pole — Dreamscarred content; confirm licensing/source before seeding, same care as the preserved spell_compendium.

---

## Path of War (Dreamscarred Press, PF1e third-party initiator system)  — **L**

**Summary.** Path of War is a Tome-of-Battle-style martial subsystem: classes (Warlord/CHA, Stalker/WIS, Warder/INT, plus archetypes/prestige) learn discrete combat techniques called MANEUVERS drawn from 20 martial DISCIPLINES, plus STANCES (persistent, never-expended modes). Its three mechanical pillars are: (1) the known/readied/granted/expended maneuver lifecycle — you know a pool, ready a subset via 10-minute prep, and per-encounter expend-and-recover them; (2) INITIATOR LEVEL — = full level in the initiating class + half of all other levels (or 1/2 character level if no initiator levels), capped at character level, which gates the highest maneuver level (IL 1-2→1st … 17+→9th) and feeds maneuver math; (3) per-class RECOVERY actions plus the universal save DC = 10 + maneuver level + initiation modifier (+2 competence when using the discipline's favored weapon). Maneuvers are a large, discrete, searchable option set (hundreds across disciplines) — a textbook compendium + paste-parser candidate mirroring spell_compendium. It slots cleanly into the existing optional-rules framework, where the path_of_war module key already exists.

**Core mechanics:**
- Disciplines (20): Black Seraph, Broken Blade, Cursed Razor, Elemental Flux, Eternal Guardian, Golden Lion, Iron Tortoise, Mithral Current, Piercing Thunder, Primal Fury, Riven Hourglass, Scarlet Throne, Shattered Mirror, Silver Crane, Sleeping Goddess, Solar Wind, Steel Serpent, Tempest Gale, Thrashing Dragon, Veiled Moon — each with an associated skill (e.g. Broken Blade→Acrobatics, Black Seraph→Intimidate, Iron Tortoise→Bluff) and favored weapon group(s)
- Maneuvers: discrete techniques with a level (1-9), discipline, action type (immediate/swift/move/standard/full-round), type (strike/boost/counter/etc.), prerequisites (often N maneuvers of a discipline; stances count)
- Maneuver lifecycle: KNOWN (all learned) → READIED (subset prepared via 10-min meditation; all slots must be filled, no dupes) → available at encounter start → EXPENDED on initiation → recovered. GRANTED = a separately-counted subset some classes draw at start of turn.
- Stances: a separate known-list; never readied, never expended, always available; entered as a swift action; one active at a time; ends if helpless. Count toward maneuver prerequisites.
- Initiator Level (IL): full initiating-class level + 1/2 all other class levels; or 1/2 character level if no initiator levels; capped at character level. Gates highest maneuver level via the IL→maneuver-level table.
- Maneuver save DC = 10 + maneuver level + initiation modifier; +2 competence when wielding the discipline's favored weapon. Initiation modifier ability is class-defined (Warlord CHA, Stalker WIS, Warder INT).
- Recovery (per class): Warlord — gambits or standard action to recover one; Warder — full-round Defensive Focus recovers (init mod, min 2) or standard action for one; Stalker — standard action for one, or full-round recovers (init mod, min 2) plus +4 insight AC and bonus deadly-strike damage. Universal: end-of-encounter / 1 minute idle recovers all.
- Counts (per class, by level): readied/known/stances progressions, e.g. Warlord L1 = 6 known/4 readied/1 stance; Stalker L1 = 6/4/1; Warder L1 = 5/3/1; scaling to ~10-12 readied / 16-21 known / 7 stances at L20.

**Data model.** New optional block `character.pathOfWar` (gated by the existing `path_of_war` module key), parsed into `pathForgeCharacterSchema` as `.optional()`. Concrete Zod (new file packages/pathforge-schema/src/path-of-war.ts):

powInitiatorSchema = z.object({ id, className:z.string(), presetKey:z.string().optional() (links to a future POW class-catalog preset, rename-proof like spellcasterEntry.presetKey), classLevel:z.number().int(), initiationAbility:abilityKeySchema (default per class: warlord 'cha', stalker 'wis', warder 'int'), initiatorLevelFormula:z.string().default("") (blank = engine derives), maneuversKnownMax:z.number().int().optional(), maneuversReadiedMax:numberOrFormulaSchema.optional(), maneuversGrantedMax:numberOrFormulaSchema.optional(), stancesKnownMax:z.number().int().optional(), recoveryMethod:z.enum(["warlord_gambit","warder_defensive_focus","stalker_full_round","standard_action","custom"]).default("standard_action"), conditionalModifiers:z.array(modifierEntrySchema).default([]) }).

powDisciplineSchema = z.object({ key:z.string() (slug, e.g. "broken_blade"), name:z.string(), associatedSkill:z.string().optional(), favoredWeaponGroups:z.array(z.string()).default([]) }) — a small static catalog DISCIPLINES exported from path-of-war.ts; the character stores only the disciplines it has access to (per initiator) via initiator.disciplineKeys:z.array(z.string()).

powManeuverSchema (mirrors spellRefSchema's cached-detail pattern): z.object({ id, compendiumId:z.string().optional() (links the future maneuver_compendium table), name, level:z.number().int().min(0).max(9) (0 = stance? no — keep stances separate; maneuvers 1-9), disciplineKey:z.string(), initiatorId:z.string().optional() (which POW class granted it; sole-initiator attributable like spells), entryKind:z.enum(["maneuver","stance"]).default("maneuver"), maneuverType:z.string().optional() (strike/boost/counter/boost/gambit), actionType:z.enum(["immediate","swift","move","standard","full_round","free"]).optional(), readied:z.boolean().default(false), expended:z.boolean().default(false), granted:z.boolean().default(false), prerequisites:z.string().optional(), saveDcFormula:z.string().default("") (blank → engine default), range/target/duration/savingThrow/description:z.string().optional() (cached from compendium at pick time), source:sourceRefSchema.optional(), notes }).

powBlockSchema = z.object({ initiators:z.array(powInitiatorSchema).default([]), maneuvers:z.array(powManeuverSchema).default([]) }). Stances live in `maneuvers` with entryKind:"stance" + a stanceActive:z.boolean().default(false) flag (one active per initiator). Extends existing blocks lightly: nothing structural — initiation ability reads `character.abilities`; favored-weapon DC bonus is per-maneuver-instance computed at read time (not a stored modifier). Reuse resourceRefSchema is NOT needed for maneuvers (the readied/expended lifecycle is per-entry booleans, not a fungible pool); DO reuse resourceRef only if/when modeling things like a warlord's gambit-granted temp pools — defer.

**Engine.** Add computePathOfWar(character, abilities, resolver) in compute.ts, called from computeCharacter when `character.pathOfWar` exists, emitting `summary.pathOfWar` (gated by privacy view-model). Per initiator compute: (1) INITIATOR LEVEL = if initiatorLevelFormula set, eval it; else derive: thisClassLevel + floor((characterLevel - thisClassLevel)/2), clamped to characterLevel; if no POW levels at all, floor(characterLevel/2). Expose initiatorLevel + the derived highestManeuverLevel via the IL→level table (IL 1-2→1, 3-4→2, 5-6→3, 7-8→4, 9-10→5, 11-12→6, 13-14→7, 15-16→8, 17+→9). (2) initiation modifier = abilities[initiator.initiationAbility].modifier. (3) Per maneuver/stance: saveDC = eval(saveDcFormula || default "10 + @{maneuverLevel} + @{initiationMod}") with @{maneuverLevel} and @{initiationMod} injected as locals (exactly like computeSpellcasting injects @{spellLevel}); add the +2 competence favored-weapon term as a CalculationTerm flagged included:false-by-default (UI/toggle decides) so Show-Math surfaces it. (4) Tallies: readiedCount vs maneuversReadiedMax, knownCount vs max, stancesKnown vs max, expendedCount, grantedCount — surfaced for over/under-readied warnings. Stances feed the modifier buckets: a stance whose effect is expressed as automationEffect[]/modifierEntry[] (e.g. +X to attack, AC, a save) routes through the existing classifyTarget/buildModifierIndex path when stanceActive — i.e. treat an active stance like an active buff (reuse the buff ingestion loop: iterate active stances, push classifyTarget(effect.target)). This means stances with mechanical bonuses Just Work in attack.all/ac/save.* buckets with no new resolver code. Boosts/strikes are situational and NOT auto-applied to totals (they're per-attack), consistent with how the engine leaves spell effects descriptive. computeCharacter must run computePathOfWar after abilities+index so stance mods are in the index before defense/attack resolvers read them (order it alongside the buff index build).

**Editor UI.** A new "Martial Disciplines" (Path of War) section in the editor's left "Sheet Sections" sidebar (under Attacks or its own group), revealed only when isModuleKeyEnabled(character,"path_of_war"). New component components/character/editor/path-of-war-editor.tsx. Controls: (1) Initiators sub-panel — add/remove POW class, pick preset (warlord/stalker/warder presets seeding initiationAbility + recoveryMethod + disciplineKeys + the readied/known/stance progression maxes by classLevel, mirroring class-catalog.ts), NumberField for classLevel, an initiatorLevel readout (computed, read-only with Show-Math), a manual IL-formula override (Advanced toggle). (2) Disciplines multi-select limited to the class's available list. (3) Maneuvers list with a ManeuverPicker (mirrors spell-picker.tsx) — searchable, discipline/level-aware, debounced, backed by a search_maneuver_compendium RPC; picked maneuvers cache detail fields onto powManeuverSchema. Each row: readied checkbox (enforce readied<=max, no dupes), expended toggle, granted flag, a per-discipline favored-weapon toggle that flips the +2 DC term. (4) Stances sub-list (entryKind:"stance") with a single "active" radio per initiator. (5) Recovery quick-actions (Simple mode): "Recover one", "Recover (Defensive Focus / full-round)", "New encounter (un-expend all)" buttons that mutate expended flags. All gated; respects the existing Simple/Advanced toggle and NumberField int-coercion/label conventions.

**Read surface.** A "Martial Disciplines" card on character-dashboard.tsx, rendered only when vm.pathOfWar is present (gated in the §15 view-model: add buildCharacterViewModel handling for a `pathOfWar` section with its own privacy level, defaulting like spellcasting — readied/known maneuver NAMES + stances can leak more than full descriptions to party/public; private blocks hide the list entirely). Card shows per initiator: initiator level, highest maneuver level, initiation mod + maneuver DC base, readied/known/stance counts, the readied maneuver list (name, discipline, level, action type, DC, expended/granted state), the active stance, and recovery method. The API/view-model addition: extend the api-shapes summary/stats with an optional pathOfWar block (counts + IL only by default, public-safe) so /api/v1 surfaces don't leak full maneuver lists for private sheets — mirror how spellcasting is gated. Privacy considerations: maneuver descriptions are 3pp text → keep them out of anonymous/public unless the section is public; default the section to the same visibility as spellcasting; expended/granted runtime state is arguably owner/gm-only (tactical info) — make it a sub-field gated tighter than the readied list.

**Compendium / parser.** YES — strong fit, and it should share infra with spell_compendium. Maneuvers are a large, discrete, searchable option set (hundreds across 20 disciplines, each with name/discipline/level/type/action/prereq/range/target/save/description). Table shape: new Postgres table public.maneuver_compendium (id uuid, name text, discipline text, level int, maneuver_type text, action text, prerequisite text, range text, target text, duration text, saving_throw text, description text, source text) + a search RPC search_maneuver_compendium(query, discipline?, max_level?) ranked name→discipline→type→description, debounced, wildcard-safe — a direct clone of search_spell_compendium / migration 0008-0009. Paste-parse approach: like the spell picker, a pick caches the row's detail fields onto powManeuverSchema (so the read/API/offline surfaces render with no DB round-trip), keyed by compendiumId. A copy/paste TEXT parser (statblock-style "Name; Discipline (Level); Type; Action; …") is a reasonable secondary import path but lower priority — the searchable picker covers the primary flow. Seeding the table is the main data-acquisition task (Path of War SRD content on d20pfsrd); it shares the RLS/guardrail pattern of spell_compendium (read-only, never dropped). Reuse: the spell-picker component, the RPC migration shape, and the cached-ref schema pattern all transfer almost verbatim.

**Phases:**
1. Phase 1 — Schema + engine core (shippable, tested): add path-of-war.ts (powBlockSchema + DISCIPLINES catalog + powInitiator/Maneuver schemas), wire optional `character.pathOfWar` into the character schema + factory, export from index.ts. Add computePathOfWar to compute.ts: initiator-level derivation + IL→maneuver-level table + maneuver save DC (with @{maneuverLevel}/@{initiationMod} locals) + counts; expose summary.pathOfWar. Unit tests for IL math (single/multiclass/no-initiator/cap), DC formula, and the favored-weapon +2 term. No UI yet.
2. Phase 2 — Active-stance modifiers into the engine: ingest active stances' modifierEntry/automationEffect through buildModifierIndex (reuse the buff loop + classifyTarget) so stance bonuses land in attack/ac/save buckets; tests proving an active Iron Tortoise/Scarlet Throne-style +AC/+attack stance moves totals and toggling it off reverts. Ship.
3. Phase 3 — Editor section behind the toggle: path-of-war-editor.tsx (initiators, disciplines, maneuvers/stances lists, readied/expended/granted/active controls, recovery quick-actions), revealed via isModuleKeyEnabled; add warlord/stalker/warder presets (initiation ability, disciplines, readied/known/stance maxes) following class-catalog.ts. Manual + jsdom render tests. Ship.
4. Phase 4 — Read surface + privacy + API: pathOfWar card on the dashboard, view-model gating for the new section (default visibility = spellcasting's), and the optional pathOfWar block in api-shapes/view-model so public/anon surfaces stay safe. Privacy leak tests (public never leaks private maneuvers/descriptions). Ship.
5. Phase 5 — Maneuver compendium + picker (the big data pass): migration for public.maneuver_compendium + search_maneuver_compendium RPC (clone 0008/0009), seed Path of War SRD maneuvers, ManeuverPicker component (clone spell-picker), wire compendiumId caching of detail fields onto powManeuverSchema. Ship.
6. Phase 6 (deferred/optional) — POW import adapters (Foundry pf1 actor maneuver items, Myth-Weavers/Mythweavers POW slots) extending the existing importer pipeline; paste-text maneuver parser; warlord gambit / per-class capstone nuances.

**Dependencies:** optional-rules framework: the `path_of_war` module key already exists in OPTIONAL_RULE_MODULES; gating reuses isRuleEnabled/isModuleKeyEnabled; computeCharacter + buildModifierIndex/classifyTarget modifier buckets (stances reuse the buff ingestion path); spell_compendium infra: search RPC pattern (migrations 0008/0009), spell-picker.tsx, and spellRef's cached-detail pattern are the templates for maneuver_compendium + ManeuverPicker + powManeuverSchema; §15 privacy view-model + character-dashboard card rendering + api-shapes (new pathOfWar section must be gated alongside spellcasting); class-catalog.ts / presetKey pattern for warlord/stalker/warder presets; abilities block (initiation modifier reads STR/DEX/CON/INT/WIS/CHA mods) and overall character level (for IL derivation); Potential conflict/interaction: Mythic (Mythic Path of War exists — mythic discipline masteries; out of scope for v1 but note the rules.variants.mythic interaction). Spheres of Might is a parallel martial subsystem — independent block, no shared math, but UI should not imply mutual exclusivity.

**Risks:**
- Initiator level for multiclass: must use FULL initiating-class level + 1/2 OTHER levels (not 1/2 of the same class), capped at character level; the no-initiator-levels case (1/2 character level, e.g. for feats like Martial Training) is a separate branch. Easy to get the rounding/cap wrong — test all four cases.
- readied vs known vs granted vs expended is four distinct states on one entry; the UI must enforce readied<=max, no duplicate readied maneuvers, and 'all readied slots filled', while granted is a SEPARATE count layered on top (prestige/round-start). Modeling granted as just another boolean risks double-counting against the readied cap — keep grantedMax separate from readiedMax.
- Save DC must inject @{maneuverLevel} (the maneuver's own level, not initiator level) — analogous to the @{spellLevel} injection bug class in computeSpellcasting; a wrong reference silently makes DCs not scale.
- Favored-weapon +2 competence is conditional on the wielded weapon and bonus-typed (competence) — must not double-apply with other competence DC bonuses and should be a toggle/term, not always-on.
- Stance auto-application: only stances with clean numeric typed bonuses (e.g. +morale to attack, +insight AC) should auto-feed buckets; situational/triggered stances and all strikes/boosts must stay descriptive (don't inflate totals). Drawing that line wrong over-buffs the sheet.
- Prerequisite logic ('N maneuvers of discipline X'; stances count; a maneuver counts toward its own prereq) is genuinely fiddly — v1 should store prereq text and NOT hard-enforce learning legality (advisory only), matching how the sheet treats feat prereqs.
- Privacy/3pp text: maneuver descriptions are third-party content; the view-model must default the section to a non-public visibility and never leak full descriptions/expended-state to anonymous/public viewers (the same leak-class adversarial reviews caught for abilities/audit).
- Recovery semantics differ per class (warder Defensive Focus full-round = init mod min 2; stalker full-round adds AC + deadly strike; warlord gambits) — v1 can model 'recover one' / 'recover N' / 'un-expend all (new encounter)' generically and leave gambit risk/deadly-strike as notes rather than fully automating them.

---

## Pathfinder 1e — Mythic Adventures (Paizo)  — **L**

**Summary.** Mythic Adventures layers a parallel advancement track ("tiers" 1-10, earned via trials, not XP) on top of a character's normal class levels. Its mechanical pillars are: (1) a mythic power POOL (3 + 2×tier uses/day) spent on the SURGE — adding a die (1d6→1d8→1d10→1d12 by tier band) to any d20 you just rolled — and on path/feat abilities; (2) a chosen PATH (Archmage/Champion/Guardian/Hierophant/Marshal/Trickster) granting one selectable path ability per tier (drawn from the path list or the shared "universal" list), for 10 total at tier 10; (3) tier-gated BASE abilities (Hard to Kill, Amazing Initiative, Recuperation, Mythic Saves, Force of Will, Unstoppable, Immortal, Legendary Hero) plus 5 ability-score boosts (+2 at even tiers) and 5 bonus MYTHIC FEATS (odd tiers + tier 10). It is data-heavy (~6 paths × ~20 abilities + ~30 universal + ~120 mythic feats + dual-stat mythic spells), so the selectable abilities want a searchable compendium + paste/pick-cache pattern rather than hand-authored inline content. Most of its math is additive and routes cleanly through the existing modifier buckets; only a handful of effects (Hard to Kill death threshold, surge-die display, mythic-power pool, +½ tier effective level) need bespoke engine code.

**Core mechanics:**
- Mythic tier 1-10 (parallel track, earned by trials not XP); +½ tier to effective character level for CR
- Path selection (Archmage/Champion/Guardian/Hierophant/Marshal/Trickster) made at 1st tier
- Mythic power pool: max = 3 + 2×tier uses/day (5 at T1 … 23 at T10); at T10 also regain 1/hour
- Surge: immediate action, spend 1 mythic power to add a die to a d20 just rolled; die = 1d6 (T1-3) / 1d8 (T4-6) / 1d10 (T7-9) / 1d12 (T10)
- Tier ability-score boosts: +2 at tiers 2,4,6,8,10 (player assigns to chosen abilities; 5 boosts, each +2 = inherent-like, untyped-by-rules)
- Bonus mythic feats at tiers 1,3,5,7,9,10 (5 feats); plus mythic versions of normal feats
- One path ability gained per tier (10 total at T10), chosen from the path's list or the universal list; some require min tier 3 or 6
- Base tier abilities: Hard to Kill (T1), Amazing Initiative (+tier to init, T2), Recuperation (T3), Mythic Saving Throws (T5), Force of Will (T6), Unstoppable (T8), Immortal (T9), Legendary Hero (T10)
- Hard to Kill: auto-stabilize below 0; death moves from −Con-score to −2×Con-score
- Amazing Initiative: +tier untyped bonus to initiative, plus an extra standard action by spending mythic power
- Mythic feats/abilities frequently grant their own per-day or per-mythic-power resource uses
- Mythic spells: a spell can have a mythic-augmented version (augmented + 'amplified' when cast with mythic power)

**Data model.** New optional top-level block `character.mythic` (added to `pathForgeCharacterV1Schema` as `mythic: mythicBlockSchema.optional()`, gated by the existing `rules.variants.mythic`). Concrete Zod (`packages/pathforge-schema/src/mythic.ts`):

```
export const MYTHIC_PATHS = ["archmage","champion","guardian","hierophant","marshal","trickster","none"] as const;
export const mythicPathSchema = z.enum(MYTHIC_PATHS);

// One selected path/universal ability, mirrors featureEntry so it can carry automation + uses.
export const mythicAbilityEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  source: sourceRefSchema.optional(),          // book/page
  compendiumId: z.string().optional(),         // links to mythic_compendium row (paste-cache)
  category: z.enum(["path","universal","feature"]).default("path"),
  path: mythicPathSchema.optional(),           // which path list it came from
  tierGained: z.number().int().min(1).max(10).optional(),
  minTier: z.number().int().optional(),        // 3/6 prereq, validation only
  description: z.string().optional(),
  automation: z.array(automationEffectSchema).default([]),   // reuse the bonus engine
  uses: resourceRefSchema.optional(),          // ability-specific per-day/per-power pool
  gmStatus: gmStatusSchema.optional(),
});

export const mythicBlockSchema = z.object({
  tier: z.number().int().min(0).max(10).default(0),
  path: mythicPathSchema.default("none"),
  // Mythic power POOL — reuse resourceRef. max is a formula so it tracks tier automatically.
  mythicPower: resourceRefSchema.default({ id: "mythic-power", label: "Mythic Power", per: "day",
    max: { formula: "3 + 2 * @{mythic.tier}" }, current: 0 }),
  // Tier ability-score boosts: which ability each +2 was assigned to (length ≤ floor(tier/2)).
  abilityBoosts: z.array(z.object({ id: z.string(), tier: z.number().int(), ability: abilityKeySchema })).default([]),
  pathAbilities: z.array(mythicAbilityEntrySchema).default([]),
  mythicFeatIds: z.array(z.string()).default([]),   // ids into character.feats.list tagged "mythic"
  // Toggles for the always-on base abilities the player has unlocked (auto-derived from tier,
  // but stored so a houseruled/partial build can override).
  baseAbilities: z.object({
    hardToKill: z.boolean().optional(), amazingInitiative: z.boolean().optional(),
    recuperation: z.boolean().optional(), mythicSaves: z.boolean().optional(),
    forceOfWill: z.boolean().optional(), unstoppable: z.boolean().optional(),
    immortal: z.boolean().optional(), legendaryHero: z.boolean().optional(),
  }).default({}),
  notes: z.string().optional(),
});
```

Extends existing blocks: (a) `feats.featEntrySchema` already has `tags[]` — mythic feats are normal feat rows tagged `"mythic"` (no schema change; `mythicFeatIds` cross-references them). (b) Mythic spells reuse `spellRefSchema` with a `mythic`/`augmented` flag — propose adding two optional fields to `spellRefSchema`: `mythic: z.boolean().optional()` and `augmented: z.string().optional()` (the mythic-augmented text), so the spell compendium/picker can mark them without a new block. (c) No change to `rules.ts` — `variants.mythic` already exists.

**Engine.** All in `packages/pathforge-rules-pf1e/src/compute.ts`, gated by `character.rules.variants.mythic === true` (no-op otherwise so non-mythic sheets are untouched).

1. Mythic power pool max: resolve `mythic.mythicPower.max` (the `3 + 2*@{mythic.tier}` formula) via `resolveNumberOrFormula`. Add `mythic.tier` to `CharacterResolver.lookup` so formulas can reference it. Surface as `summary.mythic.power = { max, current }`.

2. Surge die (display, not rolled — engine never rolls dice): `surgeDie = tier<=3?"1d6":tier<=6?"1d8":tier<=9?"1d10":"1d12"`. Pure function `mythicSurgeDie(tier)`; surfaced on `summary.mythic`.

3. Amazing Initiative: when `tier>=2`, push an IndexedMod `{ value: tier, bonusType: "untyped" }` into the `init` bucket inside `buildModifierIndex`. The default initiative formula already reads `@{combat.initiative.misc}` (sums the init bucket) so NO formula change is needed — it flows straight into `summary.initiative`.

4. Tier ability boosts: in `computeAbilities`, after the existing typedMods, add one StackInput per `mythic.abilityBoosts` entry `{ value: 2, bonusType: "inherent" }` keyed to its ability (the rules call these untyped-stacking "tier" bonuses; modeling as inherent is the closest existing bucket and stacks correctly with enhancement/morale — flag in review whether to add a dedicated `mythic` bonusType to `BONUS_TYPES` so multiple boosts to the same stat stack, which RAW they DO; a dedicated type that always stacks is the faithful choice).

5. Hard to Kill — death threshold: extend `hpStatus(current, nonlethal, conScore, deadAt?)`. When `mythic.baseAbilities.hardToKill`, dead at `current <= -(2*conScore)` instead of `-conScore`. Thread a `deadThreshold` into the `summary.hp` block.

6. Path/feature ability automation: the `mythicAbilityEntrySchema.automation[]` is already `automationEffect[]` — feed `character.mythic.pathAbilities[*].automation` through the SAME `effectToMod`/`classifyTarget` loop that handles features/feats in `buildModifierIndex` (one added iteration). Bonuses land in attack/save/skill/ac buckets for free, including formula-valued effects scaling off `@{mythic.tier}`.

7. Mythic saves (T5+): informational flag on `summary.mythic` (the "no effect on success vs non-mythic" rule is narrative, not a number) — no math, render a note.

8. Effective level: `summary.mythic.effectiveLevel = totalLevel + Math.max(1, Math.floor(tier/2))` for GM/CR display.

Add a `summary.mythic?: { tier, path, power:{max,current}, surgeDie, effectiveLevel, abilities: string[] }` (absent when mythic disabled).

**Editor UI.** A new "Mythic" section in the editor's left "Sheet Sections" sidebar (under Abilities/Settings group), revealed only when `isModuleKeyEnabled(character, "mythic")` is true (the toggle already lives in Settings → Optional rules). New component `components/character/editor/mythic-editor.tsx` wired into the section switch in `character-editor.tsx`, following the `combat-editor.tsx`/`spellcasting-editor.tsx` pattern (draft + NumberField + handlers from `useCharacterEditor`).

Controls:
- Tier stepper (0-10) + Path select (six paths). Changing tier shows a derived summary ("Mythic power 13/day, Surge 1d8, 4 path abilities, 3 mythic feats, 2 ability boosts").
- Mythic power pool: NumberField for `current`, read-only computed `max`, a "rest/refresh" button (set current=max) reusing the resource-row UI from the Resources/Spellcasting rest controls.
- Ability boosts: a small repeating row (tier → ability dropdown), capped at `floor(tier/2)` rows with a validation hint if over/under-assigned.
- Path & universal abilities: a "+ Add ability" button opening a `MythicAbilityPicker` (new, modeled on `spell-picker.tsx`) that searches the `mythic_compendium` table filtered by the character's path (+ universal + feats), caches name/description/automation onto the picked `mythicAbilityEntry`. Also a "Custom ability" form (free name/description + the ƒx automation editor already used for custom buffs) so homebrew isn't blocked.
- Mythic feats: reuse the existing Feats tab tag flow — a "Mythic feat" quick-add that tags `mythic`; the Mythic section just lists them read-only with a count vs. expected (tiers 1,3,5,7,9,10).
- Base abilities: auto-checked checkboxes by tier (Hard to Kill at T1, etc.) with manual override, each with a one-line rules summary.
All gated controls do nothing on non-mythic sheets (section hidden).

**Read surface.** A new `MythicCard` on `components/character/character-dashboard.tsx`, rendered only when `vm.mythic` is present. Shows: tier + path badge, mythic power pool (current/max with the surge-die prominently, e.g. "Surge 1d8"), effective level, the list of base abilities active, and selected path/universal abilities (name + short description), plus mythic-feat names. Hooks into the existing card-grid + section landmark regions.

View-model (`lib/character/view-model.ts`): add a `mythic` field built behind a `gate(...)`. Add `"mythic"` to `PRIVACY_SECTIONS` in `meta.ts` (so players can hide a surprise mythic build from the party/public like any other section) with a sensible default (campaign/party visible, since mythic is usually known to the table). The gated view-model exposes `{ tier, path, power:{max,current}, surgeDie, effectiveLevel, baseAbilities: string[], abilities: {name,description}[], feats: string[] }` — current mythic-power count is tactical like buff/spell state, so for non-owner viewers expose max + surge die but suppress `current` (mirrors how buffs hide owner-only detail). Read dashboard, `summary.mythic` API view-model, and `/api/v1/characters/{id}/summary` all read the gated model — no raw-sheet leak.

**Compendium / parser.** YES — strongly applies, and it should share infra with `spell_compendium`. The selectable surface is large (~6 paths × ~15-20 path abilities ≈ ~110, plus ~30 universal abilities, plus ~120 mythic feats, plus mythic spell augments), too much to hand-author inline. Mirror the proven pattern exactly: a new Postgres table `mythic_compendium` (columns: id, kind ENUM('path_ability','universal_ability','mythic_feat'), name, path text NULL, min_tier int, prerequisites text, description text, automation jsonb NULL [pre-authored automationEffect[] for the mechanically-clean abilities], source_book, source_page) + a `search_mythic_compendium(query, kind, path, min_tier)` RPC ranked name→prerequisites→description (copy `search_spell_compendium`'s ranking + wildcard-safety + debounce). The picker (`mythic-ability-picker.tsx`) clones `spell-picker.tsx`: class/path/tier-aware filter, debounced search, and PASTE-CACHE onto the character — picking an ability copies name/description/source/automation into a `mythicAbilityEntry` so the detail view + public/API + offline render with no DB round-trip (identical to how spell picks cache compendium fields onto `spellRef`). A migration seeds the table (one-time data load, like the 3,034-row spell seed). This is the same "large searchable content compendium with paste-time caching" infra; mythic spells specifically reuse `spell_compendium` itself (add a `mythic`/`augmented` cached field on the spell ref rather than a separate table).

**Phases:**
1. Phase 1 — Schema + engine core (no UI): add packages/pathforge-schema/src/mythic.ts (mythicBlockSchema), wire optional `mythic` into character.ts + factory default, add `mythic`/`augmented` to spellRefSchema. Engine: resolver `mythic.tier`, mythic-power pool max, surge-die fn, Amazing Initiative init-bucket push, tier ability boosts in computeAbilities, Hard-to-Kill death threshold in hpStatus, path-ability automation iteration, summary.mythic. Unit tests for pool/surge/init/boosts/death-threshold. Shippable: mythic math correct from JSON, behind the toggle. REVIEW.
2. Phase 2 — Editor section: mythic-editor.tsx (tier/path/pool/boosts/base-abilities) gated behind the toggle, custom-ability form with the ƒx automation editor; mythic feats via the existing tag flow. No compendium yet — custom + manual entry only. REVIEW.
3. Phase 3 — Read surface + privacy + API: MythicCard on the dashboard, `mythic` in the view-model behind a new `mythic` PRIVACY_SECTION with non-owner current-power suppression, summary.mythic in the API shapes + OpenAPI catalog. E2E covers the card rendering on a mythic sheet. REVIEW.
4. Phase 4 — Compendium + paste-parser: migration creating mythic_compendium + search_mythic_compendium RPC (+ get_advisors after DDL) + seed migration for paths/universal/feats; mythic-ability-picker.tsx with paste-cache; mark mythic spells in the spell picker. Pre-author automation jsonb for the mechanically-clean abilities (Amazing Initiative variants, defensive boosts) so picked abilities auto-apply bonuses. REVIEW.
5. Phase 5 — Polish/interaction: GM-audit awareness (mythic abilities show in /campaigns audit; effective-level surfaced for CR), import/export round-trip (PathForge exporter includes the mythic block; Foundry pf1 mythic class-item detection in the importer), and the deferred-tail items from optional-rules (per-module field reveals).

**Dependencies:** rules.variants.mythic toggle (already exists in rules.ts + optional-rules.ts) — the gate for the whole system; Modifier engine buckets (compute.ts classifyTarget/buildModifierIndex/applyStacking) — path-ability + Amazing Initiative bonuses route through them; resourceRef (common.ts) — the mythic power pool reuses it, like feature daily uses and the planned hero-points/spell-points pools; automationEffectSchema (common.ts) — path/universal abilities carry automation, incl. formula-valued effects scaling off @{mythic.tier}; spell_compendium table + search_spell_compendium RPC + spell-picker.tsx — the PROVEN compendium/paste-cache pattern mythic_compendium clones; mythic spells extend spell_compendium directly; view-model.ts + PRIVACY_SECTIONS (meta.ts) — needs a new `mythic` section key for gating; feats.featEntrySchema tags[] — mythic feats are tagged feat rows (no new block); factory.ts / createDefaultCharacter — must emit a valid default mythic block (or leave optional/undefined until enabled); BONUS_TYPES (common.ts) — may need a new always-stacking `mythic` bonus type for tier ability boosts to stack RAW-correctly; GM audit (lib/character/audit.ts) + diff — should be mythic-aware so a GM sees tier/abilities and effective level

**Risks:**
- Tier ability boosts stacking: RAW the +2s are untyped and DO stack (a stat boosted at T2 and T4 gets +4). Modeling as `inherent` would WRONGLY take the highest. Likely need a dedicated always-stacking `mythic` bonusType or push them as distinct untyped mods — verify applyStacking treats untyped as stacking before relying on it.
- Hard to Kill death threshold: hpStatus currently hardcodes dead at `-conScore`; must thread a per-character threshold without breaking the existing non-mythic path or the negative-levels HP-ceiling math.
- Effective level (+½ tier) must NOT feed back into level-derived formulas (BAB/saves/CL); it is a CR/display number only — keep it out of `@{level.total}` resolution or it corrupts every derived stat.
- Mythic power is one pool spent on MANY things (surge, extra action, path abilities, mythic feats, mythic spells). Some path abilities define their OWN per-day uses — don't conflate ability uses with the shared pool; the picker must distinguish.
- Surge interacts with rolls the engine doesn't simulate (it adds to a d20 result at table time). Resist the urge to bake it into static totals — it's a display/tactical aid (show the die), like buffs that aren't auto-applied.
- Amazing Initiative bonus is +tier untyped to init AND it stacks with everything; ensure it doesn't collide/dedupe with a same-id init mod across recomputes.
- Mythic spells: a spell having a mythic version is per-spell and per-cast (augmented vs amplified-with-power). Modeling on spellRef must not imply the mythic version is always active.
- Compendium completeness vs. licensing: ensure seeded text is OGL/Community-Use-compliant (the spell_compendium precedent exists, but mythic ability text must follow the same sourcing rules).
- Validation: abilityBoosts count must equal floor(tier/2) and pathAbilities count should equal tier (one per tier) — surface as warnings (like other soft-validation), not hard schema errors, so in-progress builds aren't blocked.
- GM 'cannot edit player sheet' invariant + snapshot/diff must extend cleanly to the new mythic block (privacy re-gating in audit/diff, per the leak class already fixed in M7).

---

## Pathfinder 1e "Background Skills" (Pathfinder Unchained optional system)  — **S**

**Summary.** Background Skills is a Pathfinder Unchained optional rule that grants every character +2 dedicated "background skill ranks" per level in a PC class (Int does NOT modify this), spendable ONLY on a fixed set of background skills, while normal/adventuring ranks may be spent on either pool. The background skill set is: Appraise, Artistry, Craft, Handle Animal, Knowledge (engineering), Knowledge (geography), Knowledge (history), Knowledge (nobility), Linguistics, Lore, Perform, Profession, Sleight of Hand — everything else is an "adventuring" skill. It adds two new Int skills, Artistry and Lore (both repeatable with a specialty; Lore is Trained Only and always a class skill; Artistry is a class skill for any class that has Craft or Perform). Mechanically it does not change a skill's total formula — it changes the rank-budget bookkeeping: a separate background-rank pool, an adventuring-rank pool, and per-skill validation that a skill's ranks come from the legal pool(s). The core pillars are: (1) two parallel rank budgets, (2) a faithful background-skill classification, (3) two new skills, (4) an alternate skills view that subcategorizes Adventuring vs Background with separate budget meters.

**Core mechanics:**
- +2 background skill ranks per PC-class level; Int modifier does NOT adjust this (flat 2 × PC class levels)
- Background ranks spendable ONLY on background skills; normal (adventuring) ranks spendable on EITHER pool
- Fixed background-skill set: Appraise, Artistry, Craft, Handle Animal, Knowledge(engineering/geography/history/nobility), Linguistics, Lore, Perform, Profession, Sleight of Hand
- Per-skill max ranks unchanged: total ranks (background + adventuring) on any one skill still capped at character level
- Two NEW skills: Artistry (Int, repeatable specialty, class skill if class has Craft or Perform) and Lore (Int, Trained Only, repeatable specialty, always a class skill)
- Skill TOTAL formula is unchanged — ranks + abilityMod + classSkillBonus + ACP + misc; only the rank-budget accounting differs
- Class-skill +3 still triggers on first rank regardless of which pool the rank came from
- Only PC-class (heroic) levels grant background ranks — racial HD / NPC-class levels do not (edge case; default to PC classes = identity.classes levels)

**Data model.** EXTEND existing blocks rather than add a new top-level character block (the seam already half-exists). Concrete changes in packages/pathforge-schema/src/skills.ts:

1) skillEntrySchema — split the single `ranks` into pooled ranks while staying backward compatible:
   - keep `ranks: z.number().int().min(0).default(0)` as the TOTAL ranks (do NOT break existing sheets / formula `@{ranks}`).
   - ADD `backgroundRanks: z.number().int().min(0).default(0)` — the portion of this row's ranks paid from the background pool (0 when the variant is off). Invariant: backgroundRanks <= ranks, and backgroundRanks > 0 only allowed on background skills.
   - ADD `background: z.boolean().optional()` to skillEntrySchema (the persisted classification flag, mirroring DefaultSkillDef.background) so custom/repeatable rows (Craft#2, Lore[Taldor]) carry their category.

2) DEFAULT_SKILLS (skills.ts) — add the two new background skills and correct the existing `background` flags to match canon exactly:
   - add { key: "artistry", label: "Artistry", ability: "int", repeatable: true, background: true }
   - add { key: "lore", label: "Lore", ability: "int", trainedOnly: true, repeatable: true, background: true }
   - mark Knowledge(engineering/geography/history/nobility) with background:true (currently NOT flagged); mark Handle Animal background:true and Perform background:true (Perform currently missing the flag). Appraise/Craft/Linguistics/Profession/SleightOfHand already correct. (Sleight of Hand currently lacks background:true — add it.)

3) skillBlockSchema.settings — `backgroundSkillsEnabled` already exists; keep it as the mirror of rules.variants.backgroundSkills (set by the module toggle). No new settings needed for v1; classSkillBonusDefault already covers Artistry/Lore class-skill +3.

4) rules.ts — rules.variants.backgroundSkills already exists; no change. The optional-rules.ts `background_skills` module already maps to it.

No new resourceRef pool block is warranted: the two budgets are DERIVED (level-based for background, normal skill-point math for adventuring) and are computed/validated, not stored as a mutable resource. resourceRef is for daily/encounter uses, not build-time budgets.

**Engine.** All math stays in packages/pathforge-rules-pf1e/src/compute.ts. The skill TOTAL loop is UNCHANGED (formula still `@{ranks} + @{abilityMod} + @{classSkillBonus} + @{armorCheckPenalty} + @{misc}` using the row's total `ranks`). The new work is computing/validating the two budgets and exposing them on ComputedCharacter:

1) Budget computation (gated on character.rules.variants.backgroundSkills):
   - backgroundRankBudget = 2 × (sum of identity.classes[].level) — i.e. 2 per PC-class level. Default to identity.totalLevel when classes[] is empty so a level-only sheet still works. Int does NOT factor in.
   - backgroundRanksSpent = sum over skills of row.backgroundRanks.
   - adventuringRankBudget: PathForge does not currently compute a skill-point budget (the editor only shows "ranks spent"), so v1 mirrors that — surface adventuringRanksSpent = sum(row.ranks − row.backgroundRanks) and leave adventuring budget as an informational total (no hard cap exists today). This keeps scope honest and consistent with current behavior.

2) Per-skill validation warnings (push into the existing ComputedValue.warnings / a new computed.skills meta):
   - if row.backgroundRanks > 0 and the skill is NOT a background skill → warning "background ranks on adventuring skill".
   - if row.backgroundRanks > row.ranks → warning "more background ranks than total ranks".
   - if row.ranks > character level → existing over-cap concept (the editor already flags `over`).
   - if backgroundRanksSpent > backgroundRankBudget → a sheet-level warning surfaced in summary.

3) Expose on ComputedCharacter (new optional field, only populated when the variant is on):
   summary.backgroundSkills?: { rankBudget: number; ranksSpent: number; adventuringRanksSpent: number; overBudget: boolean }.
   This rides alongside summary.speed / summary.totalLevel.

Classification helper (schema package, importable by engine + UI): isBackgroundSkill(entry) = entry.background ?? DEFAULT_SKILLS.find(d => d.key === baseKey)?.background ?? false. baseKey strips the repeatable suffix so Craft#2 / Lore[x] resolve to their base def.

**Editor UI.** In components/character/editor/character-editor.tsx SkillsEditor (the "skills" sidebar section). Gate all new UI on isModuleKeyEnabled(ed.draft, "background_skills"); when off, the editor is exactly as today (single Ranks column, no change).

When ON:
1) Split the Ranks column into two inputs per row: "Adv" (adventuring ranks) and "Bg" (background ranks). Internally write row.ranks = adv + bg and row.backgroundRanks = bg in a single ed.update. The "Bg" input is disabled/hidden for adventuring skills (only background skills can take background ranks).
2) Subcategorize the table into two grouped sections with subheaders: "Background skills" (rows where isBackgroundSkill) and "Adventuring skills" (the rest) — this is the requested ALT skills view. Provide a small toggle to flip between this grouped view and the flat A-Z view (UI-only state, not persisted).
3) Two budget meters at the top (reusing the existing "Ranks spent" chip pattern): "Background ranks: spent / budget" (turns destructive/red when over) and "Adventuring ranks spent: N" (informational). Budget pulled from ed.computed.summary.backgroundSkills.
4) Per-row inline warning (red text) mirroring the engine warnings (bg ranks on adventuring skill; bg > total). The existing `over` cap styling stays.
5) "Add a skill" — extend REPEATABLE_SKILL_BASES with Artistry and Lore so users can add Artistry[Painting], Lore[Osirion], etc.; new repeatable rows inherit background:true from their base.
6) Settings section already toggles the module via OPTIONAL_RULE_MODULES → when enabled, also set skills.settings.backgroundSkillsEnabled = true so reads/exports see it without recomputing rules.

Keep label association (useId/htmlFor) and aria-labels consistent with existing NumberField/skill-row a11y.

**Read surface.** Dashboard (components/character/character-dashboard.tsx) Skills card + the §15 view-model (lib/character/view-model.ts). The skills entry in the view-model currently exposes {key,label,total,ranks}. Additions:
1) Extend the gated `skills` view-model rows with `background: boolean` and `backgroundRanks: number` (computed via isBackgroundSkill + entry.backgroundRanks), still under the existing `skills: "public"` privacy gate — no new privacy surface; the same gate(\"skills\", …) applies, so private skills stay hidden.
2) Add an optional `backgroundSkills` summary to the view-model (rankBudget/ranksSpent), sourced from computed.summary.backgroundSkills, only when the variant is on. Gate it behind the skills section visibility (it's build metadata about skills, not a separate secret).
3) Dashboard Skills card: when the variant is on, render two subsections (Background / Adventuring) and a small "Background ranks X/Y" badge — matching the alt view in the editor. When off, render the flat list exactly as today.
Privacy consideration: nothing new leaks — background ranks are no more sensitive than ranks, and both ride the existing skills gate. Public/anonymous viewers see the subcategorized list only if skills is public, identical to current behavior.

**Compendium / parser.** No. A searchable compendium + paste-parser does NOT apply. Background Skills is a closed, ~13-entry fixed classification plus two new repeatable skills — there is no large option catalog to search (unlike talents/maneuvers/veils/powers or the 3,034-row spell_compendium). The whole system is expressible as static metadata in DEFAULT_SKILLS (the `background` flag) plus the two new skill defs. The only "open" part is user-chosen specialties for Artistry/Lore/Craft/Profession/Perform, which the existing repeatable-skill "Add a skill" flow already handles inline. Building a Postgres table + search RPC here would be over-engineering with no payoff; reserve that pattern for S4 systems with hundreds of discrete options.

**Phases:**
1. Phase 1 (schema): add `backgroundRanks` + `background` to skillEntrySchema; add Artistry & Lore to DEFAULT_SKILLS and fix the `background` flags on Knowledge(eng/geo/hist/nob)/Perform/HandleAnimal/SleightOfHand; export `isBackgroundSkill(entry)` helper + REPEATABLE base entries for Artistry/Lore. Unit tests for classification + backward-compat parse of old sheets. Shippable: data model correct, no behavior change while toggle off.
2. Phase 2 (engine): compute backgroundRankBudget = 2×PC-class levels, ranksSpent/adventuringRanksSpent, overBudget, and per-skill validation warnings; expose summary.backgroundSkills (only when variant on). Vitest cases: budget math, Int-independence, over-budget flag, bg-rank-on-adventuring-skill warning, repeatable base resolution. Shippable: math + warnings, still no UI.
3. Phase 3 (editor UI): gate behind isModuleKeyEnabled('background_skills'); split Ranks into Adv/Bg inputs, grouped Background/Adventuring view with a flat-view toggle, two budget meters, per-row warnings, Artistry/Lore in Add-a-skill, set skills.settings.backgroundSkillsEnabled on toggle. Shippable after adversarial review (per project convention).
4. Phase 4 (read surface + view-model): extend view-model skills rows with background/backgroundRanks + optional backgroundSkills summary under the existing skills gate; dashboard Skills card renders the subcategorized view + budget badge when on. Round-trip with importers/exporters (ensure backgroundRanks survives PathForge JSON export/import). Shippable: full read/write parity, privacy tests confirm no leak.

**Dependencies:** packages/pathforge-schema/src/skills.ts (SkillEntry, DEFAULT_SKILLS) — primary extension point; packages/pathforge-schema/src/optional-rules.ts — background_skills module + rules.variants.backgroundSkills toggle (already wired); packages/pathforge-rules-pf1e/src/compute.ts — skills loop + summary block; lib/character/view-model.ts — gated skills array + summary; components/character/editor/character-editor.tsx — SkillsEditor + REPEATABLE_SKILL_BASES; components/character/character-dashboard.tsx — Skills card; packages/pathforge-importers + pathforge-exporters — must carry the new backgroundRanks/background fields (PathForge canonical JSON round-trip); identity.classes[].level — source of PC-class level count for the budget

**Risks:**
- Budget basis: rules say 'per level in a PC class' — racial HD and NPC-class levels grant NO background ranks. PathForge has no PC-vs-NPC class tag, so v1 must approximate (sum identity.classes[].level, fall back to totalLevel). Document this and consider a future class-type flag.
- Backward compatibility: existing sheets have `ranks` but no `backgroundRanks`. Must default backgroundRanks=0 and NEVER reinterpret existing ranks as background ranks; the total-formula `@{ranks}` must keep using the full `ranks`.
- Per-skill cap interaction: max ranks per skill is still character level counting BOTH pools — easy to wrongly cap each pool separately. Validate against the combined total.
- Repeatable-skill classification: Craft#2 / Lore[Osirion] rows have synthetic keys; isBackgroundSkill must resolve the BASE key, not the suffixed one, or background skills silently read as adventuring.
- Class-skill rules for new skills: Lore is ALWAYS a class skill; Artistry is a class skill only if the character has Craft or Perform as a class skill — encoding 'always class skill' vs conditional needs care (v1 can default Lore.classSkill=true and let users set Artistry).
- Adventuring budget: PathForge doesn't currently compute/enforce a skill-point budget at all, so claiming a hard adventuring cap would be a new (out-of-scope) feature. Keep adventuring as informational to avoid scope creep and false 'over budget' errors.
- Privacy: the new summary.backgroundSkills must ride the skills gate; don't surface it unconditionally in the public API/view-model.

---

## Hero Points (Pathfinder 1e — Advanced Player's Guide / Ultimate Campaign optional subsystem)  — **S**

**Summary.** Hero Points are a lightweight luck/metacurrency subsystem: a character holds a tiny pool (start with 1, gain 1 per level, hard cap of 3 at any time) and spends points for discrete narrative/mechanical effects. The mechanical pillars are: (1) a tracked pool that does NOT reset on rest (points are permanently spent and only regained via awards/leveling), (2) a fixed menu of spend actions — the headline being a +8 luck bonus to a d20 before the roll (+4 after; +4/+2 when aiding another), plus Reroll, Extra Action, Act Out of Turn, Recall, Inspiration, Special, and Cheat Death (costs 2), (3) a per-round-of-combat spend limit of 1 (Cheat Death excepted), and (4) a small set of supporting feats (Blood of Heroes, Hero's Fortune, Luck of Heroes) and spells (Heroic Fortune / Mass) that bump the cap or grant temporary points. For PathForge this is overwhelmingly a tracked pool + a spend log + a couple of derived numbers; the +8 luck bonus is the only thing that touches the modifier engine, and even then it is a manual/conditional bonus rather than an always-on one. The `hero_points` module key already exists in OPTIONAL_RULE_MODULES (group "subsystem", no variantKey), so it stores in rules.modules[] and gates via isModuleKeyEnabled(character, "hero_points").

**Core mechanics:**
- Pool: start 1 at 1st level, +1 per level gained, hard cap of 3 at any time (excess is lost). Points are spent permanently and do NOT renew on rest — distinct from per-day resources.
- Award log: points are granted by the GM/leveling for heroic acts, story milestones, faith, etc. (free-form reasons).
- Spend — Bonus: +8 luck bonus to one d20 roll if declared BEFORE the roll; +4 if AFTER. Aiding another creature: +4 before / +2 after.
- Spend — Reroll: reroll one d20 just rolled; must take the second result even if worse.
- Spend — Extra Action: gain an additional standard or move action on your turn.
- Spend — Act Out of Turn: take your turn immediately (move or standard action) before the current creature, then resume your initiative slot.
- Spend — Recall: recall a spent spell or reuse a daily/limited ability (GM-arbitrated).
- Spend — Inspiration: request a GM hint/clue (no mechanical effect).
- Spend — Special: attempt a near-impossible feat at the GM's discretion (usually with a steep check/penalty).
- Spend — Cheat Death: spend 2 hero points as an immediate action to avoid death; GM narrates the survival outcome.
- Combat spend cap: no more than 1 hero point per round of combat, EXCEPT Cheat Death (which costs 2).
- Supporting feats: Blood of Heroes (gain extra hero points), Hero's Fortune (+1 to max cap, start with 2), Luck of Heroes (on a reroll/before-roll bonus spend, roll d20; >15 means the point is not spent).
- Supporting spells: Heroic Fortune (grant 1 temporary hero point above the normal max), Heroic Fortune, Mass.
- Antihero variant: a character who refuses to ever use hero points gains a bonus feat at 1st level (campaign opt-in flag).

**Data model.** New optional block `character.heroPoints` (heroPointsBlockSchema), gated by isModuleKeyEnabled("hero_points"). Add as an optional field on the canonical character schema and to createDefaultCharacter() as `undefined`/empty.

```
export const heroPointSpendKindSchema = z.enum([
  "bonus","reroll","extra_action","act_out_of_turn",
  "recall","inspiration","special","cheat_death","other",
]);

// One ledger entry. award vs spend distinguished by sign of `amount` or `kind:"award"`.
export const heroPointLogEntrySchema = z.object({
  id: z.string(),
  type: z.enum(["award","spend","adjust"]),
  amount: z.number().int(),                  // award: +n; spend: -n (cheat_death = -2)
  spendKind: heroPointSpendKindSchema.optional(),  // only for type:"spend"
  timing: z.enum(["before_roll","after_roll","aiding_before","aiding_after"]).optional(), // for bonus
  reason: z.string().optional(),             // free-form, "heroic act", "level 5", etc.
  inCombat: z.boolean().optional(),          // drives the 1/round combat-limit hint
  at: z.string().optional(),                 // ISO timestamp
});

export const heroPointsBlockSchema = z.object({
  // Canonical pool — REUSE resourceDefinitionSchema (per:"custom" since it doesn't renew on rest).
  pool: resourceDefinitionSchema.default({ id:"hero-points", label:"Hero Points", current:1, max:3, per:"custom" }),
  baseCap: z.number().int().default(3),       // raised by Hero's Fortune (+1)
  temporaryPoints: z.number().int().default(0), // from Heroic Fortune spell; can exceed cap
  // Supporting feats as typed flags (also discoverable from feats[], but explicit = engine-cheap).
  feats: z.object({
    herosFortune: z.boolean().optional(),     // +1 cap, start with 2
    bloodOfHeroes: z.boolean().optional(),
    luckOfHeroes: z.boolean().optional(),     // reroll/before-spend may not consume (d20>15)
  }).default({}),
  antihero: z.boolean().optional(),           // refuses to use; campaign variant
  log: z.array(heroPointLogEntrySchema).default([]),
  notes: z.string().optional(),
});
```

Extends existing blocks: optionally surface a precomputed pool entry into `summary` (read view-model) but the pool itself lives in heroPoints, NOT meta.resources.list (keep it typed/first-class so the engine can apply the cap). Add a `"heroPoints"` key to PRIVACY_SECTIONS in meta.ts so visibility can be gated.

**Engine.** computeCharacter must, only when isModuleKeyEnabled("hero_points"):
1. Derive `maxHeroPoints = baseCap (3) + (feats.herosFortune ? 1 : 0)` and expose it as a ComputedValue with terms (base 3, Hero's Fortune +1) for the Show-Math inspector.
2. Compute `currentHeroPoints` from the pool (clamped to maxHeroPoints for the persistent pool; `temporaryPoints` tracked separately and allowed to exceed the cap, per Heroic Fortune). Surface effective total = clamp(current, 0, max) + temporary.
3. Surface a small `summary.heroPoints = { current, max, temporary }` view-model field so the read dashboard and API can render it without re-deriving.
4. The +8 luck Bonus does NOT become an always-on modifier. It is a *spendable, conditional* bonus, so the engine should NOT push it into save.all/attack.all/skill.all buckets by default (that would silently inflate every roll). Instead provide a pure helper `heroPointBonusValue(timing): number` (before_roll→+8, after_roll→+4, aiding_before→+4, aiding_after→+2) used by the UI's spend dialog and, if desired, a *toggleable preview buff* that injects a luck-typed modifier into the chosen bucket exactly like BuffCenter does (reuse classifyTarget + applyStacking; bonusType:"luck"). Recommended: model "I am spending a hero point for the bonus right now" as a transient buff/preview, not as a persisted character mod.
5. Enforcement is advisory only: the engine/UI flags (does not block) a second in-combat spend in the same round and a Cheat-Death spend when current<2. No automatic deduction — spending is an explicit user action that appends a log entry and decrements pool.current.
No interaction with HP/BAB/saves math beyond the optional luck-bonus preview; keep it isolated so disabling the module is a clean no-op.

**Editor UI.** A new "Hero Points" editor section in the left "Sheet Sections" sidebar (group it under Settings/Subsystems or a new "Subsystems" cluster), revealed only when isModuleKeyEnabled(character,"hero_points"). Controls (components/character/editor/hero-points-editor.tsx):
- Pool stepper: large current/max display with +/- buttons (NumberField-backed, int-coerced) and a Reset-to-max disabled note ("Hero Points don't refresh on rest").
- Max-cap readout showing base 3 + feat bonus (read-only, computed) with a Show-Math affordance.
- Feat toggles: Hero's Fortune (+1 cap), Blood of Heroes, Luck of Heroes; Antihero checkbox.
- Temporary points field (Heroic Fortune spell).
- "Spend" action row: buttons per spend kind (Bonus / Reroll / Extra Action / Act Out of Turn / Recall / Inspiration / Special / Cheat Death). Clicking opens a tiny dialog: for Bonus, pick timing (before/after, self/aiding) and it shows the resulting +8/+4/+2; for Cheat Death it deducts 2; all append a log entry, decrement the pool, and (for Bonus) optionally toggle a luck-typed preview modifier so live values reflect it. Surfaces the "1 hero point/round in combat" and "need ≥2 for Cheat Death" warnings inline (non-blocking).
- "Award" button (free-form +n with reason) and an Adjust (manual correction).
- Spend/Award log: reverse-chronological list with kind, amount, reason, timestamp, and delete/edit. Gated behind the module toggle; everything writes to character.heroPoints via the standard useCharacterEditor draft+autosave path.

**Read surface.** A compact "Hero Points" card on CharacterDashboard (components/character/character-dashboard.tsx), rendered only when the module is enabled AND the heroPoints section passes the §15 privacy gate. Card shows: current / max as filled pips (e.g. ● ● ○) plus temporary points as a distinct color, the spend-menu quick reference (collapsible), and optionally the last few log entries. The read view-model (lib/character/view-model.ts) adds a gated `heroPoints` field (current/max/temporary, and the log only at higher privacy/GM/owner levels). API/view-model: add to the summary/stats shape in lib/character/api-shapes.ts so /api/v1 .../summary can expose current/max (public-safe: a pip count is low-sensitivity), but withhold the spend LOG and reasons from anonymous/public viewers (reasons can leak GM/story info) — gate the log to owner/GM/party per the privacy section. GM Audit View should see current/max/log to sanity-check awards. Privacy default for the new "heroPoints" section: campaign/party (counts are usually shared at the table) with the log gated tighter.

**Compendium / parser.** No. A searchable compendium + paste-parser does NOT apply. Unlike talents/maneuvers/veils/powers (hundreds of discrete authored options), Hero Points has a CLOSED, tiny menu: ~8 fixed spend kinds, 3 supporting feats, and 2 spells. These are best hand-modeled as a Zod enum (heroPointSpendKindSchema) + boolean feat flags — no Postgres content table, no search RPC, no cached refs. The feats already live in the normal feats[] block (and could be detected there), and the two spells live in the existing spell_compendium / spellcasting flow. So it shares NO infra with spell_compendium and needs none. The only "list" here is the per-character spend/award LOG, which is user-authored history, not a content catalog.

**Phases:**
1. Phase 1 — Schema + storage: add heroPointsBlockSchema (+log entry + spend-kind enum) as optional character.heroPoints, wire into createDefaultCharacter (empty/undefined), add 'heroPoints' to PRIVACY_SECTIONS, regenerate types. Unit tests: parse/default round-trip, cap defaulting. Shippable: data persists, no UI yet. Review.
2. Phase 2 — Engine: compute maxHeroPoints (base 3 + Hero's Fortune) with terms, clamp current, expose summary.heroPoints, add pure heroPointBonusValue(timing) helper and the advisory 1/round + Cheat-Death(<2) warnings. Tests in compute. No buckets touched unless preview-buff path chosen. Review.
3. Phase 3 — Editor section: hero-points-editor.tsx (pool stepper, feat/antihero toggles, temporary points, max readout w/ Show-Math), gated by isModuleKeyEnabled; add to the sidebar. Spend/Award dialogs + log list writing through useCharacterEditor. Review.
4. Phase 4 — Read surface + privacy + API: dashboard Hero Points card (pips + temporary + quick-reference), gated view-model field (counts public-safe, log gated to owner/GM/party), api-shapes + /summary exposure, GM Audit visibility. Optional: luck-bonus preview-buff toggle reusing BuffCenter/classifyTarget. Round-trip privacy test (public never leaks log/reasons). Review.

**Dependencies:** rules.modules[] + isModuleKeyEnabled('hero_points') — the toggle/key already exists in OPTIONAL_RULE_MODULES (optional-rules.ts); no new module wiring needed.; common.ts resourceDefinitionSchema — reused for the pool (per:'custom' since it doesn't renew on rest).; meta.ts PRIVACY_SECTIONS + lib/character/view-model.ts §15 gating — must add a 'heroPoints' section key.; compute.ts engine — for max-cap derivation and the optional luck preview (classifyTarget/applyStacking, bonusType 'luck').; BuffCenter / preview-buff infra (packages/pathforge-rules-pf1e buffs + activeBuffDelta) — only if modeling the +8 spend as a live toggleable modifier rather than a pure helper.; feats[] block + spell_compendium/spellcasting — supporting feats (Blood of Heroes/Hero's Fortune/Luck of Heroes) and Heroic Fortune spell already representable there; heroPoints.feats flags just mirror them for cheap engine reads.; lib/character/api-shapes.ts + /api/v1 summary/stats — to surface current/max.; Mythic module (rules.variants.mythic) — adjacent metacurrency (mythic power); keep separate but note both are 'spendable pools' so UI patterns can be shared, no data coupling.

**Risks:**
- The +8 luck bonus must NOT silently become an always-on modifier — it is conditional/spent-in-the-moment. Pushing it into save.all/attack.all/skill.all by default would inflate every computed value. Model it as a manual helper or an explicit toggleable preview buff, and make it luck-typed so it correctly does not stack with other luck bonuses (e.g. Blood of Heroes / other luck feats).
- The before-roll vs after-roll (+8/+4) and aiding (+4/+2) value matrix is easy to get wrong — encode it once in heroPointBonusValue(timing) and reuse, with a unit test pinning all four values.
- Cap interactions: base 3, Hero's Fortune raises to 4 (and starts you at 2), and Heroic Fortune temporary points are allowed to EXCEED the cap. Persistent pool must clamp to max while temporaryPoints float above it — don't merge them into one clamped number.
- Points do NOT renew on rest — must not be swept up by any 'restore daily resources / new day' logic that resets resourceRef pools. Using per:'custom' and keeping it out of meta.resources.list avoids accidental refresh.
- 1-hero-point-per-combat-round limit and Cheat-Death-costs-2 should be advisory warnings, not hard blocks (GM rulings vary, and Luck of Heroes can refund a spend) — blocking would frustrate table play.
- Luck of Heroes (d20>15 = point not spent) is a probabilistic refund on rerolls/before-roll bonuses; v1 should surface it as a prompt/note rather than auto-rolling, to avoid the engine making dice rolls.
- Privacy leak class: the spend/award LOG reasons can contain GM/story spoilers — gate the log tighter than the bare count; do not expose log to anonymous/public API viewers (mirror the audit/diff privacy-re-gating lesson from M7/M9).
- Antihero variant grants a bonus feat — this is a build-time effect, not a runtime one; represent as a flag and a note, don't try to auto-inject a feat slot in v1.

---

## Wounds & Vigor (Pathfinder 1e variant rule; Pathfinder Unchained / d20pfsrd "Other Rules")  — **M**

**Summary.** Wounds & Vigor (W&V) splits the single hp pool into two: a Vigor pool (VP) that represents stamina/luck and a Wound pool (WP) that represents real bodily harm. VP is computed exactly like hp from Hit Dice (max on the first class HD, rolled/taken thereafter) but WITHOUT adding the Con modifier; WP equals twice the Constitution score, with a Wound Threshold equal to the Con score. Damage burns VP first, then WP; critical hits and lethal effects deal bonus WP damage equal to the crit multiplier directly. Dropping to/below the wound threshold makes you staggered and forces a DC 10 Con check (on any standard/move action) or you fall unconscious; 0 WP is dead. Its mechanical pillars are: (1) a dual VP/WP pool replacing maxHp/currentHp, (2) a Con-derived wound threshold and a distinct status ladder, (3) crit/lethal "wound damage" that bypasses vigor, and (4) parallel healing/rest rules for each pool. It interacts heavily with the existing health block, the engine's hpStatus, and Con-damage/negative-level handling.

**Core mechanics:**
- Vigor Points (VP) max = same HD math as hp (max on first class HD, rolled/taken on later HD) but with NO Constitution modifier added; favored-class +1 hp choices still add to VP
- Wound Points (WP) max = 2 x Constitution SCORE (not modifier)
- Wound Threshold = Constitution score; at WP <= threshold the creature is 'wounded' (staggered)
- Damage order: reduce VP first; overflow spills into WP only after VP hits 0
- Critical hit: normal damage to VP-then-WP, PLUS extra WP damage equal to the weapon's crit multiplier (x2=2 WP, x3=3 WP, x4=4 WP) dealt directly to WP
- Nonlethal damage hits VP only; if no VP remain it deals 1 WP (or crit-multiplier WP on a crit) — i.e. nonlethal can still threaten WP once vigor is gone
- Wounded behavior: while WP <= threshold, taking any standard or move action reduces remaining WP by 1 and forces a DC 10 Con check; fail = unconscious
- Death: WP <= 0 is dead (no separate 'dying at negative hp' band — wounded+failed-check is the unconscious state)
- Constitution damage: each point of Con damage removes 2 WP but does NOT lower the wound threshold; Con penalty/drain removes 1 WP per point for its duration (and drain lowers the threshold since it lowers the score)
- Negative energy / level-scaling damage targets either VP or WP (attacker's choice): WP version deals WP equal to # dice rolled, or equal to caster level for per-CL effects
- Healing: caster chooses to heal VP or WP; VP heal = normal rolled amount, WP heal = number of dice the spell would roll (e.g. CLW heals 1 WP, not 1d8); restoration restores 2 WP per Con point regained
- Rest: 8h sleep restores all VP + 1 WP; full bed rest restores all VP + half character level in WP
- Temporary hp become temporary VP (lost before real VP, never lost to WP-only attacks)

**Data model.** Add a new OPTIONAL sub-block on the existing healthBlockSchema (vitals.ts), gated by rules.variants.woundsVigor — keep hp fields intact so toggling off is lossless. Concretely:

```
// vitals.ts — new schema
export const woundsVigorBlockSchema = z.object({
  // Vigor pool: max mirrors hp math sans Con mod. numberOrFormula so a default
  // formula (@{vigor.max} style) can drive it, but a manual override is allowed.
  maxVigor: numberOrFormulaSchema.default(0),
  currentVigor: z.number().int().default(0),
  tempVigor: z.number().int().default(0),
  // Wound pool: max defaults to 2*Con via formula; threshold = Con score.
  maxWounds: numberOrFormulaSchema.default(0),
  currentWounds: z.number().int().default(0),
  woundThreshold: numberOrFormulaSchema.optional(), // default @{abilities.con.score}
  // Tracking for the wounded action-cost rule (optional, player-driven).
  woundedActionPenalty: z.number().int().default(0),
}).optional();
```

Then add to healthBlockSchema:
```
woundsVigor: woundsVigorBlockSchema,
```

No separate top-level character.woundsVigor block — W&V is a *replacement* for the health pools, so it belongs inside health (it touches maxHp/currentHp/tempHp/nonlethalDamage directly). Reuse existing health.nonlethalDamage as-is (nonlethal already maps to VP-first semantics). Do NOT use resourceRefSchema here: VP/WP are not per-day/per-encounter expendable pools with a refresh cadence — they are damage pools with bespoke healing rules, so explicit current/max/temp fields are clearer than overloading ResourceRef.per. (resourceRef stays the right tool for the mythic-power/hero-point/essence pools in other S4 systems.) woundThreshold and the two maxes are numberOrFormula so default-formulas.ts can supply derived defaults while allowing manual entry/import overrides — same pattern maxHp already uses.

**Engine.** computeCharacter() must branch on isRuleEnabled(character, woundsVigor) (or character.rules.variants.woundsVigor === true) and produce a parallel status path. Concretely in compute.ts:

1. Resolve VP max: if woundsVigor.maxVigor is a formula, evaluate it; the default formula equals the hp formula minus the Con contribution. Since the engine currently just READS character.health.maxHp (HP is stored, not recomputed from hitDice), VP max should follow the same stored-value pattern, with default-formulas.ts providing @{health.maxHp} - @{abilities.con.modifier} * @{identity.totalLevel} as the default-derived value for display/the editor's recompute helper. (Note: subtract con mod * HD count, not con mod once — hp adds con mod per HD.)
2. Resolve WP max default = 2 * con effectiveScore; woundThreshold default = con effectiveScore. Apply Con DAMAGE: subtract 2*conDamage from current WP cap is a player-tracked thing, but the engine should compute the *threshold* from the effective (penalty/drain-adjusted) Con score while keeping maxWounds from the BASE Con score per the rule ('Con damage does not affect the wound threshold' but drain does, because drain lowers the score). Expose both base-Con and effective-Con so the read surface can show the distinction.
3. Add a new status function woundsVigorStatus(currentVigor, currentWounds, woundThreshold): returns 'healthy' | 'vigorDown' (VP 0 but WP>threshold) | 'wounded' (WP<=threshold && >0, => staggered) | 'unconscious' (wounded + failed-check flag, player-set) | 'dead' (WP<=0). Keep the existing hpStatus untouched for non-W&V characters.
4. Extend summary.hp into a discriminated shape OR add summary.woundsVigor: { vigor:{current,max,temp}, wounds:{current,max,threshold}, status, wounded:boolean, staggeredFromWounds:boolean }. Prefer ADD a sibling summary.woundsVigor (optional) rather than mutate summary.hp's shape, so every existing consumer (dashboard, API, view-model) keeps working; mark hp 'inactive' when W&V is on.
5. Push the 'wounded => staggered' condition into the modifier/condition pipeline so it interacts with conditions.ts (staggered already limits actions). When staggeredFromWounds, the engine should surface it the same way other conditions do.
Keep all of this behind the toggle; when off, none of the W&V branch runs.

**Editor UI.** Reveal a "Wounds & Vigor" panel inside the existing Health editor section (vitals/health-editor), gated by isModuleKeyEnabled(character,'wounds_vigor') / rules.variants.woundsVigor. When the toggle is ON, visually de-emphasize (or collapse) the standard Max HP / Current HP / Temp HP NumberFields and show instead:
- Vigor: Current / Max (with a 'recompute from HD' helper button mirroring the hp helper, max = hp-derived minus Con), Temp Vigor.
- Wounds: Current / Max (default 2*Con, recompute button) / Wound Threshold (default = Con, editable for monsters/variants).
- A read-only derived line: 'Wounded at <=threshold; Dead at 0' and the current status chip.
- A 'fell unconscious (failed Con check)' toggle so the player can mark the wounded->unconscious transition the engine can't auto-roll.
Keep nonlethal field shown (it now maps to VP). Use the existing NumberField (int coercion + clearable draft + label association) for all numeric inputs. The Settings 'Optional rules & 3pp' toggle for wounds_vigor already exists and flips rules.variants.woundsVigor; this section just reveals when that's on. Preserve hp values in the draft so toggling W&V off restores the normal hp editor without data loss.

**Read surface.** On the read dashboard (character-dashboard.tsx) the Vitals/Health card must branch: when summary.woundsVigor is present, render a dual-bar 'VIGOR' (current/max, temp overlay) + 'WOUNDS' (current/max) display with the wound threshold marked, plus the status chip (Healthy / Vigor Down / Wounded(staggered) / Unconscious / Dead) instead of the single HP bar. The view-model (lib/character/view-model.ts) must extend vitals to carry an optional woundsVigor object alongside the existing hp object, populated from computed.summary.woundsVigor, and the §15 privacy gating must treat it under the SAME section privacy as health/hp (it is the health pool) — if the health section is private/gm_only, VP/WP are gated identically; do not leak WP (which reveals Con) when hp would be hidden. The public anonymous view-model should expose only what hp currently exposes (e.g. status chip if hp status is public, exact numbers gated the same). API api-shapes.ts /stats + /summary should add an optional woundsVigor field mirroring the hp field, gated identically. Privacy note: maxWounds = 2*Con directly reveals the Constitution score, so it must never be exposed at a looser privacy level than the abilities/con field — gate WP exposure behind BOTH health AND abilities(con) visibility.

**Compendium / parser.** No. Wounds & Vigor is a small fixed set of derived pools and status rules — there is no large catalog of discrete options to search or paste (unlike talents/maneuvers/veils/powers/spells). It needs zero compendium infrastructure and shares none with spell_compendium. The only 'content' is the ~12 status/healing rules, which live as engine logic + a couple of help tooltips, not as data rows.

**Phases:**
1. Phase 1 (schema + defaults): add woundsVigorBlockSchema to vitals.ts under health.woundsVigor, wire default-formulas for maxVigor (hp - conMod*HD), maxWounds (2*Con), woundThreshold (Con). Factory/createDefaultCharacter leaves it undefined. Add schema tests. Shippable: data model exists, parses, round-trips; no behavior change when toggle off.
2. Phase 2 (engine): implement woundsVigorStatus + summary.woundsVigor behind the toggle; resolve VP/WP/threshold from effective vs base Con (Con-damage vs drain distinction); surface 'wounded => staggered' into the condition pipeline. Unit tests in compute.test.ts for each status band, crit-multiplier WP note, and Con-damage threshold behavior. Shippable: correct computed values + status for a W&V character.
3. Phase 3 (read surface + view-model + privacy): extend the view-model vitals with optional woundsVigor, gate it identically to health AND con; render the dual VIGOR/WOUNDS bars + status chip on the dashboard with a privacy test proving WP never leaks Con when hp/abilities are hidden. Shippable: W&V character reads correctly on own/gm/public views.
4. Phase 4 (editor): reveal the W&V panel in the Health editor behind the toggle, with recompute helpers, threshold override, temp-vigor, and the unconscious-flag toggle; preserve hp values on toggle-off. Adversarial review pass. Shippable: full create->edit->view loop for a W&V character.
5. Phase 5 (interactions + API + import): add the optional woundsVigor field to api-shapes /summary+/stats gated correctly; map W&V on/off in the importers/exporters round-trip (Foundry/PathForge) so VP/WP survive; verify negative-level + temp-hp(->temp-vigor) interactions. Shippable: API + import/export aware of W&V.

**Dependencies:** Existing health block (vitals.ts healthBlockSchema) — W&V nests inside it and reuses nonlethalDamage; must stay backward-compatible; The engine hpStatus + summary.hp in compute.ts — W&V adds a parallel status path; must not break non-W&V characters; abilities/computeAbilities (con effectiveScore vs base score) — WP/threshold derive from Con; needs effective-vs-base distinction for Con damage vs drain; rules.variants.woundsVigor + isRuleEnabled/isModuleKeyEnabled (optional-rules.ts) — the gate; already wired in Settings; default-formulas.ts — supplies the derived default formulas for the three maxes/threshold; §15 privacy view-model + api-shapes — must gate WP behind health AND con visibility (WP reveals Con score); conditions.ts staggered/unconscious handling — wounded maps onto existing staggered behavior; negativeLevels handling (already lowers hp ceiling) — needs parallel treatment for VP; importers/exporters (pathforge-json, foundry) — should preserve health.woundsVigor

**Risks:**
- Privacy leak: maxWounds = 2*Con and threshold = Con directly expose the Constitution score — must gate WP behind BOTH the health and abilities(con) section privacy, not just health, or a 'public hp status' setting could leak Con
- Con-damage vs Con-drain asymmetry: rules say Con DAMAGE removes 2 WP but does NOT move the wound threshold, while drain/penalty lowers the score (and thus the threshold) AND removes 1 WP/point — the engine must compute threshold from one Con value and maxWounds adjustments from another; easy to get backwards
- VP-max formula must subtract Con mod per Hit Die (con mod * HD count), not once — mirroring that hp adds con mod every level; a naive 'maxHp - conMod' is wrong for multi-level characters
- The wounded action-cost rule (lose 1 WP + DC10 Con check on each standard/move action, fail=unconscious) cannot be auto-simulated — needs a player-driven 'unconscious' flag and clear UI, not an engine auto-roll
- Healing semantics invert dice meaning (WP heal = number of dice, e.g. CLW=1 WP) — this is reference-only text, but any future 'apply healing' automation must not treat WP healing as the rolled hp amount
- Toggling W&V on/off must be lossless: hp fields and VP/WP fields must both persist so a campaign that drops the variant restores normal hp without data loss
- summary shape change risk: adding W&V by MUTATING summary.hp would break every existing consumer (dashboard/API/view-model/import) — must add a sibling summary.woundsVigor instead
- Temp HP -> temp Vigor: existing tempHp semantics (lost first, not to WP attacks) must be preserved in the VP path; double-counting temp across both pools is a trap

---

## Honor (Pathfinder 1e optional rule, d20pfsrd "Honor" subsystem; originally Ultimate Campaign-adjacent web rule)  — **M**

**Summary.** Honor is a persistent reputation subsystem: a single 0-100 Honor score that starts at (Charisma score + character level) for PCs, drifts up and down through narrative events (witnessed deeds tied to one of six honor "codes" — Chivalric, Criminal, Political, Samurai, Tribal, plus shared general events), and can be spent once per session for temporary social advantages (favors, gifts, loans, a +5 circumstance bonus to a social skill). Its core mechanical pillars are: (1) a tracked score with a min/max clamp and an event ledger that records each gain/loss; (2) a single hard threshold at exactly 0 Honor that imposes -2 on Will saves and -2 on Charisma-based checks (with an option to renounce the code instead); (3) a per-session "spend" mechanic with dice-priced costs the GM sets. There are NO honor dice "checks" (changes are event-driven, not rolled) and NO daily resource pool — Honor is a slowly-moving narrative score, so the data model is a score + a typed event log + a small set of session-spend buttons, not a refreshing pool. The one place it touches the engine is the 0-Honor penalty, which feeds the existing save.will bucket and a new Cha-check penalty path.

**Core mechanics:**
- Single Honor score, integer, clamped 0-100. PC starting value = Charisma SCORE + character level; recomputed when level or Cha permanently changes (track a 'baseline' so manual event deltas aren't lost on recompute). NPC baseline = CR x 5 (not needed for the PC sheet but worth a field).
- Six mutually-non-exclusive honor 'codes' (chivalric, criminal, political, samurai, tribal) each with its own event table, plus a shared 'general' event table. A character follows one (sometimes more) code; the active code(s) determine which event buttons/presets are offered.
- Event-driven gain/loss: discrete point deltas from a fixed table (e.g. complete CR-appropriate Adventure Path +10, flee an easy combat -3, kill a protected honorable ally -20, become a lord +50). Most events require witnesses. Some events are capped 'once per month'. This is a ledger of applied deltas, not a die roll.
- The 0-Honor threshold: when Honor == 0, a -2 penalty applies to Will saves and to Charisma-based checks (Cha ability checks + Cha-based skills: Bluff/Diplomacy/Intimidate/Disguise/Handle Animal/Use Magic Device). The character may instead 'renounce the code' to drop the penalties but forfeit all honor benefits/NPC support — a boolean state.
- Per-session spend (once/session): Favor (1d6-5d6 honor), Gift (1d6 per 2,000gp), Loan (1d6 per 2,000gp, halved, recurring while unreturned), and Skill Bonus (1d6 honor for a session-long +5 circumstance bonus to Bluff/Diplomacy/Intimidate). Costs are GM-rolled; the sheet records the spend as a negative ledger entry and, for Skill Bonus, can surface an optional buff.
- No daily/encounter resource pool and no honor-check dice mechanic — explicitly model as a score + ledger, not a resourceRef pool.

**Data model.** New optional block character.honor (honorBlockSchema), gated by the new 'honor' optional-rule module. Shape:

honorBlockSchema = z.object({
  enabled: z.boolean().default(false),            // mirrors module toggle; lets engine short-circuit
  codes: z.array(z.enum(["chivalric","criminal","political","samurai","tribal"])).default([]),
  // Score is DERIVED, so we store baseline + ledger, not a raw total:
  baseline: z.object({                            // the (Cha score + level) starting value, recomputed
    mode: z.enum(["auto","manual"]).default("auto"),
    manualValue: z.number().int().optional(),     // used when mode==='manual' (e.g. NPC = CR*5)
    cachedAuto: z.number().int().optional(),       // last auto baseline the engine wrote, for display
  }).default({ mode: "auto" }),
  ledger: z.array(honorEventSchema).default([]),  // applied gains/losses
  renounced: z.boolean().default(false),          // dropped the code → no 0-Honor penalty, no benefits
  sessionSpends: z.array(honorSpendSchema).default([]),  // per-session spend log (audit/undo)
  notes: z.string().optional(),
});

honorEventSchema = z.object({
  id: z.string(),
  delta: z.number().int(),                         // +/- honor
  label: z.string(),                               // e.g. "Completed Adventure Path"
  code: z.enum([...,"general"]).default("general"),// which table it came from
  presetKey: z.string().optional(),                // links to the catalog entry (for once/month tracking)
  at: z.string().optional(),                       // ISO date — drives once-per-month caps
  witnessed: z.boolean().default(true),            // RAW: unwitnessed deeds don't count
  note: z.string().optional(),
});

honorSpendSchema = z.object({
  id: z.string(),
  kind: z.enum(["favor","gift","loan","skill_bonus","custom"]),
  cost: z.number().int(),                          // GM-rolled honor cost (stored, also pushed as a ledger entry)
  session: z.string().optional(),                  // session id/label to enforce once/session
  recurring: z.boolean().default(false),           // loans that re-cost until returned
  note: z.string().optional(),
});

Extends: rules.ts OPTIONAL_RULE_MODULES gets a new { key:"honor", name:"Honor", group:"subsystem", description:"Reputation honor score (0-100) with code-based events, a 0-Honor penalty, and per-session honor spends." } entry — group 'subsystem' (no variantKey, so it lives in rules.modules[]). character.ts adds honor: honorBlockSchema after resources. factory.ts createDefaultCharacter() sets honor: { enabled:false, ... }. meta.ts PRIVACY_SECTIONS gains "honor" so the score can be gated. No change to resourceRefSchema is needed (Honor is intentionally NOT a pool).

**Engine.** computeCharacter() gains computeHonor(character) -> { total, baseline, atFloor, penaltyActive, breakdown }, all gated on character.honor.enabled (and not renounced for penalties):
1. baseline: if mode==='auto', baseline = effectiveCha SCORE (abilities.cha.effectiveScore, not modifier) + total character level (progression). Write cachedAuto. If 'manual', use manualValue.
2. total = clamp(baseline + sum(ledger deltas) - sum(active honorSpend costs), 0, 100). Expose as a CalculationResult (path 'honor.total') with terms = [baseline, each significant event group, spend total] so the existing Show-Math inspector renders it for free.
3. The 0-Honor penalty: when total === 0 and !renounced, inject TWO modifiers into buildModifierIndex (this is where Honor touches the rest of the math):
   - save.will: { value:-2, bonusType:'penalty', label:'Dishonored (0 Honor)' } — flows through the existing save.will bucket exactly like a condition.
   - Charisma-based CHECKS: this is the subtle one. Do NOT push to the ability.cha bucket — that bucket modifies the Charisma SCORE (compute.ts computeAbilities line 57), which would wrongly change Cha modifier, spell DCs, etc. Instead push -2 'penalty' mods to skill.bluff, skill.diplomacy, skill.intimidate (and the other Cha-based skills: disguise, handle_animal, use_magic_device) via the existing skill.<name> buckets, plus expose summary.charismaCheckMod = -2 for raw Cha ability checks (which aren't a computed sheet value). classifyTarget already routes skill.<name>; no parser change needed — the honor injector just calls push('skill.bluff', mod) etc. directly, the same way conditions are injected (compute.ts ~line 190).
4. Skill-Bonus spend: if an active skill_bonus spend exists, optionally surface +5 circumstance to bluff/diplomacy/intimidate as a derived buff-like modifier (circumstance bonus, so it stacks with most things) — or leave it as a player-applied buff. Recommend engine-injected so it's automatic and shows in math.
Interactions: the penalty is bonusType 'penalty' so it coexists with condition penalties (Shaken etc.) under the existing applyStacking (penalties stack). Once-per-month caps are validation-time, not engine-time. summary gains { honor, honorBaseline, honorAtFloor }.

**Editor UI.** New "Honor" section in the editor left "Sheet Sections" sidebar, revealed only when isModuleKeyEnabled(character,'honor'). Place it under the "Story"/"Settings" cluster (reputation flavor) or a new "Reputation" group. Components: components/character/editor/honor-editor.tsx. Controls:
- Code selector (multi-checkbox: Chivalric/Criminal/Political/Samurai/Tribal). Active codes drive which event presets show.
- Baseline control: auto (read-only, shows 'Cha score N + level M = baseline') with a 'manual override' toggle revealing a NumberField (reuses the existing int-coercing NumberField).
- Renounce-the-code toggle (with a hint that it removes the 0-Honor penalty but forfeits benefits).
- Current Honor readout: large number + a 0-100 progress meter, plus a 'Dishonored' badge when at 0.
- Event ledger: a list of applied events (label, delta, code, date, witnessed) with add/remove. An "Add event" affordance offers a searchable preset picker grouped by the active codes + General (from the honor-events catalog), each preset prefilling label/delta/presetKey; a "Custom" entry lets free-typed label+delta. Once-per-month presets show a warning if one was already applied this month (validation surfaced inline).
- Session spend panel: four buttons (Favor / Gift / Loan / Skill Bonus) that open a small form to enter the GM-rolled cost (and gp value for gift/loan), recording a honorSpend + a negative ledger entry; a 'once this session' guard. Loans get a 'returned' control to stop the recurring cost.
All gated behind the module toggle in Settings → Optional rules & 3pp (the existing OPTIONAL_RULE_MODULES framework already renders the toggle once the catalog entry is added).

**Read surface.** Read dashboard (character-dashboard.tsx): a new "Honor" card, rendered only when honor.enabled and the section passes the §15 privacy gate. Card shows: the Honor total with a 0-100 meter, the active code(s), a "Dishonored (-2 Will / -2 Cha checks)" warning chip when at floor, and a compact recent-events strip (last few ledger entries). The 0-Honor penalty already shows up inline on Will save and the Cha-based skills via the engine, so it surfaces in those existing cards too (and in Show Math).
View-model (lib/character/view-model.ts §15 buildCharacterViewModel): add vm.honor, gated by a new 'honor' privacy section key (PRIVACY_SECTIONS). Privacy considerations: Honor is reputation and may be sensitive (criminal-code honor especially) — default it to the block's defaultLevel; GMs running campaigns will often want honor visible to them but a player may keep the criminal ledger private. The view-model should expose only { total, codes, atFloor, penalties } at lower privacy and the full ledger only at owner/gm levels — mirror how buffs/spells gate detail. API/Discord shapes (lib/character/api-shapes.ts): honor total can optionally appear in the summary shape behind the public view-model gate (off by default for the anonymous viewer unless the owner marks the honor section public).

**Compendium / parser.** A full Postgres compendium + paste-parser (the spell_compendium pattern) is OVERKILL here and does NOT apply: the honor system has a small, FIXED, fully-enumerable set of events (~30 general + ~15-20 per code across 5 codes ≈ 120 entries total) — orders of magnitude smaller than the 3,034-row spell table, and they are rules text, not user-pasteable stat blocks. There is nothing to search a DB for and nothing to paste/parse. Instead ship a small in-package static catalog: packages/pathforge-schema/src/honor-events.ts exporting HONOR_EVENT_PRESETS: { key, code, label, delta, oncePerMonth? }[] (transcribed verbatim from the six tables in the source). The editor's "Add event" picker filters that array by the character's active codes + General — a lightweight client-side searchable list, sharing NO infra with spell_compendium (no migration, no RPC, no cached refs). This mirrors how buff-templates.ts / metamagic-catalog.ts / class-catalog.ts are static in-package catalogs rather than DB compendia. If 3pp honor expansions ever appear, they'd slot into the existing content_packs/rule_modules manifest, not a bespoke table.

**Phases:**
1. Phase 1 — Schema + catalog + toggle (shippable, no math): add honorBlockSchema/honorEventSchema/honorSpendSchema in a new packages/pathforge-schema/src/honor.ts; wire character.ts (honor block), factory.ts default, meta.ts PRIVACY_SECTIONS '+honor', and the OPTIONAL_RULE_MODULES { key:'honor' } entry. Add honor-events.ts catalog (transcribe the six tables). Zod round-trip + catalog tests. Review.
2. Phase 2 — Engine: computeHonor() (baseline from Cha score + level, clamped total, CalculationResult terms) + the 0-Honor injector into buildModifierIndex (save.will + the Cha-based skill buckets) gated on enabled && !renounced; summary.honor / honorAtFloor / charismaCheckMod. Unit tests: starting value, floor penalty hits Will+Cha-skills but NOT the Cha score/DC, renounce removes it, clamp at 0/100. Review.
3. Phase 3 — Editor section: honor-editor.tsx behind the module toggle — code selector, baseline (auto/manual), renounce, score meter, ledger with the preset picker + custom add, once/month inline validation. Wire into the Sheet Sections sidebar + useCharacterEditor draft. Review.
4. Phase 4 — Read surface + privacy + session spends: dashboard Honor card, vm.honor gating in buildCharacterViewModel behind the 'honor' privacy section, optional API summary field; the session-spend panel (Favor/Gift/Loan/Skill Bonus) writing spends + ledger entries, with the optional engine-injected +5 circumstance Skill-Bonus modifier. Privacy 'public never leaks honor ledger' test. Review.

**Dependencies:** OPTIONAL_RULE_MODULES / isModuleKeyEnabled framework (rules.ts + optional-rules.ts) — Honor is gated by adding a 'honor' subsystem module entry; no variantKey.; computeCharacter / buildModifierIndex / classifyTarget + applyStacking (packages/pathforge-rules-pf1e/src/compute.ts) — the 0-Honor penalty injects into save.will and the Cha-based skill buckets; must use the SAME injection point as conditions (~line 190), not the ability.cha bucket (that modifies the Cha score).; abilities.cha.effectiveScore + progression character level — needed for the auto baseline; recompute must not clobber manual ledger deltas (baseline is separate from ledger).; §15 view-model + PRIVACY_SECTIONS (lib/character/view-model.ts, meta.ts) — needs a new 'honor' section key; the criminal-code ledger is privacy-sensitive.; NumberField + Sheet Sections sidebar + useCharacterEditor (components/character/editor/*) — editor reuse.; Static-catalog pattern (buff-templates.ts / metamagic-catalog.ts) — honor-events.ts follows it; explicitly NOT the spell_compendium DB/RPC path.

**Risks:**
- The 0-Honor 'Cha-based checks' penalty must NOT be modeled as a Charisma score/modifier penalty. Pushing to the ability.cha bucket (compute.ts:57) would change the Cha modifier and cascade into spell save DCs, Cha-based class features, etc. — RAW only penalizes Cha ABILITY CHECKS and Cha-based skills. Inject -2 into the specific Cha-skill buckets + a separate summary.charismaCheckMod instead.
- Baseline vs ledger separation: starting Honor = Cha score + level changes whenever Cha or level changes. If the score were stored as a single number, recompute would wipe player-applied event deltas. Storing baseline (auto-recomputed) + an explicit ledger keeps deltas intact — get this split right in Phase 1 or it's a painful migration later.
- Clamp semantics: total clamps 0-100, but the penalty fires only at EXACTLY 0. A character whose baseline+ledger goes negative is still treated as 0 (penalty on), and excess gains above 100 are capped. Ensure the clamp is applied before the ==0 test and that 'renounced' suppresses the penalty without changing the stored total.
- Once-per-month caps (Craft/Perform/Diplomacy >=30, several code events) are time-based and per-event-type — enforce as soft validation warnings keyed on event.at + presetKey, not hard engine logic; don't silently drop a second event.
- Session-spend bookkeeping: 'once per session' and recurring unreturned loans need a session marker; without a real session concept on the sheet this is honor-system (player-tracked). Model the spend log + recurring flag but keep enforcement advisory to avoid wrongly blocking legitimate spends.
- Multiple codes: a character following more than one code can trigger more events and the General table always applies — the preset picker must union active codes + General without implying the codes are mutually exclusive, and the read card should list all active codes.
- Privacy: criminal/political honor ledgers can reveal in-fiction secrets; default the new 'honor' privacy section conservatively and ensure the public/anonymous view-model exposes at most the total (or nothing), never the event labels.

---

## Stamina and Combat Tricks (Pathfinder Unchained optional rules)  — **M**

**Summary.** Stamina & Combat Tricks is a Pathfinder Unchained optional subsystem that gives martial characters a spendable stamina pool to power "combat tricks" — small bonus effects attached to combat feats the character already possesses. The three mechanical pillars are: (1) a stamina POOL whose maximum equals base attack bonus + Constitution modifier (regained at 1 point per uninterrupted minute of light rest, NOT during combat; dropping to 0 makes you fatigued); (2) the Combat Stamina FEAT (and Extra Stamina, +3 each, up to 3 times) which grants the pool and a generic option to spend up to 5 points after an attack roll for a competence bonus to that roll equal to points spent; and (3) per-FEAT combat tricks — nearly every combat feat gains an associated trick with a fixed stamina cost and effect, declared as a non-action, with multiple different tricks usable per attack but no repeating the same trick within its scope. Note: the task's "1/2 level + Con" and "full-attack refresh" framing is a misremember — canonical is BAB + Con mod, rest-only regain. The design models this as a new optional block plus per-feat trick metadata, with the engine deriving the pool max and feeding the generic attack-bonus option into the existing modifier buckets as a conditional/declared bonus.

**Core mechanics:**
- Stamina pool: max = base attack bonus + Constitution modifier (derived, not stored)
- Pool access requires the Combat Stamina feat (BAB +1 prereq); GM may instead grant it free to everyone, free to fighters, or via fighter bonus feats only — a campaign/character setting
- Extra Stamina feat: +3 to max pool, takeable up to 3 times (so a flat +0/+3/+6/+9 pool bonus)
- Current stamina tracked separately from max; spending is not an action but blocked while unconscious, fatigued, or exhausted
- Regain 1 point per uninterrupted minute of light rest (no combat, no Str/Dex/Con skill or ability checks, at most one move OR standard action per round); free/immediate/swift allowed
- Dropping to 0 stamina = fatigued until you have 1+ point again
- Combat Stamina generic option: after an attack roll but before results revealed, spend up to 5 points for a competence bonus to that attack roll equal to points spent
- Combat tricks: each combat feat you own can grant a trick with a fixed (or formula) stamina cost and a described effect; declared as a non-action
- Usage rule: any number of DIFFERENT tricks on one action/attack (stamina permitting), but never the same trick twice within its scope
- Tricks span effect categories: damage bonuses, action-economy upgrades, condition application, accuracy/DC bonuses, mobility/positioning, defense/AC — too varied to fully auto-compute, so most are reference text + a spend button

**Data model.** New optional block `character.stamina` (mirrors how spheres/psionics would attach) plus light extensions to the existing feats block. Concretely:

`staminaBlockSchema` (new file packages/pathforge-schema/src/stamina.ts, optional in character.ts):
- `enabled: z.boolean().default(false)` — redundant safety with the rules toggle but lets the block exist dormant.
- `access: z.enum(["feat","free_all","free_fighter","fighter_bonus_feat"]).default("feat")` — the four GM implementation paths from the source.
- `pool: resourceRefSchema` — REUSE the canonical pool model. id `"stamina"`, label "Stamina", `per: "rest"`, `current: number`, and `max` left as a `formulaRef` `{ formula: "@{combat.bab.total} + @{abilities.con.mod} + @{stamina.extra}", label: "Stamina Pool" }` so the engine derives it. (current is the only truly player-mutated field.)
- `extraStaminaRanks: z.number().int().min(0).max(3).default(0)` — how many times Extra Stamina was taken; engine turns it into +3 each.
- `lastSpentLog: z.array(z.object({ round: z.number().int(), trickId: z.string().optional(), label: z.string(), cost: z.number().int() })).default([])` — optional per-encounter spend history to enforce "same trick not twice within scope" and show recent spends (capped length).
- `notes: z.string().optional()`.

Per-feat trick metadata — extend `featEntrySchema` (feats.ts) with an optional `combatTrick`:
`combatTrickSchema = z.object({ id: z.string(), name: z.string(), cost: numberOrFormulaSchema, effect: z.string(), category: z.enum(["damage","action","condition","accuracy","mobility","defense","misc"]).default("misc"), scope: z.enum(["attack","round","action","encounter"]).default("attack"), automation: z.array(automationEffectSchema).default([]), source: sourceRefSchema.optional() })`. Add `combatTrick: combatTrickSchema.optional()` to featEntry (a feat has at most one canonical trick). The optional `automation[]` lets simple, always-on-when-declared tricks (e.g. a flat damage or AC bonus) feed the modifier engine via existing `effectToMod`; complex tricks stay reference-only.

Rules wiring: add a `combat_stamina` entry to OPTIONAL_RULE_MODULES (group "paizo", no variantKey → lives in `rules.modules[]`), so `isModuleKeyEnabled(character, "combat_stamina")` gates the block/UI. No new variantKey needed.

factory.ts: `createDefaultCharacter()` seeds `stamina` with `{ enabled:false, access:"feat", pool:{ id:"stamina", label:"Stamina", per:"rest", current:0, max:{formula:"@{combat.bab.total} + @{abilities.con.mod}"} }, extraStaminaRanks:0, lastSpentLog:[] }`.

**Engine.** computeCharacter must (all gated behind `isModuleKeyEnabled(character,"combat_stamina")` so non-users pay nothing):
1. Derive the pool MAX: evaluate `@{combat.bab.total} + @{abilities.con.mod} + (3 * extraStaminaRanks)` through the existing CharacterResolver (it already resolves `combat.bab.total` and ability mods). Expose as a `ComputedValue` with `terms` (BAB, Con mod, Extra Stamina ranks) so the Show-Math inspector works exactly like AC/saves. Add a `CharacterResolver` path `@{stamina.max}` / `@{stamina.current}` so trick cost formulas and the generic option can reference the pool.
2. Add the derived pool to the `summary`: `summary.stamina = { max, current, fatiguedAtZero: current<=0, available: access!=="feat" || hasCombatStaminaFeat }` (detect the Combat Stamina feat by name/tag in feats.list when access==="feat").
3. The Combat Stamina generic attack-bonus option is a DECLARED, conditional bonus — it must NOT auto-inflate the base attack total (it's spent reactively). Model it like the existing conditional modifiers: surface a computed "Combat Stamina attack bonus (spend up to 5)" capability rather than pushing it unconditionally into `attack.all`. When the player declares a spend in the UI, the editor can write a temporary buff/conditional modifier targeting `attack.all` with bonusType `competence` (so the existing stacking engine caps it against other competence bonuses) — reusing the modifier bucket path. The engine's job is just to expose max-spend (min(5, current)) on the summary.
4. Trick `automation[]` already flows through `buildModifierIndex` if a trick is attached to an ACTIVE buff; for a one-shot declared trick the editor materializes it as a short-duration buff so `effectToMod`/`classifyTarget` route it into the right bucket (damage tricks have no bucket today → kept as reference text / attack-line note, not folded into totals).
5. Validation hooks: warn if `pool.current > computed max`; warn if access==="feat" but no Combat Stamina feat present; warn if a declared trick cost exceeds current stamina. These are non-blocking `warnings` on the computed result.

**Editor UI.** A new "Stamina" section in the editor's left "Sheet Sections" sidebar (under the Attacks/Combat group), revealed only when `isModuleKeyEnabled(character,"combat_stamina")` (same reveal pattern spheres/psionics will use). Components under components/character/editor/stamina-editor.tsx:
- Pool card: current/max display (max read-only, derived; Show-Math chip), a +/- stepper and "Rest 1 min (+1)" / "Full rest (reset to max)" / "Spend…" buttons writing only `pool.current`. A fatigued warning chip when current is 0.
- Access selector (the 4 GM paths) — small select, defaults to feat; shown as read-only campaign-locked if a campaign module forces a value (ties into §17 campaign modules later).
- Extra Stamina ranks stepper (0–3) with live "+N to pool" echo.
- Combat Tricks list: auto-populated from `feats.list` where `feat.type`/`tags` mark it a combat feat. Each row shows the feat name and an editable trick sub-form (name, cost as number-or-ƒx formula reusing the existing ƒx toggle from custom buffs, category, scope, effect text, optional automation effect). A "Spend this trick" button decrements `pool.current` by the resolved cost, logs to `lastSpentLog`, and (if the trick has automation) spins up a short buff so the bonus reaches the engine — disabled when cost > current or when the same trick is already in-scope this round.
Settings tab gets the `combat_stamina` toggle in the existing Optional rules & 3pp framework (no new UI framework needed). NumberField (int-coercing, label-associated) is reused for all numeric inputs.

**Read surface.** Read dashboard (components/character/character-dashboard.tsx) gains a compact "Stamina" card in the Defenses/Combat column, shown only when the module is enabled AND the viewer is allowed: pool as `current / max` with a small pip/bar, a fatigued badge at 0, and a collapsed list of available combat tricks (name + cost + one-line effect) via the existing `<ShowMore>` children-based component (NOT a function prop — respects the RSC boundary gotcha). The §15 privacy view-model (lib/character/view-model.ts) needs a new privacy section key `stamina` added to PRIVACY_SECTIONS; the view-model gates the stamina card/trick list like buffs (default visible to party/campaign, hideable). The API view-model + summary already carry `summary.stamina` numbers (max/current/available) — these are public-safe (a pool size leaks no secret backstory), but the trick list (which feats you have) should follow the same gating as feats/buffs. Add `stamina` to the api-shapes summary so /characters/{id}/stats and the Discord card can show "Stamina X/Y". Privacy consideration: don't expose `lastSpentLog` or `notes` to non-owners (owner_only), since they reveal tactical play.

**Compendium / parser.** A full spell_compendium-style Postgres table + search RPC is NOT warranted here, and this is the key scope-saver. Combat tricks are not a free-standing catalog of hundreds of independently-pickable options the way talents/maneuvers/veils/powers are — each trick is bound 1:1 to a combat feat the character ALREADY has, so the character's existing feats.list IS the index. There is no "browse and add a trick" flow; you reveal tricks for feats already owned. Therefore: ship a static, hand-authored constant `COMBAT_TRICK_LIBRARY` (packages/pathforge-schema/src/combat-trick-catalog.ts) — a `Record<featNameKey, CombatTrick>` mapping the ~40–60 most common combat feats (Power Attack, Cleave, Deadly Aim, Vital Strike, Combat Expertise, Dazzling Display, the named examples confirmed from source: Cleave −2-AC negation 4pts, Deadly Aim penalty-reduction 4pts, Vital Strike reroll-2-dice 2pts, etc.), mirroring `buff-templates.ts`/`metamagic-catalog.ts` rather than a DB table. When a feat is present and has a known trick, the editor offers "Apply trick from library" (paste-time cache of cost/effect/automation onto `feat.combatTrick`), reusing the same paste-cache pattern spells use — but against an in-repo constant, not a search RPC. If a 3pp/homebrew feat has no library entry, the user authors the trick inline (the editable sub-form). So: same paste-to-cache philosophy, much lighter infra (no migration, no RPC) because the domain is bounded by the character's own feats.

**Phases:**
1. Phase 1 — schema + toggle (shippable): add staminaBlockSchema (new stamina.ts) + optional `character.stamina`, extend featEntry with optional `combatTrick`, add `combat_stamina` to OPTIONAL_RULE_MODULES, seed in factory, add `stamina` to PRIVACY_SECTIONS, regenerate types, write Zod unit tests (default char valid, parse round-trips). Review.
2. Phase 2 — engine: derive pool max via resolver (BAB+Con+3*extra) with `terms`, add `@{stamina.max}`/`@{stamina.current}` resolver paths, surface `summary.stamina`, add non-blocking validation warnings (current>max, feat-access-without-feat, overspend). Unit tests in the rules package covering the BAB+Con math and the access modes. Review.
3. Phase 3 — editor section: stamina-editor.tsx behind the module toggle — pool card with current stepper + rest/reset/spend, access selector, Extra Stamina ranks, and per-combat-feat trick sub-forms with the ƒx cost toggle and a spend button (decrement + lastSpentLog + same-trick-in-scope guard). Wire into the Sheet Sections sidebar + Settings toggle. Review.
4. Phase 4 — combat-trick library + paste-cache: author COMBAT_TRICK_LIBRARY constant (named examples from source first, then common combat feats), add 'Apply trick from library' to the editor that caches cost/effect/automation onto feat.combatTrick, and the 'declare trick → short buff' path so simple automation tricks reach the modifier buckets. Review.
5. Phase 5 — read surface + privacy + API: stamina card on the dashboard (ShowMore children-based), view-model gating for the `stamina` section + trick list, add stamina to api-shapes summary + Discord card, ensure lastSpentLog/notes are owner_only. Privacy/render tests proving 'public never leaks tactical log'. Review.

**Dependencies:** resourceRefSchema (common.ts) — REUSED as the pool model (id/label/max-formula/current/per:rest); CharacterResolver / @{combat.bab.total} + ability-mod paths (compute.ts) — already resolvable; add @{stamina.*} paths; Modifier buckets + classifyTarget + applyStacking (compute.ts) — the generic Combat Stamina attack bonus and simple trick automation route through attack.all with competence bonusType; feats.list + featEntry.id/tags (feats.ts) — combat tricks attach per-feat; feats.list is the trick index (replaces any need for a compendium); OPTIONAL_RULE_MODULES + isModuleKeyEnabled (optional-rules.ts) — must add the combat_stamina key; gates every reveal; buff-templates.ts / metamagic-catalog.ts — pattern to mirror for the static COMBAT_TRICK_LIBRARY; §15 view-model + PRIVACY_SECTIONS (meta.ts, view-model.ts) — new `stamina` section key + gating; Buff system (buffs.ts) — declared tricks materialize as short-duration buffs so their automation reaches the engine; Conditions engine (compute.ts conditionEffects) — 'fatigued at 0 stamina' overlaps the existing Fatigued condition; coordinate so a stamina-zero fatigue and a separately-listed Fatigued condition don't double-apply (the existing de-dup by normalized name helps)

**Risks:**
- Source-vs-task mismatch: the task brief says '1/2 level + Con' and 'full-attack refresh' — canonical (verified d20pfsrd + AoN) is BAB + Con mod and REST-ONLY regain (1/min). Build to canonical; if a campaign wants the half-level variant, expose it as an access/setting later rather than hardcoding.
- The Combat Stamina generic +X attack bonus is reactive (declared after the roll). It must NOT silently inflate the base attack total — getting this wrong over-buffs every attack. Model as a declared/conditional spend, not an always-on modifier.
- Combat tricks are highly heterogeneous (damage, action economy, conditions, DCs, movement, AC) — most cannot be auto-computed. Resist over-engineering: only flat numeric tricks (AC/attack/damage bonuses) get automation; the rest are reference text + a stamina-spend button. Authoring all ~100+ combat-feat tricks is out of scope; library covers the common ones, user authors the rest.
- 'Same trick not twice within its scope' needs scope tracking (attack/round/action/encounter) — the lastSpentLog + scope enum enforce it, but scope boundaries (when does 'round' reset?) are GM-driven; keep enforcement advisory (warn/disable button), not hard-blocking.
- Fatigue interaction: dropping to 0 stamina imposes Fatigued, which itself reduces Str/Dex; ensure the engine's fatigue-from-zero-stamina and a manually-listed Fatigued condition don't stack into double −2. Reuse the existing condition de-dup.
- Extra Stamina caps at 3 ranks (+9). Validate the rank ceiling and that the pool-max formula reads ranks, not a free-typed number, to prevent abuse.
- Access mode 'feat' requires detecting the Combat Stamina feat reliably; name-matching is brittle for imported sheets — prefer a tag/flag and fall back to name match, with a warning rather than silently denying the pool.

---

## Gestalt (two-classes-per-level "best of" variant)  — **M**

**Summary.** Gestalt is a high-power variant where a character advances in TWO classes at every character level simultaneously and takes the BEST of each per level: the larger Hit Die, the better BAB progression, the better progression for EACH save independently, the larger skill-points-per-level (with the union of both class skill lists), and ALL class features of both classes. The only hard restriction is you can't pair two prestige classes (prestige + base is fine). The Spheres of Power "Spheres Gestalt" variant keeps that same "best of" core but adds three rules: caster level and talent progression STACK across both casting tracks (continuous, not separate), a class lacking a caster level gets an effective CL inverse to its BAB (full BAB → low-caster, ¾ → mid, ½ → high), and a practitioner gains only ONE martial tradition no matter how many martial classes they have — plus an explicit "GM must review" power caveat. Its mechanical pillars are: a second class TRACK paired per character level, and a "best-of two tracks" recompute of BAB/saves/HP/skills that REPLACES the current additive (sum-per-class) recompute.

**Core mechanics:**
- Two classes advance in lockstep at every character level (a 'gestalt level' pairs class A + class B)
- Hit Dice: per level take the LARGER hit die of the two paired classes
- BAB: take the better of the two progressions (computed per-level on the better track, summed)
- Saving throws: for EACH of Fort/Ref/Will independently, take the better progression of the two classes
- Skill points/level: take the larger skill-points-per-level number; class-skill list is the UNION of both classes
- Class features: gain ALL features of BOTH classes (no merging — additive)
- Restriction: cannot pair two prestige classes at the same level; prestige + base is allowed
- Favored class / FCB: one favored class as normal (variant; engine keeps existing single-FCB handling)
- Spheres variant: caster level + magic/martial talents STACK across both casting tracks (continuous progression)
- Spheres variant: a non-caster class's effective CL = inverse of its BAB (full→low, ¾→mid, ½→high caster)
- Spheres variant: only ONE martial tradition regardless of how many martial classes
- Power caveat: GM-review-gated by nature (ties into the existing campaign module-mismatch + GM audit flow)

**Data model.** Gestalt fundamentally needs per-character-level pairing of two class tracks, because "best of" is evaluated level-by-level then summed — and the current model (`identity.classes: CharacterClass[]` with a flat `level`) can't express "which two classes occupy character level N." Two concrete additions:

1) EXTEND `characterClassSchema` (identity.ts) with an optional track tag so the existing flat list can keep working when gestalt is OFF, while gestalt reads it:
   - `track: z.enum(["a","b"]).optional()` — which gestalt side this row's levels belong to.
   - (presetKey already links to CLASS_CATALOG, which is what the recompute reads.)

2) ADD a NEW optional block `character.gestalt` (new file `gestalt.ts`, wired as an optional key on `characterSchema` like other systems):
```
export const gestaltLevelSchema = z.object({
  level: z.number().int().min(1),            // character level (1..N)
  classAId: z.string(),                      // FK -> identity.classes[].id (track A)
  classBId: z.string().nullable().optional(),// track B; null = single-classed at this level (legal)
});
export const gestaltBlockSchema = z.object({
  enabled: z.boolean().default(false),       // mirrors rules.modules 'gestalt' toggle; convenience
  levels: z.array(gestaltLevelSchema).default([]),  // the per-level pairing grid (source of truth)
  spheresGestalt: z.boolean().default(false),// turn on the Spheres-specific CL-stack + tradition rules
  martialTradition: z.string().optional(),   // single tradition (Spheres-gestalt only)
  notes: z.string().optional(),              // unmapped/GM notes (import-never-discards)
});
```
Pools (Spheres spell points, etc.) already use `resourceRefSchema` — gestalt adds NO new pool; it just makes the existing Spheres caster's CL the stacked value. No new bonus buckets needed (BAB/saves/HP are STORED numbers the engine reads, not modifier-bucket values). The `gestalt` module key is added to `OPTIONAL_RULE_MODULES` (optional-rules.ts) in the `paizo`/`subsystem` group so `isModuleKeyEnabled(character,'gestalt')` gates the section.

**Engine.** CRITICAL ARCHITECTURE FACT: BAB/saves/HP are NOT computed in `compute.ts` at render time — the engine reads STORED fields (`combat.bab.total`, `defenses.savingThrows.*.base`, `health.maxHp`). The class→number math lives in `packages/pathforge-schema/src/class-catalog.ts` (`recomputeClassDerived` / `computeMaxHpFromLevels`), which currently SUMS `babForLevel`/`saveBaseForLevel` over each class row. So gestalt is implemented as a NEW recompute path there, NOT a change to `compute.ts`.

New pure functions in class-catalog.ts (reusing the existing `babForLevel`, `saveBaseForLevel`, `avgPerHitDie`):
- `recomputeGestaltDerived(character)`: iterate `gestalt.levels` (the per-level grid). For each character level L, resolve presetA/presetB from the two classIds → presets. Compute the better TRACK totals by summing per-level deltas:
  - BAB: sum over levels of `max(babForLevel(progA, n)-babForLevel(progA,n-1), babForLevel(progB,n)-babForLevel(progB,n-1))` using each track's running class-level — i.e. take the better progression. (Simpler faithful impl: track per-side accumulated class level, and at each char level add the larger of the two single-level BAB increments.)
  - Each save independently: same per-level "better increment" sum, so Fort/Ref/Will each take the better of the two good/poor progressions.
  - Writes the same stored fields `recomputeClassDerived` writes (`combat.bab.total`, `saves.*.base`), so `compute.ts` is untouched.
- `computeGestaltMaxHp(character, method)`: per character level, hp die = `max(hitDieA, hitDieB)`; level 1 takes the max die full; later levels take die or avg; +Con per HD (min 1), + FCB. Replaces `computeMaxHpFromLevels`'s per-class loop with the per-level-max loop.
- Skills budget (advisory, never auto-distributed): per level `max(skillRanksA, skillRanksB) + intMod`; class-skill set = UNION of both presets' `classSkillKeys` (mark `classSkill=true` on union; same non-destructive union already in `applyClassPreset` step 3).
- Spheres-gestalt CL stack: when `gestalt.spheresGestalt`, the caster sync loop sets the Spheres caster's `casterLevel` = sum across ALL levels of the BETTER caster contribution, where a non-caster side contributes inverse-of-BAB CL (full BAB→×? low: count as low-caster level, ¾→mid, ½→high). Concretely map BAB progression → caster fraction and accumulate; write to the existing Spheres caster entry's `casterLevel` (number or formula) so `computeSpellcasting` reads it unchanged.
`computeCharacter` itself needs NO change — it keeps reading the stored values these recompute functions write. The gestalt recompute is invoked from the save action / editor "recompute" the same way `recomputeClassDerived` already is.

**Editor UI.** A new "Gestalt" editor section in `components/character/editor/` (e.g. `gestalt-editor.tsx`), revealed in the left "Sheet Sections" sidebar ONLY when `isModuleKeyEnabled(character,'gestalt')` (toggled in Settings → Optional rules & 3pp, where the `gestalt` module is added). Controls:
- A per-level PAIRING GRID: one row per character level (1..totalLevel), each row has Track A class picker + Track B class picker (both drawing from CLASS_CATALOG presets, with a "custom/none" option). This is the `gestalt.levels` source of truth. Validation surfaces the "two prestige classes can't pair" rule (needs a `prestige: boolean` flag added to ClassPreset, currently absent — minor catalog extension).
- A "Recompute from gestalt" button calling `recomputeGestaltDerived` (parallel to the existing class recompute button), with the same dry-run report (`wrote`/`warnings`) shown inline.
- Spheres sub-panel (shown when Spheres-of-Power module is ALSO enabled): a `spheresGestalt` toggle, a single `martialTradition` text/select, and an explanation that CL stacks + non-casters use inverse-of-BAB.
- HP method (manual/average/max) reusing the existing `HpMethod` control.
Reuse existing `NumberField`/class-picker patterns from `character-editor.tsx`/`combat-editor.tsx`. Everything gated so a non-gestalt sheet is visually unchanged.

**Read surface.** On the read dashboard (`components/character/character-dashboard.tsx`), add a small "Gestalt" indicator only when enabled: show each character level's A/B pairing (compact "Fighter // Wizard ×5, Fighter // Rogue ×3" roll-up) and a note that BAB/saves/HP are best-of-two. The core stats (BAB, saves, HP, skills) need NO new card — they already render from the stored values the gestalt recompute writes, so they're automatically correct. For Spheres-gestalt, the existing spellcasting card already shows the (now-stacked) caster level with no change. View-model/API: gestalt pairing is build/identity info — gate it under the existing identity/class section privacy in `lib/character/view-model.ts` (add the `gestalt` block to the gated section list so a `private` identity hides the pairing grid; the derived stats remain visible as normal). No new privacy class — it rides the identity gate. Campaign GM audit (`lib/character/audit.ts`) should flag gestalt as a power variant requiring approval, hooking the existing module-mismatch/adopt flow (§17.2) since the source rules explicitly call for GM review.

**Compendium / parser.** No — a searchable compendium + paste-parser does NOT apply to gestalt itself. Gestalt is a STRUCTURAL meta-rule (a per-level pairing of two existing classes + a recompute), not a library of hundreds of discrete options like talents/maneuvers/veils/powers. There is nothing to paste-parse: the inputs are just two class selections per level, drawn from the already-existing CLASS_CATALOG preset list (the proven, in-repo source for class mechanics). It does NOT share infra with spell_compendium and does not need its own Postgres table or search RPC. (The ONLY adjacent compendium concern is downstream: a Spheres-gestalt character's magic/martial talents would use the separate Spheres talent compendium planned for S4 — but that's the Spheres systems' compendium, not gestalt's.)

**Phases:**
1. Phase 1 (schema + catalog math): add `track` to characterClassSchema, new `gestalt.ts` block + wire optional key on characterSchema, add `gestalt` to OPTIONAL_RULE_MODULES, add `prestige` flag to ClassPreset; implement pure `recomputeGestaltDerived` + `computeGestaltMaxHp` + gestalt skill-budget/class-skill-union in class-catalog.ts with unit tests proving best-of-two BAB/saves/HP against hand-worked examples (e.g. fighter//wizard, conscript//striker save grid). Shippable: math correct, no UI.
2. Phase 2 (recompute wiring): invoke gestalt recompute from the save action + editor recompute button (parallel to recomputeClassDerived), with dry-run report. Validate the no-two-prestige rule. Shippable: a gestalt sheet computes correct stored BAB/saves/HP/skills end to end.
3. Phase 3 (editor UI): `gestalt-editor.tsx` per-level pairing grid + recompute button + HP method, gated behind the module toggle in the Sheet Sections sidebar; Settings toggle for the `gestalt` module. Shippable: build a gestalt character in the UI.
4. Phase 4 (read surface + privacy + GM audit): dashboard pairing roll-up, view-model gating under identity, audit-flag gestalt as a GM-review power variant via the §17.2 module-mismatch flow. Shippable: gestalt visible/shareable with correct privacy + GM review.
5. Phase 5 (Spheres gestalt): `spheresGestalt` toggle + single `martialTradition` + stacked-CL recompute (inverse-of-BAB for non-casters) writing the Spheres caster's casterLevel; tests for the CL-stack + inverse-BAB mapping. Shippable: Spheres Gestalt fully supported. (Can be deferred until the Spheres-of-Power system itself ships under S4.)

**Dependencies:** class-catalog.ts (CLASS_CATALOG presets + babForLevel/saveBaseForLevel/computeMaxHpFromLevels) — gestalt REPLACES the additive recompute path with a best-of-two path; both must coexist (gestalt on/off); optional-rules.ts framework (isModuleKeyEnabled) — gates the editor section; needs a new `gestalt` module entry; The class-derived recompute is invoked from the save action / editor recompute button (lib/actions sheet-save + useCharacterEditor) — gestalt must hook the same trigger; Spheres of Power system (S4, not yet built) — the Spheres-gestalt sub-variant depends on the Spheres caster entry + spell-point pool + talent compendium existing; Phase 5 should follow Spheres; view-model.ts identity/class section gating + audit.ts GM-review flow (§17.2 module-mismatch) for the power-variant approval; fractionalBabSaves variant (rules.variants) — potential interaction: gestalt + fractional BAB/saves compound; decide ordering (compute fractional per track, then max) or declare them mutually exclusive in v1

**Risks:**
- Per-level 'better progression' must be computed as the better TRACK (summed per-level increments), NOT max(totalA,totalB) of full totals — for monotonic BAB they coincide, but for SAVES the good-save +2 floor at level 1 means you must take the better progression PER SAVE independently and the +2 first-level jump only once per save; getting the floor + per-level increment right is the trickiest math.
- The current data model can't express which two classes pair at each character level — gestalt REQUIRES the new per-level grid (gestalt.levels); a naive 'just two flat class rows' breaks when the pairing changes mid-career (e.g. fighter//wizard for 5 then fighter//rogue) and breaks HP's per-level larger-die rule.
- HP best-die is PER LEVEL (max die that level), and the level-1-takes-full-die rule must use the level-1 pairing's larger die — easy to compute against the wrong row.
- Two-prestige-class restriction needs a `prestige` flag on ClassPreset (absent today) and per-level validation; current catalog has only base classes.
- Spheres inverse-of-BAB CL mapping (full BAB→low-caster, ¾→mid, ½→high) and CL STACKING across both tracks is non-obvious and easy to under/over-count; must write the Spheres caster's casterLevel without double-counting a side that is itself a caster.
- Single martial tradition (Spheres) must be enforced as one value even with multiple martial classes — a data-shape decision (single field, not per-class).
- Interaction with fractionalBabSaves and with multiclass FCB/level-plan rows — define precedence so recompute paths don't fight (gestalt recompute should be the sole writer of BAB/saves/HP when enabled).
- Idempotency: like recomputeClassDerived, the gestalt recompute must be a full recompute (not additive) so re-running never double-counts.
