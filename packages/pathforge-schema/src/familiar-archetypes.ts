// GENERATED from the d20pfsrd familiar-archetype pages (2026-07-01 extraction workflow).
// Names + replaced abilities power the familiar granted-ability computation; notes are compact
// paraphrases for display. Source: d20pfsrd.com (OGL).

export type FamiliarArchetypeAbility = {
  name: string;
  /** Master level the ability comes online. */
  masterLevel: number;
  note: string;
  /** The standard familiar ability this replaces/alters (matched case-insensitively); empty = pure addition. */
  replaces: string;
};

export type FamiliarArchetype = {
  name: string;
  summary: string;
  source?: string;
  abilities: FamiliarArchetypeAbility[];
};

export const FAMILIAR_ARCHETYPES: FamiliarArchetype[] = [
  {
    "name": "Ambassador",
    "summary": "An ambassador familiar speaks on its master's behalf, and sometimes for its master's patron or extraplanar contacts.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness © 2017, Paizo Inc.",
    "abilities": [
      {
        "name": "Ambassador Skills",
        "masterLevel": 1,
        "note": "The ambassador treats Bluff, Diplomacy, and Intimidate as class skills. It must be able to speak at least one language (e.g. a raven/thrush or an improved familiar) to take this archetype.",
        "replaces": ""
      },
      {
        "name": "Persuasive (Ex)",
        "masterLevel": 1,
        "note": "An ambassador gains Persuasive as a bonus feat.",
        "replaces": "Alertness"
      },
      {
        "name": "Enhanced Personality (Ex)",
        "masterLevel": 1,
        "note": "The ambassador gains a Charisma score equal to the typical Intelligence score of a familiar of its level, if higher than its normal Charisma. Its Intelligence stays at 6 (or its normal starting score for improved familiars) and does not increase with level.",
        "replaces": "Intelligence score advancement"
      }
    ]
  },
  {
    "name": "Animal Exemplar",
    "summary": "An animal exemplar is a paragon of its species, able to command the loyalty of others of its kind.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness © 2017, Paizo Inc.",
    "abilities": [
      {
        "name": "Handle Animal class skill",
        "masterLevel": 1,
        "note": "The familiar gains Handle Animal as a class skill. It cannot be an improved familiar or a plant, vermin, or other non-animal familiar.",
        "replaces": ""
      },
      {
        "name": "Influence Animals — speak with animals of its kind",
        "masterLevel": 3,
        "note": "Gains the ability to speak with animals of its own kind at master level 3rd instead of the normal 7th.",
        "replaces": "speak with animals of its kind (alters)"
      },
      {
        "name": "Influence Animals — wild empathy",
        "masterLevel": 7,
        "note": "Can influence animals of its kind as a druid's wild empathy using the master's level, with a +4 racial bonus on the check; works only on the familiar's own species.",
        "replaces": "deliver touch spells"
      },
      {
        "name": "Influence Animals — charm animal",
        "masterLevel": 11,
        "note": "Can cast charm animal 3/day as a spell-like ability, usable only against animals of its kind.",
        "replaces": "spell resistance"
      },
      {
        "name": "Influence Animals — dominate animal",
        "masterLevel": 13,
        "note": "Can cast dominate animal 1/day as a spell-like ability, usable only against animals of its kind.",
        "replaces": "scry on familiar"
      }
    ]
  },
  {
    "name": "Arcane Amplifier",
    "summary": "A familiar archetype, first developed by winter witches, that amplifies its master's magic by applying metamagic effects to touch spells it delivers.",
    "source": "Pathfinder Player Companion: Wilderness Origins © 2019",
    "abilities": [
      {
        "name": "Echo (Su)",
        "masterLevel": 1,
        "note": "Once per day when delivering a touch spell, the familiar applies the Extend Spell metamagic feat. Increases to 2/day at master level 8 and 3/day at 13.",
        "replaces": "Alertness and improved evasion"
      },
      {
        "name": "Reverberate (Su)",
        "masterLevel": 7,
        "note": "Once per day when delivering a touch spell, the familiar applies Empower Spell or Heighten Spell (raising the spell level by 2). Increases to 2/day at master level 11.",
        "replaces": "speak with animals of its kind and spell resistance"
      },
      {
        "name": "Resonate (Su)",
        "masterLevel": 13,
        "note": "Once per day when delivering a touch spell, the familiar applies the Maximize Spell metamagic feat. Only one metamagic effect from echo/reverberate/resonate may apply to a single casting.",
        "replaces": "scry on familiar"
      }
    ]
  },
  {
    "name": "Decoy",
    "summary": "A decoy misdirects its master's enemies, allowing the master to strike by surprise.",
    "source": "Pathfinder Player Companion: Familiar Folio © 2015, Paizo Inc.",
    "abilities": [
      {
        "name": "Class Skills",
        "masterLevel": 1,
        "note": "A decoy treats Bluff as a class skill.",
        "replaces": ""
      },
      {
        "name": "Deceitful",
        "masterLevel": 1,
        "note": "The decoy gains Deceitful as a bonus feat.",
        "replaces": "Alertness"
      },
      {
        "name": "Mockingbird (Ex)",
        "masterLevel": 5,
        "note": "At 5th level the decoy can speak any of its master's languages; at 7th level it can mimic its master's voice and intonation perfectly.",
        "replaces": "speak with master and speak with animals of its kind"
      },
      {
        "name": "Master's Guise (Sp)",
        "masterLevel": 11,
        "note": "The decoy can transform into a perfect likeness of its master as alter self, holding the form up to 1 minute per caster level. After reverting, it must stay in natural form an equal time before transforming again.",
        "replaces": "spell resistance"
      }
    ]
  },
  {
    "name": "Egotist",
    "summary": "An egotist familiar believes itself the true master of the relationship, issuing \"orders\" and meddling in everything from spell choices to its master's love life.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness",
    "abilities": [
      {
        "name": "Class Skill (Intimidate)",
        "masterLevel": 1,
        "note": "The egotist treats Intimidate as a class skill.",
        "replaces": ""
      },
      {
        "name": "Song of Myself (Ex)",
        "masterLevel": 1,
        "note": "The egotist gains Alertness as a bonus feat itself rather than granting it to its master, and keeps the variable familiar bonus for itself instead of granting it.",
        "replaces": "Alertness and the variable familiar bonus (alters)"
      },
      {
        "name": "Order Master (Ex)",
        "masterLevel": 3,
        "note": "The egotist gains speak with master at 3rd level instead of 5th.",
        "replaces": "speak with master (alters)"
      },
      {
        "name": "Receive Touch Spells (Ex)",
        "masterLevel": 5,
        "note": "As a standard action the egotist can demand a touch spell; until its next turn, its master can cast that spell on it once as a ranged touch within close range, as if using Reach Spell.",
        "replaces": "deliver touch spells"
      },
      {
        "name": "Scry on Master (Sp)",
        "masterLevel": 11,
        "note": "Once per day, the egotist can scry on its master as if casting the scrying spell.",
        "replaces": "scry on familiar"
      }
    ]
  },
  {
    "name": "Elemental Familiar",
    "summary": "A familiar infused with raw elemental power that gains a subtype and abilities tied to air, earth, fire, or water.",
    "source": "Pathfinder Player Companion: Plane-Hopper's Handbook",
    "abilities": [
      {
        "name": "Elemental Type (Ex)",
        "masterLevel": 1,
        "note": "The familiar gains the elemental subtype matching its chosen element: air, earth, fire, or water.",
        "replaces": ""
      },
      {
        "name": "Elemental Manifestation (Ex)",
        "masterLevel": 1,
        "note": "Grants an element-based power: air gains fly 20 ft. (good) and counts 3 sizes larger vs. wind; earth increases its master-granted natural armor bonus by 50% (min +1); fire spits a 30-ft. ranged-touch fire globule every 1d4 rounds for 1d4 fire damage per 3 master character levels; water breathes underwater, gains swim 20 ft. (or +10 ft.), and adds its natural armor to CMD vs. bull rush/drag/reposition/trip.",
        "replaces": "improved evasion"
      },
      {
        "name": "Elemental Speech (Ex)",
        "masterLevel": 1,
        "note": "The familiar can speak and understand the elemental language matching its element: Aquan (water), Auran (air), Ignan (fire), or Terran (earth).",
        "replaces": "speak with animals of its kind"
      }
    ]
  },
  {
    "name": "Emissary",
    "summary": "A familiar touched by divine power that serves as a font of wisdom and moral compass for a master who worships a single deity.",
    "source": "d20pfsrd (Pathfinder RPG)",
    "abilities": [
      {
        "name": "Emissary Skills",
        "masterLevel": 1,
        "note": "The emissary treats Heal, Knowledge (religion), and Sense Motive as class skills.",
        "replaces": ""
      },
      {
        "name": "Divine Guidance (Sp)",
        "masterLevel": 1,
        "note": "The emissary can cast guidance at will.",
        "replaces": "Alertness"
      },
      {
        "name": "Share Will (Su)",
        "masterLevel": 1,
        "note": "When the emissary or its master fails a save against a mind-affecting effect targeting only one of them, the other may attempt the save; success means the original save counts as successful, but the ability can't be used again for 24 hours. On a failure, both suffer the effect.",
        "replaces": "share spells"
      },
      {
        "name": "Domain Influence (Sp or Su)",
        "masterLevel": 3,
        "note": "The emissary gains a spark of divine power: it selects one domain granted by its master's deity and gains that domain's 1st-level power, usable once per day (in place of the normal 3 + Wis modifier daily uses).",
        "replaces": "deliver touch spells"
      }
    ]
  },
  {
    "name": "Figment",
    "summary": "A figment is a dreamlike familiar conjured from its master's mind that vanishes when slain or separated and can be reshaped each morning with eidolon evolutions.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness",
    "abilities": [
      {
        "name": "Recurring Dream (Su)",
        "masterLevel": 1,
        "note": "The figment has hit points equal to 1/4 of its master's total HP; if slain it vanishes and returns with 1 HP after the master's full night's sleep, and it also vanishes if it goes beyond 100 feet from the master, enters an antimagic field, or the master falls unconscious/asleep (returning when the master next prepares spells). It cannot be a witch familiar, shaman spirit animal, or any spell-granting familiar, and cannot use divination spells or spell-like abilities of its base form.",
        "replaces": "improved evasion"
      },
      {
        "name": "Manifest Dreams (Su)",
        "masterLevel": 3,
        "note": "Each morning after rest, the master applies 1 point of eidolon evolutions (ignoring base-form requirements) to the figment; this rises to 2 points at master level 7 and 3 points at master level 13.",
        "replaces": "deliver touch spells, speak with animals of its kind, and scry on familiar"
      }
    ]
  },
  {
    "name": "Infiltrator",
    "summary": "A familiar archetype for sneaky familiars that trades defensive and verbal abilities for stealth, deception, and covert telepathic reconnaissance.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness © 2017, Paizo Inc.",
    "abilities": [
      {
        "name": "Infiltrator Skills",
        "masterLevel": 1,
        "note": "The infiltrator treats Bluff and Disguise as class skills.",
        "replaces": ""
      },
      {
        "name": "Alertness (Ex)",
        "masterLevel": 1,
        "note": "The infiltrator gains Alertness as a bonus feat itself rather than granting it to its master.",
        "replaces": "Alertness (alters)"
      },
      {
        "name": "Share Spells (Ex)",
        "masterLevel": 1,
        "note": "Can share only divination spells with a target of 'you' via share spells.",
        "replaces": "share spells (alters)"
      },
      {
        "name": "Uncanny Stealth (Ex)",
        "masterLevel": 1,
        "note": "Gains uncanny dodge and improved uncanny dodge, using the master's level as its effective rogue level.",
        "replaces": "improved evasion"
      },
      {
        "name": "Scry on Familiar (Sp)",
        "masterLevel": 7,
        "note": "The master can scry on the familiar for up to 1 minute per level per day, used in 1-minute increments that need not be consecutive.",
        "replaces": "speak with animals of its kind"
      },
      {
        "name": "Telepathic Bond (Sp)",
        "masterLevel": 11,
        "note": "Permanent telepathic bond with the master, with no range limit while both are on the same plane.",
        "replaces": "spell resistance"
      }
    ]
  },
  {
    "name": "Mascot",
    "summary": "A mascot is a familiar that serves the whole adventuring party, eventually treating the entire team as its master.",
    "source": "d20pfsrd (Pathfinder 1e familiar archetype)",
    "abilities": [
      {
        "name": "Mascot Skills",
        "masterLevel": 1,
        "note": "A mascot treats all Perform skills as class skills.",
        "replaces": ""
      },
      {
        "name": "Affinity for My Team (Su)",
        "masterLevel": 1,
        "note": "The mascot's empathic link extends to all members of its team; it can add or remove one team member over the course of a day. At 3rd level and every 3 levels thereafter, the mascot adds an additional team member.",
        "replaces": "Alertness (also alters empathic link)"
      },
      {
        "name": "Lucky Mascot (Su)",
        "masterLevel": 1,
        "note": "When the mascot uses aid another to improve a team member's attack roll or AC, that team member also gains a +1 luck bonus to AC for 1 round.",
        "replaces": "improved evasion"
      },
      {
        "name": "Share Spells (Ex)",
        "masterLevel": 3,
        "note": "Spells targeting the mascot via share spells function at the master's caster level - 2, and the mascot benefits from the spells of any team member.",
        "replaces": "share spells (alters)"
      },
      {
        "name": "Deliver Touch Spells (Su)",
        "masterLevel": 5,
        "note": "The mascot can deliver the touch spells of any of its team members, at the caster's level - 2.",
        "replaces": "deliver touch spells (alters)"
      },
      {
        "name": "Speak with Team (Ex)",
        "masterLevel": 7,
        "note": "The mascot can speak verbally with all members of its team as if using speak with master.",
        "replaces": "speak with master and speak with animals of its kind"
      },
      {
        "name": "Heart of the Team (Ex)",
        "masterLevel": 13,
        "note": "Once per day as a full-round action, the mascot can designate any team member as its master for calculating its BAB, Hit Dice, hit points, saving throws, and skill ranks.",
        "replaces": "spell resistance and scry on familiar"
      }
    ]
  },
  {
    "name": "Mauler",
    "summary": "While most familiars are scouts and assistants, the mauler familiar cares only for the thrill of battle.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness",
    "abilities": [
      {
        "name": "Mauler Skills",
        "masterLevel": 1,
        "note": "The mauler treats Intimidate as a class skill.",
        "replaces": ""
      },
      {
        "name": "Battle Form (Su)",
        "masterLevel": 3,
        "note": "Three times per day as a standard action, the mauler can transform into a larger, ferocious form: its size becomes Medium and it gains a +2 size bonus to Strength.",
        "replaces": "deliver touch spells"
      },
      {
        "name": "Increased Strength (Ex)",
        "masterLevel": 3,
        "note": "At 3rd level and every 2 levels thereafter, the mauler's Strength increases by 1. Its Intelligence remains 6 and can never exceed 6.",
        "replaces": "the familiar's Intelligence score advancement (alters)"
      },
      {
        "name": "Bond Forged in Blood (Su)",
        "masterLevel": 5,
        "note": "A mauler cannot speak or communicate via language in any way. When the master drops a foe with HD at least half the master's level below 0 HP, both mauler and master gain a +2 morale bonus on attack and damage rolls for 1 round.",
        "replaces": "speak with master and speak with animals of its kind"
      },
      {
        "name": "Damage Reduction (Su)",
        "masterLevel": 11,
        "note": "The mauler gains DR 5/magic.",
        "replaces": "spell resistance"
      }
    ]
  },
  {
    "name": "Occult Messenger",
    "summary": "An occult messenger familiar is an envoy of strange mystical powers, granting its master psychic sensitivity and guidance with occult skill unlocks.",
    "source": "Pathfinder Player Companion: Wilderness Origins © 2019, Paizo Inc.",
    "abilities": [
      {
        "name": "See the Unseen (Ex)",
        "masterLevel": 1,
        "note": "While the occult messenger is within arm's reach, the master gains the Psychic Sensitivity feat.",
        "replaces": "Alertness"
      },
      {
        "name": "Teacher from Afar (Ex)",
        "masterLevel": 1,
        "note": "When the master uses a psychic skill unlock while the familiar is within arm's reach, the master gains a competence bonus on skill unlocks equal to half the familiar's level.",
        "replaces": "deliver touch spells"
      }
    ]
  },
  {
    "name": "Parasite (Familiar Archetype)",
    "summary": "A disturbing familiar that burrows into a host creature, riding its senses and eventually controlling it like a puppet.",
    "source": "Pathfinder Player Companion: Wilderness Origins © 2019, Paizo Inc.",
    "abilities": [
      {
        "name": "Infest (Su)",
        "masterLevel": 1,
        "note": "As a full-round action the parasite infests a willing or helpless target at least two size categories larger, dealing 1d6 Con damage and gaining the host's senses (losing its own sight/hearing). Detection requires an opposed Heal/Sense Motive vs its Bluff; removal needs an opposed Heal vs its Stealth or break enchantment (DC 11 + parasite's level), and if the host dies the parasite must make a DC 20 Fort save or die.",
        "replaces": "improved evasion and share spells"
      },
      {
        "name": "Puppeteer (Sp) — suggestion",
        "masterLevel": 3,
        "note": "Once per day the parasite can use suggestion on its host; the save DC is based on the master's spellcasting ability score (Charisma if none).",
        "replaces": "deliver touch spells, speak with animals of its kind, spell resistance, and scry on familiar"
      },
      {
        "name": "Puppeteer (Sp) — dominate person",
        "masterLevel": 7,
        "note": "The parasite's daily Puppeteer use can replicate dominate person on its host instead of suggestion.",
        "replaces": "deliver touch spells, speak with animals of its kind, spell resistance, and scry on familiar"
      },
      {
        "name": "Puppeteer (Sp) — dominate monster",
        "masterLevel": 15,
        "note": "The parasite's daily Puppeteer use can replicate dominate monster on its host instead.",
        "replaces": "deliver touch spells, speak with animals of its kind, spell resistance, and scry on familiar"
      }
    ]
  },
  {
    "name": "Pilferer",
    "summary": "A stealthy familiar that performs tricks of thievery or simple spying on its master's behalf.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness",
    "abilities": [
      {
        "name": "Pilferer Skills",
        "masterLevel": 1,
        "note": "Treats Disable Device, Escape Artist, and Sleight of Hand as class skills.",
        "replaces": ""
      },
      {
        "name": "Improved Steal (Ex)",
        "masterLevel": 1,
        "note": "The pilferer gains Improved Steal as a bonus feat.",
        "replaces": "Alertness"
      },
      {
        "name": "Nondetection (Su)",
        "masterLevel": 1,
        "note": "Constant nondetection with caster level equal to the master's class level; DC to penetrate is 15 + the master's caster level.",
        "replaces": "improved evasion"
      },
      {
        "name": "Sneak (Ex)",
        "masterLevel": 3,
        "note": "Gains a competence bonus equal to half its master's class level on Sleight of Hand and Stealth checks.",
        "replaces": "deliver touch spells"
      },
      {
        "name": "Greater Steal (Ex)",
        "masterLevel": 9,
        "note": "The pilferer gains Greater Steal as a bonus feat.",
        "replaces": "speak with animals of its kind"
      }
    ]
  },
  {
    "name": "Prankster",
    "summary": "A trickster familiar that loves playing pranks on its master and everyone nearby, allies and enemies alike.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness",
    "abilities": [
      {
        "name": "Prankster Skills",
        "masterLevel": 1,
        "note": "The prankster treats Bluff, Disguise, Perform (comedy), and Sleight of Hand as class skills.",
        "replaces": ""
      },
      {
        "name": "Autonomous Link (Ex)",
        "masterLevel": 1,
        "note": "The prankster can hide its feelings from its master through the empathic link at will, and can project a false emotion with a Bluff check opposed by the master's Sense Motive.",
        "replaces": "empathic link (alters)"
      },
      {
        "name": "Improved Dirty Trick (Ex)",
        "masterLevel": 1,
        "note": "The prankster gains Improved Dirty Trick as a bonus feat.",
        "replaces": "Alertness"
      },
      {
        "name": "Magical Pranks (Sp)",
        "masterLevel": 1,
        "note": "The prankster can cast ghost sound, mage hand, and prestidigitation at will as spell-like abilities.",
        "replaces": "improved evasion and share spells"
      },
      {
        "name": "Glib Comedy (Ex)",
        "masterLevel": 3,
        "note": "The prankster gains a competence bonus equal to half its master's class level on Bluff, Disguise, and Perform (comedy) checks.",
        "replaces": "deliver touch spells"
      },
      {
        "name": "Greater Dirty Trick (Ex)",
        "masterLevel": 11,
        "note": "The prankster gains Greater Dirty Trick as a bonus feat.",
        "replaces": "spell resistance"
      },
      {
        "name": "Unreliable Narrator (Sp)",
        "masterLevel": 13,
        "note": "When the master uses scry on familiar, the prankster can use false vision to fool that ability.",
        "replaces": "scry on familiar (alters)"
      }
    ]
  },
  {
    "name": "Protector",
    "summary": "A familiar devoted to guarding its master's body, trading perception and magic-delivery abilities for bodyguard feats and damage-sharing (tumor familiars cannot take this archetype).",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness © 2017, Paizo Inc.",
    "abilities": [
      {
        "name": "Loyal Bodyguard (Ex)",
        "masterLevel": 1,
        "note": "Gains Bodyguard and Combat Reflexes as bonus feats. While sharing its master's square it can use Bodyguard to aid another to improve AC even without threatening the attacker, as long as it has line of effect.",
        "replaces": "Alertness and improved evasion"
      },
      {
        "name": "Shield Master (Su)",
        "masterLevel": 5,
        "note": "Whenever the protector or its master takes damage while they are touching, the master can split the damage evenly between them as if under the effects of shield other.",
        "replaces": "Deliver touch spells and speak with animals of its kind"
      },
      {
        "name": "Able Defender (Ex)",
        "masterLevel": 11,
        "note": "Gains In Harm's Way as a bonus feat, and the familiar's hit points equal its master's total hit points regardless of its actual Hit Dice.",
        "replaces": "Spell resistance"
      }
    ]
  },
  {
    "name": "Sage",
    "summary": "A sage is an intellectually gifted familiar that serves as a living repository of knowledge, excelling at Knowledge checks but tending toward arrogance.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness",
    "abilities": [
      {
        "name": "Sage Skills",
        "masterLevel": 1,
        "note": "A sage treats all Knowledge skills as class skills.",
        "replaces": ""
      },
      {
        "name": "Dazzling Intellect (Ex)",
        "masterLevel": 1,
        "note": "The sage's Intelligence score is always 5 + its master's class level. However, it gains natural armor increases as if its master's class level were half the actual level.",
        "replaces": "familiar's Intelligence score and natural armor adjustment (alters)"
      },
      {
        "name": "Sage's Knowledge (Ex)",
        "masterLevel": 1,
        "note": "The sage can attempt all Knowledge checks untrained and gains a bonus on Knowledge checks equal to half its master's class level. It gains 2 skill ranks per master class level (max ranks per skill = master's class level).",
        "replaces": "Alertness and the familiar's ability to share its master's skill ranks"
      }
    ]
  },
  {
    "name": "School Familiar",
    "summary": "School familiars are tightly bound to the power of their master's chosen arcane school of magic, trading general familiar utility for school-themed powers.",
    "source": "Pathfinder Player Companion: Familiar Folio (2015)",
    "abilities": [
      {
        "name": "School Link (Su)",
        "masterLevel": 1,
        "note": "The familiar can use the share spells and deliver touch spells abilities only with spells of its master's specialized arcane school.",
        "replaces": "alters share spells and deliver touch spells"
      },
      {
        "name": "School Cantrip (Sp)",
        "masterLevel": 1,
        "note": "The familiar can cast at will one cantrip selected from its associated arcane school, using its master's caster level.",
        "replaces": ""
      },
      {
        "name": "Specialty Stowaway (Sp or Su)",
        "masterLevel": 1,
        "note": "The familiar can use any granted abilities of its master's arcane school that have a limited number of uses or rounds per day, expending twice the usual number of uses or rounds.",
        "replaces": ""
      },
      {
        "name": "Lesser School Power",
        "masterLevel": 1,
        "note": "The familiar gains the lesser school power matching its associated arcane school (e.g. Abjuration: Energy Block — shareable energy resistance of 1/2 master level and immunity to magic missile; Conjuration: Master's Side dimension door 3+Int/day; Divination: Ever Ready initiative swap + forewarned; Enchantment: Manipulative Abettor +2 DC; Evocation: Energy Boost resistance 10 + bonus damage; Illusion: Illusory Maestro concentration transfer +1 DC; Necromancy: Spirit Warden; Transmutation: Dispel Bait).",
        "replaces": ""
      },
      {
        "name": "Greater School Power",
        "masterLevel": 1,
        "note": "If the master has the Greater School Familiar feat, the familiar gains its school's greater power (Abjuration: Disruptive Spirit targeted dispel on hit; Conjuration: Summoned Shell inhabit summons; Divination: Greater Scry on Familiar at will; Enchantment: Puppet Master charm-monster touch 1/day; Evocation: Eldritch Battery energy immunity + spell absorption; Illusion: Phantom Swarm; Necromancy: One With the Negative; Transmutation: Infinite Forms). Gated by a feat, not a master-level threshold.",
        "replaces": ""
      }
    ]
  },
  {
    "name": "Soulbound Familiar",
    "summary": "A familiar animated by a soul fragment bound into a surgically implanted focus crystal, letting its personality and memories persist across bodies.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness",
    "abilities": [
      {
        "name": "Soul Focus (Ex)",
        "masterLevel": 1,
        "note": "The soul lives in an implanted focus crystal (hardness 8, 12 hp, break DC 20, attackable only when removed) and can be rebound to a new familiar body for the normal replacement cost/time, keeping its personality and memories; a destroyed focus costs a familiar replacement to remake, plus normal costs. The familiar gains Skill Focus in a skill tied to the soul's source, and can never serve as a witch's familiar, shaman's spirit animal, or other spell-granting familiar.",
        "replaces": "Alertness"
      },
      {
        "name": "Alignment Variation (Ex)",
        "masterLevel": 1,
        "note": "The familiar's alignment is always at least partially neutral and set by the soul's source, not the master.",
        "replaces": "speak with animals of its kind and scry on familiar"
      },
      {
        "name": "Alignment Variation — spell-like ability",
        "masterLevel": 8,
        "note": "Gains a 1/day spell-like ability by alignment (CN rage, LN suggestion, N deep slumber, NE inflict serious wounds, NG heroism) at caster level equal to the master's caster level - 3.",
        "replaces": "speak with animals of its kind and scry on familiar"
      },
      {
        "name": "Alignment Variation — improved caster level",
        "masterLevel": 13,
        "note": "The spell-like ability's caster level increases to equal the master's full caster level.",
        "replaces": "speak with animals of its kind and scry on familiar"
      }
    ]
  },
  {
    "name": "Valet",
    "summary": "A valet is a consummate personal servant, able to fetch, deliver, and perform for its master's every need.",
    "source": "Pathfinder Roleplaying Game Ultimate Wilderness",
    "abilities": [
      {
        "name": "Valet Skills",
        "masterLevel": 1,
        "note": "The valet treats Craft, Perform, and Profession as class skills.",
        "replaces": ""
      },
      {
        "name": "Able Assistant (Ex)",
        "masterLevel": 1,
        "note": "The master treats the valet as if it had the Cooperative Crafting feat, and shares Craft skills and item creation feats with the valet.",
        "replaces": "Alertness"
      },
      {
        "name": "Magical Manipulation (Sp)",
        "masterLevel": 1,
        "note": "The valet can cast open/close and prestidigitation at will.",
        "replaces": "share spells"
      },
      {
        "name": "Teammate (Ex)",
        "masterLevel": 1,
        "note": "The valet is considered to have all the teamwork feats its master has.",
        "replaces": "improved evasion"
      },
      {
        "name": "Deliver Touch Spells (Su)",
        "masterLevel": 3,
        "note": "When delivering a harmless touch spell to a willing creature, the valet can move both before and after delivering the spell, as long as its total movement does not exceed its speed.",
        "replaces": "deliver touch spells (alters)"
      },
      {
        "name": "Deliver Aid (Ex)",
        "masterLevel": 7,
        "note": "The valet can move before and after using the aid another action, as long as its total movement does not exceed its speed.",
        "replaces": "speak with animals of its kind"
      },
      {
        "name": "Aide to All (Ex)",
        "masterLevel": 13,
        "note": "The valet can use aid another as a full-round action to grant up to three adjacent creatures the bonuses from that action.",
        "replaces": "scry on familiar"
      }
    ]
  }
];
