# -*- coding: utf-8 -*-
"""Phase-2 AoN parser: class options, archetype features, race breakdown,
feat prerequisites + combat_trick, fuller class features, mythic, companions, effects.
Reuses helpers from aon_parse.py. Run: python aon_parse2.py [ROOT] [section]
Env LIMIT=N -> sample mode (print, don't write)."""
import os, re, sys, json, glob, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aon_parse as A

ROOT = sys.argv[1] if len(sys.argv) > 1 else A.ROOT
A.ROOT = ROOT
A.OUT = os.path.join(ROOT, 'csv')
SECTION = sys.argv[2] if len(sys.argv) > 2 else 'all'
clean, field, field_line, source_of, content, h1, read = A.clean, A.field, A.field_line, A.source_of, A.content, A.h1, A.read
AON = 'https://aonprd.com/'

OPT_TYPE = {
 'RogueTalents':'Rogue Talent','RogueUnchainedTalents':'Rogue Talent (Unchained)','SlayerTalents':'Slayer Talent',
 'InvestigatorTalents':'Investigator Talent','VigilanteTalents':'Vigilante Talent','NinjaTricks':'Ninja Trick',
 'AlchemistDiscoveries':'Discovery','WizardArcaneDiscoveries':'Arcane Discovery','ArcanistExploits':'Arcanist Exploit',
 'BarbarianRagePowers':'Rage Power','BarbarianUnchainedRagePowers':'Rage Power (Unchained)',
 'SorcererBloodlines':'Bloodline','BloodragerBloodlines':'Bloodrager Bloodline','BloodlineMutations':'Bloodline Mutation','Wildblooded':'Wildblooded Bloodline',
 'OracleMysteries':'Mystery','OracleCurses':'Oracle Curse','ShamanHexes':'Shaman Hex','ShamanSpirits':'Shaman Spirit',
 'WitchHexes':'Hex','WitchPatrons':'Witch Patron','UniquePatrons':'Unique Patron',
 'ClericDomains':'Domain','DruidDomains':'Druid Domain','ClericVariantChanneling':'Variant Channeling','DruidHerbalism':'Druid Herbalism',
 'WizardSchools':'Arcane School','MagusArcana':'Magus Arcana','PhrenicAmplifications':'Phrenic Amplification','PsychicDisciplines':'Psychic Discipline','PsiTech':'Psi-Tech',
 'BardMasterpieces':'Masterpiece','SkaldSagas':'Skald Saga','AdvVersatilePerformances':'Advanced Versatile Performance',
 'CavalierOrders':'Order','CavalierBanners':'Banner','PaladinMercies':'Mercy','PaladinOaths':'Oath','PaladinDivineBonds':'Divine Bond',
 'WarpriestBlessings':'Blessing','Inquisitions':'Inquisition','MediumSpirits':'Spirit',
 'GunslingerDeeds':'Deed','GunslingerDares':'Gunslinger Dare','SwashbucklerDeeds':'Swashbuckler Deed',
 'RangerCombatStyles':'Combat Style','RangerTraps':'Ranger Trap','HunterAnimalFocus':'Animal Focus',
 'MesmeristStares':'Mesmerist Stare','MesmeristTricks':'Mesmerist Trick',
 'MonkVows':'Vow','MonkUCKiPowers':'Ki Power','MonkUCStyleStrikes':'Style Strike',
 'KineticistElements':'Kineticist Element','KineticistTalents':'Wild Talent','OccultistImplements':'Implement',
 'FighterWeapons':'Fighter Weapon Group','AdvArmorTraining':'Advanced Armor Training','AdvWeaponTraining':'Advanced Weapon Training',
 'SkillUnlocks':'Skill Unlock','ShifterAspects - All':'Shifter Aspect','WardAspects':'Ward Aspect','Annointings':'Anointing',
}
def camel(s):
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', s).replace(' - All','').strip()

def page_url(stem):
    return AON + stem.replace(' - All','').replace(' ', '%20') + '.aspx'

def parse_entry(s):
    mi = re.search(r'(?is)<i>(.*?)</i>', s)
    name = clean(mi.group(1)) if mi else ''
    sub = ''
    m2 = re.match(r'^(.*?)\s*\((Ex|Su|Sp)\)\s*$', name)
    if m2: name, sub = m2.group(1).strip(), m2.group(2)
    ms = re.search(r'(?is)<a href="([^"]+)"[^>]*>\s*<i>(.*?)</i>\s*</a>', s)
    src = clean(ms.group(2)) if ms else ''
    rest = s[ms.end():] if ms else (s[mi.end():] if mi else s)
    rest = re.sub(r'(?is)^\s*\)?\s*:?\s*', '', rest)
    return name, sub, src, clean(rest)

def comma_names(h):
    text = clean(content(h))
    segs = text.split('<br>')
    best = max(segs, key=lambda s: s.count(','), default='')
    if best.count(',') < 8: return []
    QUAL = {'giant','big','small','greater','lesser','dire','adult','young','primal','legendary','lower','upper'}
    names = []
    for x in best.split(','):
        xs = x.strip()
        if not xs: continue
        low = xs.lower().strip('()')
        if (low in QUAL or xs.startswith('(')) and names: names[-1] += ', ' + xs
        elif re.match(r'^[A-Z(]', xs) and len(xs) <= 45: names.append(xs)
    return names

def parse_option_page(path, cls):
    h = read(path); rows = []; disp = []
    stem = os.path.splitext(os.path.basename(path))[0]
    otype = OPT_TYPE.get(stem) or camel(stem)
    purl = page_url(stem)
    spans = list(re.finditer(r'(?is)<span id="[^"]*LabelName_\d+">(.*?)</span>', h))
    if spans:
        heads = [(m.start(), clean(m.group(1))) for m in re.finditer(r'(?is)<h2 class="title">(.*?)</h2>', h)]
        for m in spans:
            grp = ''
            for pos, txt in heads:
                if pos < m.start(): grp = txt
            name, sub, src, desc = parse_entry(m.group(1))
            if not name or len(name) > 120: continue
            rows.append([cls, otype, name, sub, grp, src, desc, purl])
        return rows, disp
    for tr in re.findall(r'(?is)<tr[^>]*>(.*?)</tr>', h):
        a = re.search(r'(?is)<a href="([A-Za-z]+Display\.aspx\?[^"]+)"[^>]*>(.*?)</a>', tr)
        if not a: continue
        nm = clean(a.group(2))
        if not nm: continue
        tds = re.findall(r'(?is)<td[^>]*>(.*?)</td>', tr)
        summ = clean(' | '.join(tds[1:])) if len(tds) >= 2 else ''
        url = AON + a.group(1).replace(' ', '%20')
        rows.append([cls, otype, nm, '', '', '', summ, url]); disp.append(url)
    if rows: return rows, disp
    for nm in comma_names(h):
        sub = ''
        m2 = re.match(r'^(.*?)\s*\((Ex|Su|Sp)\)$', nm)
        if m2: nm, sub = m2.group(1).strip(), m2.group(2)
        rows.append([cls, otype, nm, sub, '', '', '', purl])
    return rows, disp

def parse_class_options():
    base = os.path.join(ROOT, 'Classes', 'Main Classes')
    rows = []; disp = set()
    classes = sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)))
    if LIMIT: classes = classes[:3]
    for cls in classes:
        d = os.path.join(base, cls)
        for f in sorted(os.listdir(d)):
            if not f.endswith('.html') or f == 'Archetypes.html' or f.startswith('_'): continue
            r, dp = parse_option_page(os.path.join(d, f), cls)
            rows += r; disp.update(dp)
    if not LIMIT:
        with open(os.path.join(A.OUT, 'parsers', '_display_urls.txt'), 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(sorted(disp)))
    print('  [class_options] display-pages to backfill:', len(disp))
    return rows

LIMIT = int(os.environ.get('LIMIT', '0'))

def parse_archetype_features():
    cand = [x for x in A.files_rec('Classes/Main Classes') if os.sep+'Archetypes'+os.sep in x]
    cand += [x for x in A.files_rec('Cohorts and Companions') if os.sep+'Archetypes'+os.sep in x]
    cand += [x for x in A.files_rec('Classes/NPC Classes') if os.sep+'Archetypes'+os.sep in x]
    cand = sorted(cand)
    if LIMIT: cand = cand[:8]
    rows = []
    for p in cand:
        frag = content(read(p)); name = h1(frag)
        if not name: continue
        parts = p.split(os.sep); cls = parts[parts.index('Archetypes')-1] if 'Archetypes' in parts else ''
        src = source_of(frag)
        url = AON + 'ArchetypeDisplay.aspx?FixedName=' + name.replace(' ', '%20')
        ms = re.search(r'(?is)<b>\s*Source\s*</b>.*?<br\s*/?>', frag)
        body = frag[ms.end():] if ms else frag
        marks = list(re.finditer(r'(?is)<b>\s*(?:<img[^>]*>)?\s*([A-Z][^<:]{1,70}?)\s*</b>\s*:', body))
        for i, m in enumerate(marks):
            fname = clean(m.group(1))
            if fname.lower() in ('source', 'note'): continue
            end = marks[i+1].start() if i+1 < len(marks) else len(body)
            text = clean(body[m.end():end])
            if len(text) < 15: continue
            ftype = ''
            mt = re.search(r'\((Ex|Su|Sp)\)$', fname)
            if mt: ftype = mt.group(1); fname = re.sub(r'\s*\((Ex|Su|Sp)\)$', '', fname).strip()
            repl = re.findall(r'(?i)(?:replaces|alters|modifies)\s+([^.]+?)\.', text)
            lvl = ''
            ml = re.search(r'(?i)at (\d+)(?:st|nd|rd|th) level', text)
            if ml: lvl = ml.group(1)
            rows.append([name, cls, fname, ftype, lvl, '; '.join(clean(r) for r in repl), text, src, url])
    return rows

ABIL = r'(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)'
def parse_races():
    traits = []; alt = []; fco = []
    for cat, rel in [('Core', 'Races/Core Races'), ('Other', 'Races/Other Races')]:
        files = A.files_top(rel)
        if LIMIT: files = files[:4]
        for p in files:
            frag = content(read(p)); name = h1(frag)
            if not name: continue
            src = source_of(frag)
            url = AON + 'RacesDisplay.aspx?ItemName=' + os.path.splitext(os.path.basename(p))[0].replace(' ', '%20')
            main_txt = clean(frag.split('Favored Class')[0]) if 'Favored Class' in frag else clean(frag)
            ab = ''
            mab = re.search(r'([+−–\-]\d+\s+' + ABIL + r'(?:[,;]\s*[+−–\-]\d+\s+\w+)*)', frag)
            if mab: ab = clean(mab.group(1))
            size = ''
            msz = re.search(r'(?is)\b(?:are|is)\s+(Small|Medium|Large|Tiny)\b', frag)
            if msz: size = msz.group(1)
            spd = ''
            msp = re.search(r'(?is)base speed (?:of )?(\d+) feet', frag)
            if msp: spd = msp.group(1)
            traits.append([name, cat, src, ab, size, spd, main_txt[:6000], url])
            for m in re.finditer(r'(?is)<h2 class="title">\s*((?:Replaces|Alters|Modifies)[^<]*)</h2>\s*<b>\s*(?:<img[^>]*>)?\s*([^<]+?)\s*</b>(.*?)(?=<h2 class="title">|<h1 class="title">|<div class="footer"|$)', frag):
                replaces = re.sub(r'(?i)^(Replaces|Alters|Modifies)\s*', '', clean(m.group(1))).strip()
                tn = clean(m.group(2)); bd = m.group(3)
                msr = re.search(r'(?is)<b>\s*Source\s*</b>\s*<a[^>]*>\s*<i>(.*?)</i>', bd)
                tsrc = clean(msr.group(1)) if msr else ''
                tdesc = clean(re.sub(r'(?is)^.*?<b>\s*Source\s*</b>.*?<br\s*/?>', '', bd, count=1)) if msr else clean(bd)
                alt.append([name, tn, replaces, tsrc, tdesc, url])
            mf = re.search(r'(?is)Favored Class Options</h1>(.*?)(?=<h1 class="title">|<div class="footer"|$)', frag)
            if mf:
                for fm in re.finditer(r'(?is)<b>\s*(?:<img[^>]*>)?\s*([A-Za-z][A-Za-z /()\x27\-]{1,40}?)\s*</b>\s*(?:\(<a[^>]*>\s*<i>(.*?)</i>\s*</a>\))?\s*:\s*(.*?)(?=<br\s*/?>\s*<b>|<h1|<div class="footer"|$)', mf.group(1)):
                    cl = clean(fm.group(1)); fsrc = clean(fm.group(2) or src); ben = clean(fm.group(3))
                    if cl and ben and len(ben) > 3: fco.append([name, cl, ben, fsrc, url])
    return traits, alt, fco

def normalize_prereq(text):
    out = []
    if not text: return out
    t = text.replace('<br>', ' ')
    for part in re.split(r'[;,]\s+(?![^()]*\))', t):
        p = part.strip(' .')
        if not p: continue
        low = p.lower()
        if re.match(r'^(str|dex|con|int|wis|cha)\s+\d+', low) or re.search(r'\b' + ABIL.lower() + r'\s+\d+', low):
            rt = 'ability'
        elif 'base attack bonus' in low or low.startswith('bab'): rt = 'bab'
        elif 'caster level' in low: rt = 'caster_level'
        elif re.search(r'\d+\s*ranks?', low): rt = 'skill'
        elif 'level' in low: rt = 'level'
        elif re.search(r'^[A-Z]', p): rt = 'feat'
        else: rt = 'other'
        out.append((rt, p))
    return out

def parse_feats_v2():
    seen = {}; rows = []; preqs = []
    files = A.files_rec('Feats')
    if LIMIT: files = files[:40]
    for p in files:
        frag = content(read(p)); name = h1(frag)
        if not name or name.lower() in seen: continue
        seen[name.lower()] = 1
        m = re.search(r'(?is)<h2 class="title">', frag)
        base = frag[:m.start()] if m else frag; rest = frag[m.start():] if m else ''
        nm, types = name, ''
        mt = re.match(r'^(.*?)\s*\(([^()]*)\)\s*$', name)
        if mt: nm, types = mt.group(1).strip(), mt.group(2).strip()
        fl = ''
        mf = re.search(r'(?is)</a>\s*<br\s*/?>(.*?)(?=<b>|$)', base)
        if mf: fl = clean(mf.group(1))
        prereq = field(base, 'Prerequisites') or field(base, 'Prerequisite')
        myth = ''
        mm = re.search(r'(?is)<h2 class="title">\s*Mythic[^<]*</h2>(.*?)(?=<h2|$)', rest)
        if mm: myth = clean(re.sub(r'(?is)<b>\s*Source\s*</b>.*?<br\s*/?>', '', mm.group(1), count=1))
        ct = ''
        mc = re.search(r'(?is)<h2 class="title">[^<]*Combat Trick[^<]*</h2>(.*?)(?=<h2|$)', rest)
        if mc: ct = clean(re.sub(r'(?is)<b>\s*Source\s*</b>.*?<br\s*/?>', '', mc.group(1), count=1))
        rows.append([nm, types, source_of(base), fl, prereq, field(base,'Benefit'), field(base,'Normal'), field(base,'Special'), myth, ct, A.url_item('FeatDisplay', nm)])
        if types.lower() not in ('achievement', 'story'):
            for rt, rv in normalize_prereq(prereq): preqs.append([nm, rt, rv])
    return rows, preqs

def build_level_map(grid):
    m = {}
    if not grid: return m
    hdr = None
    for row in grid:
        if any('special' in (c or '').lower() for c in row): hdr = row; break
    if not hdr: return m
    si = [i for i, c in enumerate(hdr) if 'special' in (c or '').lower()]
    for row in grid:
        if row is hdr or not row: continue
        lvl = re.sub(r'\D', '', row[0]) or row[0]
        for i in si:
            if i < len(row):
                for feat in row[i].split(','):
                    f = re.sub(r'\s*\+?\d+.*$', '', feat).strip().lower().strip(' .')
                    f = re.sub(r'\s*\([^)]*\)$', '', f).strip()
                    if f and f not in m: m[f] = lvl
    return m

def parse_class_features_v2():
    import csv as _csv
    prog = {}
    pp = os.path.join(A.OUT, 'class_progression.tsv')
    if os.path.exists(pp):
        with open(pp, encoding='utf-8') as f:
            rd = _csv.reader(f, delimiter='\t'); next(rd, None)
            for r in rd:
                if len(r) >= 2:
                    try: prog[r[0]] = json.loads(r[1])
                    except Exception: pass
    rows = []
    for cat, rel in [('Main', 'Classes/Main Classes'), ('NPC', 'Classes/NPC Classes')]:
        files = A.files_top(rel)
        if LIMIT: files = files[:3]
        for p in files:
            frag = content(read(p)); cname = h1(frag)
            if not cname: continue
            mt = re.search(r'(?is)</table>', frag)
            body = frag[mt.end():] if mt else frag
            lvlmap = build_level_map(prog.get(cname))
            marks = list(re.finditer(r'(?is)<b>\s*([A-Z][^<:]{2,70}?)\s*</b>', body))
            for i, m in enumerate(marks):
                fname = clean(m.group(1)); ftype = ''
                mt2 = re.search(r'\((Ex|Su|Sp)\)$', fname)
                if mt2: ftype = mt2.group(1); fname = re.sub(r'\s*\((Ex|Su|Sp)\)$', '', fname).strip()
                key = fname.lower()
                if not (ftype or key in lvlmap): continue
                if key in ('source', 'special', 'normal', 'benefit') or len(fname) < 3: continue
                end = marks[i+1].start() if i+1 < len(marks) else len(body)
                text = re.sub(r'^[:\s]+','', clean(body[m.end():end]))
                if len(text) < 20: continue
                rows.append([cname, cat, fname, ftype, lvlmap.get(key, ''), text, A.url_item('ClassDisplay', cname)])
    return rows

def split_school(s):
    s = (s or '').strip().rstrip(';').strip(); desc = ''; sub = ''
    md = re.search(r'\[([^\]]*)\]', s)
    if md: desc = md.group(1); s = re.sub(r'\s*\[[^\]]*\]', '', s).strip()
    msb = re.search(r'\(([^)]*)\)', s)
    if msb: sub = msb.group(1); s = re.sub(r'\s*\([^)]*\)', '', s).strip()
    return s.strip().rstrip(';').strip(), sub, desc

def parse_mythic_paths():
    rows = []; ab = []
    pdir = os.path.join(ROOT, 'Mythic', 'Paths')
    if os.path.isdir(pdir):
        for p in sorted(glob.glob(os.path.join(pdir, '*.html'))):
            frag = content(read(p)); name = h1(frag)
            if not name: continue
            desc = clean(re.sub(r'(?is)^.*?</h1>', '', frag, count=1))[:8000]
            rows.append([name, source_of(frag), desc, A.parse_table(frag), AON + 'MythicPaths.aspx?Path=' + name.replace(' ', '%20')])
    padir = os.path.join(ROOT, 'Mythic', 'Path Abilities')
    if os.path.isdir(padir):
        for p in sorted(glob.glob(os.path.join(padir, '*.html'))):
            h = read(p); path = os.path.splitext(os.path.basename(p))[0]
            for m in re.finditer(r'(?is)<span id="[^"]*LabelName_\d+">(.*?)</span>', h):
                nm, sub, s2, desc = parse_entry(m.group(1))
                if nm: ab.append([path, nm, sub, s2, desc, AON + 'PathAbilities.aspx?Path=' + path.replace(' ', '%20')])
    return rows, ab

def parse_mythic_spells_v2():
    rows = []
    files = A.files_top('Mythic/Mythic Spells')
    if LIMIT: files = files[:6]
    for p in files:
        frag = content(read(p)); name = h1(frag)
        if not name: continue
        sch, sub, dd = split_school(field(frag, 'School'))
        rows.append([name, sch, sub, dd, field(frag,'Level'), field(frag,'Casting Time'), field(frag,'Components'),
                     field(frag,'Range'), field(frag,'Target') or field(frag,'Targets'), field(frag,'Area'), field(frag,'Effect'),
                     field(frag,'Duration'), field(frag,'Saving Throw'), field(frag,'Spell Resistance'),
                     A.section(frag,'Description'), A.mythic_section(frag), source_of(frag), A.url_item('SpellDisplay', name)])
    return rows

_INVALID_FN = re.compile(r'[\\/:*?"<>|]')
def fn_sanitize(name):
    name = urllib.parse.unquote(name).replace('&amp;', '&').strip()
    name = _INVALID_FN.sub('-', name)
    name = re.sub(r'\s+', ' ', name).strip(' .')
    return name[:150] if name else 'untitled'

def parse_animal_stats(h):
    frag = content(h)
    ss = re.search(r'(?is)<b>\s*Starting Statistics\s*</b>\s*:?(.*?)(?=<b>[^<]*Advancement</b>|<div class="footer"|$)', frag)
    seg = ss.group(1) if ss else ''
    def f(label):
        m = re.search(r'(?is)<b>\s*' + label + r'\s*</b>\s*(.*?)(?=;|<b>|<br|$)', seg)
        return clean(m.group(1)) if m else ''
    adv_m = re.search(r'(?is)(<b>[^<]*Advancement</b>.*?)(?=<div class="footer"|$)', frag)
    adv = clean(adv_m.group(1)) if adv_m else ''
    return f('Size'), f('Speed'), f('AC'), f('Attack'), f('Ability Scores'), f('Special Qualities'), clean(seg), adv

def parse_companions():
    cc = os.path.join(ROOT, 'Cohorts and Companions')
    eb = []; ev = []; fam = []; ac = []
    bf = os.path.join(cc, 'Eidolon', 'EidolonBaseForms.html')
    if os.path.exists(bf):
        h = read(bf)
        for m in re.finditer(r'(?is)<span id="[^"]*LabelName_\d+">(.*?)</span>', h):
            sp = m.group(1)
            mn = re.search(r'(?is)<h2 class="title">\s*(?:<img[^>]*>)?\s*(.*?)</h2>', sp)
            nm = clean(mn.group(1)) if mn else ''
            if not nm: continue
            msr = re.search(r'(?is)<b>\s*Source\s*</b>\s*<a[^>]*>\s*<i>(.*?)</i>', sp)
            src = clean(msr.group(1)) if msr else ''
            desc = clean(re.sub(r'(?is)^.*?<b>\s*Source\s*</b>.*?<br\s*/?>', '', sp, count=1)) if msr else clean(re.sub(r'(?is)^.*?</h2>', '', sp, count=1))
            eb.append([nm, src, desc, AON + 'EidolonBaseForms.aspx'])
    evp = os.path.join(cc, 'Eidolon', 'SummonerEvolutions.html')
    if os.path.exists(evp):
        for r in parse_option_page(evp, 'Eidolon')[0]:
            ev.append([r[2], r[4], r[5], r[6], r[7]])
    fp = os.path.join(cc, 'Familiar', 'WizardFamiliars.html')
    if os.path.exists(fp):
        for r in parse_option_page(fp, 'Familiar')[0]:
            fam.append([r[2], r[6], r[7]])
    adir = os.path.join(cc, 'Companion', 'Animals')
    for cat in ['Animal', 'Monstrous', 'Plant', 'Vermin']:
        p = os.path.join(cc, 'Companion', 'DruidCompanions - ' + cat + '.html')
        if not os.path.exists(p): continue
        h = read(p)
        for m in re.finditer(r'(?is)<h2 class="title">(.*?)</h2>(.*?)(?=<h2 class="title">|<div class="footer"|$)', h):
            head = m.group(1); body = m.group(2)
            nm = clean(head)
            if not nm: continue
            ad = re.search(r'href="(DruidCompanions\.aspx\?ItemName=[^"]+)"', head)
            url = AON + ad.group(1).replace(' ', '%20') if ad else AON + 'DruidCompanions.aspx'
            msr = re.search(r'(?is)<b>\s*Source\s*</b>\s*<a[^>]*>\s*<i>(.*?)</i>', body)
            src = clean(msr.group(1)) if msr else ''
            mon = re.search(r'(?is)Monster Entry</b>\s*<a href="([^"]+)"', body)
            mon_url = AON + mon.group(1).replace(' ', '%20') if mon else ''
            desc = clean(body)
            desc = re.sub(r'(?is)^Source .*?(?:<br>|$)', '', desc, count=1)
            desc = re.sub(r'(?is)^Monster Entry.*?(?:<br>|$)', '', desc, count=1)
            desc = re.sub(r'(?is)<br>\s*Click here for full details.*$', '', desc).strip()
            size = speed = acn = atk = abil = spec = sstats = adv = ''
            im = re.search(r'ItemName=(.+)$', url)
            if im:
                dp = os.path.join(adir, fn_sanitize(im.group(1)) + '.html')
                if os.path.exists(dp):
                    size, speed, acn, atk, abil, spec, sstats, adv = parse_animal_stats(read(dp))
            ac.append([nm, cat, src, size, speed, acn, atk, abil, spec, sstats, adv, desc, mon_url, url])
    seen = {}
    for r in ac:
        u = r[-1]
        if u in seen:
            cats = seen[u][1].split(', ')
            if r[1] and r[1] not in cats:
                seen[u][1] = ', '.join(cats + [r[1]])
        else:
            seen[u] = r
    ac = list(seen.values())
    return eb, ev, fam, ac

def effects_seed():
    return [['Toughness','hp.max','add','@{max(3, level)}','untyped','+3 hp; +1 per HD beyond 3'],
            ['Dodge','ac','add','1','dodge',''],['Improved Initiative','initiative','add','4','untyped',''],
            ['Weapon Focus','attack','add','1','untyped','chosen weapon only'],
            ['Great Fortitude','saves.fort','add','2','untyped',''],['Iron Will','saves.will','add','2','untyped',''],
            ['Lightning Reflexes','saves.ref','add','2','untyped',''],['Skill Focus','skill','add','3','untyped','chosen skill; +6 at 10 ranks'],
            ['Combat Expertise','ac','add','1','dodge','toggle; trades attack for AC, scales with BAB'],
            ['Power Attack','damage.melee','add','2','untyped','toggle; trades attack for damage, scales with BAB'],
            ['Point-Blank Shot','attack.ranged','add','1','untyped','within 30 ft; also +1 damage']]
def features_effects_seed():
    return [['Monk','AC Bonus','ac','add','@{wis.mod}','untyped','when unarmored/unencumbered'],
            ['Barbarian','Fast Movement','speed','add','10','untyped',''],
            ['Rogue','Trap Sense','saves.ref','add','@{floor(level/3)}','untyped','vs traps; +AC vs traps too']]

def W(name, header, rows): A.write_tsv(name, header, rows)

def main():
    if SECTION in ('all','options'):
        W('class_options.tsv', ['class','option_type','name','subtype','group','source','description','url'], parse_class_options())
    if SECTION in ('all','archetypes'):
        W('archetype_features.tsv', ['archetype','class','feature','type','level','replaces','text','source','url'], parse_archetype_features())
    if SECTION in ('all','races'):
        t, al, fc = parse_races()
        W('race_traits.tsv', ['race','category','source','ability_modifiers','size','speed','standard_traits','url'], t)
        W('alternate_racial_traits.tsv', ['race','trait_name','replaces','source','description','url'], al)
        W('favored_class_options.tsv', ['race','class','benefit','source','url'], fc)
    if SECTION in ('all','feats'):
        fr, pq = parse_feats_v2()
        W('feats.tsv', ['name','types','source','description','prerequisites','benefit','normal','special','mythic','combat_trick','url'], fr)
        W('feat_prerequisites.tsv', ['feat','req_type','req_value'], pq)
    if SECTION in ('all','features'):
        W('class_features.tsv', ['class','category','feature','type','level','description','url'], parse_class_features_v2())
    if SECTION in ('all','mythic'):
        mp, ma = parse_mythic_paths()
        W('mythic_paths.tsv', ['name','source','description','json_data','url'], mp)
        W('mythic_path_abilities.tsv', ['path','name','type','source','description','url'], ma)
        W('mythic_spells.tsv', ['name','school','subschool','descriptors','level','casting_time','components','range','target','area','effect','duration','saving_throw','spell_resistance','description','mythic','source','url'], parse_mythic_spells_v2())
    if SECTION in ('all','companions'):
        eb, ev, fam, ac = parse_companions()
        W('eidolon_base_forms.tsv', ['name','source','description','url'], eb)
        W('eidolon_evolutions.tsv', ['name','cost','source','description','url'], ev)
        W('familiars.tsv', ['name','granted_ability','url'], fam)
        W('animal_companions.tsv', ['name','category','source','size','speed','ac','attack','ability_scores','special_qualities','starting_stats','advancement','flavor','monster_url','url'], ac)
    if SECTION in ('all','effects'):
        W('feats_effects.tsv', ['feat','target','op','value_or_formula','bonus_type','notes'], effects_seed())
        W('features_effects.tsv', ['class','feature','target','op','value_or_formula','bonus_type','notes'], features_effects_seed())

if __name__ == '__main__':
    main()
