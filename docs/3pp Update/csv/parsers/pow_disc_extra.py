# pow_disc_extra.py — add discipline rows missing from pow_disciplines.tsv for
# disciplines referenced by pow_maneuvers.tsv (Radiant Dawn, Unquiet Grave).
# Source pages: the archived d20pfsrd discipline pages saved as
#   Disciplines/Maneuvers/<Discipline>/__list.html
# (the Fandom/miraheze archive in Disciplines/ has no pages for these two).
# Idempotent: only appends disciplines not already present, keeps the file
# alphabetically sorted by name, and rewrites nothing when nothing is missing.
# Run:  python -X utf8 pow_disc_extra.py
import re, os, html as _html

ROOT = r"C:\Users\bitte\Documents\Projects\PFSheet\docs\3pp Update"
MDIR = os.path.join(ROOT, "3pp System Rules", "Path Of War", "Disciplines", "Maneuvers")
DTSV = os.path.join(ROOT, "csv", "pow_disciplines.tsv")
MTSV = os.path.join(ROOT, "csv", "pow_maneuvers.tsv")

# Radiant Dawn's archived page carries no OGL Section 15 block; the book was
# verified externally: the discipline ships with the rajah class in
# Divergent Paths: Rajah (Dreamscarred Press, 2018).
SOURCE_FALLBACK = {"Radiant Dawn": "Divergent Paths: Rajah"}

DCOLS = ["name", "associated_skill", "associated_weapon_groups", "martial_tradition",
         "title_veil", "dao_veil", "description", "source", "url"]

def clean(s):
    if not s: return ''
    s = s.replace('\r', ' '); s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', s)
    s = re.sub(r'(?is)<br\s*/?>', '\n', s); s = re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>', '\n', s)
    s = re.sub(r'(?s)<[^>]+>', '', s); s = _html.unescape(s)
    s = re.sub(r'[ \t]+', ' ', s); s = '\n'.join(x.strip() for x in s.split('\n'))
    return re.sub(r'\n{3,}', '\n\n', s).strip()
def cell(s):
    s = clean(s).replace('\t', ' ').replace('\n', '<br>')
    return re.sub(r'(?:<br>){3,}', '<br><br>', s).strip()
def scrub(s):
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', str(s)).replace('\t', ' ').replace('\r', ' ').replace('\n', '<br>')
def content(h):
    m = re.search(r'<div[^>]*class="[^"]*(?:page-content|entry-content|article-content)[^"]*"[^>]*>(.*)', h, re.S)
    return m.group(1) if m else h
def canon(h):
    m = re.search(r'<link rel="canonical" href="([^"]+)"', h); return m.group(1) if m else ''
def cap1(s):
    return s[:1].upper() + s[1:] if s else s

def parse_disc(name, path):
    h = open(path, encoding='utf-8', errors='replace').read()
    body = re.sub(r'(?is)<script.*?</script>', '', content(h))
    body = re.sub(r'(?is)<style.*?</style>', '', body)
    t = re.search(r'<table', body)
    intro = body[:t.start()] if t else body
    paras = []
    for p in re.findall(r'(?s)<p[^>]*>(.*?)</p>', intro):
        c = clean(p)
        if not c or c == 'Contents' or c.startswith('Home >') or 'nitropay' in c.lower():
            continue
        paras.append(p)
    desc = cell("<br><br>".join(paras))
    text = clean("\n".join(paras))
    # associated skill: labeled ("Associated Skill: X.") or prose ("...associated skill is X, ...")
    skill = ''
    m = re.search(r'(?i)Associated\s+Skill\s*:\s*([^.\n]+)', text) \
        or re.search(r'(?i)associated\s+skill\s+is\s+([^,.\n]+)', text)
    if m: skill = cap1(m.group(1).strip())
    # associated weapon groups: labeled list (stop at first period) or prose sentence
    wg = ''
    m = re.search(r'(?i)Associated\s+Weapon\s+Groups?\s*:\s*([^.\n]+)', text) \
        or re.search(r'(?i)associated\s+weapon\s+groups?\s+are\s+([^.\n]+)', text)
    if m: wg = cap1(m.group(1).strip())
    # martial tradition: not present on the d20pfsrd pages — leave blank if absent
    trad = ''
    m = re.search(r'(?i)Martial\s+Tradition\s*:\s*([^.\n]+)', text)
    if m: trad = m.group(1).strip()
    # source: OGL Section 15 book title if archived, else the verified fallback
    src = ''
    m = re.search(r'(?is)Section\s*15:?\s*Copyright\s*Notice\s*(?:<[^>]+>|\s)*([^<,]+?)(?:<[^>]+>|\s)*,?\s*(?:©|&#169;|&copy;)', h)
    if m: src = clean(m.group(1))
    if not src: src = SOURCE_FALLBACK.get(name, 'Path of War')
    return {"name": name, "associated_skill": cell(skill), "associated_weapon_groups": cell(wg),
            "martial_tradition": cell(trad), "title_veil": "", "dao_veil": "",
            "description": desc, "source": cell(src), "url": canon(h)}

# --- load current TSVs -------------------------------------------------------
dlines = open(DTSV, encoding='utf-8').read().splitlines()
header = dlines[0]
assert header.split('\t') == DCOLS, "pow_disciplines.tsv header changed"
rows = {}   # name -> full line, insertion keeps current content byte-identical
for ln in dlines[1:]:
    if ln.strip(): rows[ln.split('\t', 1)[0]] = ln

mlines = open(MTSV, encoding='utf-8').read().splitlines()
di = mlines[0].split('\t').index('discipline')
man_disc = sorted({ln.split('\t')[di] for ln in mlines[1:] if ln.strip()})

# --- parse + append any maneuver-referenced discipline we don't have --------
added = []
for d in man_disc:
    if d in rows: continue
    lp = os.path.join(MDIR, d, '__list.html')
    if not os.path.exists(lp):
        print(f"MISSING PAGE for discipline '{d}' — no row added"); continue
    r = parse_disc(d, lp)
    rows[d] = '\t'.join(scrub(r.get(c, '')) for c in DCOLS)
    added.append(d)

if added:
    with open(DTSV, 'w', encoding='utf-8', newline='') as f:
        f.write(header + '\n')
        for nm in sorted(rows): f.write(rows[nm] + '\n')

# --- verify: every maneuver discipline has a discipline row ------------------
disc_names = set(rows)
miss = [d for d in man_disc if d not in disc_names]
loose = {n.casefold().replace('’', "'"): n for n in disc_names}
for d in miss:
    near = loose.get(d.casefold().replace('’', "'"))
    print(f"MISMATCH: maneuvers reference '{d}' with no discipline row" + (f" (near-match: '{near}')" if near else ""))
extra = sorted(disc_names - set(man_disc))
print(f"added={added} | disciplines={len(rows)} | maneuver-disciplines={len(man_disc)} | unmatched={len(miss)}")
if extra: print(f"note: discipline rows with no maneuvers in pow_maneuvers.tsv: {extra}")
