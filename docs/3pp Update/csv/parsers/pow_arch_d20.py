# pow_arch_d20.py — parse d20pfsrd archetype pages for the Path of War base classes
# (Warlord/Warder/Stalker/Mystic/Zealot/Harbinger) from the two saved-page folders:
#   3pp Classes/Path Of War/PoW Archetypes/   (all "*– d20PFSRD.html")
#   3pp Classes/Path Of War/Archetypes/       (mixed: d20PFSRD archetype pages + Miraheze
#                                              class/PrC pages already in threepp_classes.tsv — skipped)
# Appends to csv/threepp_archetypes.tsv (system=path_of_war). Idempotent: rows this parser
# previously wrote (d20pfsrd.com /path-of-war/classes/ urls) are refreshed in place; rows from
# other sources are never touched, and a (name, base_class) pair that already exists from
# another source is skipped as a duplicate.
import re, os, glob, html as _html

ROOT = r"C:\Users\bitte\Documents\Projects\PFSheet\docs\3pp Update"
CL = os.path.join(ROOT, "3pp Classes", "Path Of War")
OUT = os.path.join(ROOT, "csv", "threepp_archetypes.tsv")
CLASSES_TSV = os.path.join(ROOT, "csv", "threepp_classes.tsv")
COLS = ["name", "base_class", "system", "altered_features", "description", "source", "url"]

def clean(s):
    if not s: return ''
    s = s.replace('\r', ' '); s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', s)
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
    s = re.sub(r'(?is)<br\s*/?>', '\n', s); s = re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>', '\n', s)
    s = re.sub(r'(?is)<li[^>]*>', '• ', s); s = re.sub(r'(?s)<[^>]+>', ' ', s); s = _html.unescape(s)
    s = re.sub(r'[ \t\xa0]+', ' ', s); s = '\n'.join(x.strip() for x in s.split('\n'))
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

FOOT = r'(?i)Section\s*15\s*:|OPEN GAME LICENSE|<div class="comments|printfooter|class="entry-tags|Latest Pathfinder'
POW_CLASSES = r'(?:warlord|warder|stalker|mystic|zealot|harbinger)'

def body_of(h):
    b = content(h)
    b = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', b)
    b = re.sub(r'(?is)<div class="breadcrumbs">.*?</div>', ' ', b)
    b = re.sub(r'(?is)<div[^>]*id="toc"[^>]*>.*?</table>', ' ', b)  # d20pfsrd TOC lives in a table
    return re.split(FOOT, b)[0]

def title_case(s):
    return re.sub(r"(^|[\s\-,/(])([a-z])", lambda m: m.group(1) + m.group(2).upper(), s)

def clean_feature(t):
    t = t.strip().rstrip(';,')
    t = re.split(r',\s|;\s| which | but ', t)[0].strip()          # drop trailing clauses
    t = re.split(r'\s+class\s+features?\b', t)[0].strip()          # "... class feature('s range increase...)"
    t = re.sub(r"^(?:the|a|an)\s+" + POW_CLASSES + r"['’]s\s+", '', t)  # "the warlord's X"
    t = re.sub(r'^(?:the|a|an)\s+', '', t)
    t = re.sub(r'^(?:normal starting|standard|normal|remaining)\s+', '', t)
    m = re.match(r'^abilit(?:y|ies)\s+gained\s+through\s+(.+)$', t)
    if m: t = m.group(1)
    t = re.sub(r'\s+gained\s+at\s+.*$', '', t)
    t = re.sub(r'\s+at\s+\d+(?:st|nd|rd|th).*$', '', t)
    t = re.sub(r'\s+of\s+the\s+.*$', '', t)
    t = re.sub(r'\s+abilit(?:y|ies)$', '', t)
    parts = [t] if 'weapon and armor' in t else [p.strip() for p in re.split(r'\s+and\s+', t)]
    out = []
    for p in parts:
        p = re.sub(r'^(?:the|a|an)\s+', '', p).strip(' .')
        if p: out.append(title_case(p))
    return out

def altered_features(body):
    text = clean(body).replace('\n', ' ')
    out = []
    pat = (r"Th(?:is|ese)\s+(?:abilit(?:y|ies)\s+|class\s+features?\s+|archetypes?\s+)?"
           r"(?:also\s+)?(?:replaces?|alters?|modif(?:y|ies))(?:\s+and\s+(?:replaces?|changes?))?\s+([^.]+?)\s*\.")
    for m in re.finditer(pat, text):
        for f in clean_feature(m.group(1)):
            if f and f not in out: out.append(f)
    return ", ".join(out)

def source_of(h):
    i = re.search(r'(?i)Section\s*15\s*:', h)
    if not i: return 'Path of War (Dreamscarred Press)'
    t = clean(h[i.start():i.start() + 1200]).replace('\n', ' ')
    exp = bool(re.search(r'Path of War\s*[–:–-]\s*Expanded', t))
    core = bool(re.search(r'Path of War\s*,', t))
    if exp and core: return 'Path of War / Path of War: Expanded (Dreamscarred Press)'
    if exp: return 'Path of War: Expanded (Dreamscarred Press)'
    if core: return 'Path of War (Dreamscarred Press)'
    m = re.search(r'(?i)Section\s*15\s*:\s*Copyright\s*Notice\s*(.+?)\s+Copyright\s+(?:©\s*)?\d{4}[,.]?\s+([A-Za-z ’\']+?)(?:\s+Authors?\b|[.,]|$)', t)
    if m: return f"{m.group(1).strip()} ({m.group(2).strip()})"
    return 'Path of War (Dreamscarred Press)'

def parse_page(p):
    h = open(p, encoding='utf-8', errors='replace').read()
    url = canon(h)
    cm = re.search(r'/path-of-war/classes/([a-z-]+)/', url)
    base = title_case(cm.group(1).replace('-', ' ')) if cm else ''
    body = body_of(h)
    nm = re.search(r'<h1[^>]*>(.*?)</h1>', body, re.S) or re.search(r'<title>(.*?)</title>', h, re.S)
    name = re.sub(r'\s*[-–]\s*d20PFSRD.*$', '', clean(nm.group(1)) if nm else os.path.basename(p)[:-5]).strip()
    body = re.sub(r'(?is)<h1[^>]*>.*?</h1>', ' ', body, count=1)
    return {"name": name, "base_class": base, "system": "path_of_war",
            "altered_features": altered_features(body), "description": cell(body),
            "source": source_of(h), "url": url}

# ---- gather input files -------------------------------------------------------------------
class_names = set()
with open(CLASSES_TSV, encoding='utf-8') as f:
    next(f)
    for ln in f:
        class_names.add(ln.split('\t', 1)[0].strip().lower())

new_rows, skipped_class_pages = [], []
seen_batch = set()
for folder in ("PoW Archetypes", "Archetypes"):
    for p in sorted(glob.glob(os.path.join(CL, folder, "*.html"))):
        base_name = os.path.basename(p)
        if 'd20PFSRD' not in base_name:
            # Miraheze class/PrC saves (Awakened Blade, Battle Templar, ...) — already in threepp_classes.tsv
            nm = base_name[:-5].strip()
            skipped_class_pages.append(nm + ('' if nm.lower() in class_names else ' (NOT in threepp_classes!)'))
            continue
        r = parse_page(p)
        key = (r["name"].lower(), r["base_class"].lower())
        if key in seen_batch: continue
        seen_batch.add(key)
        new_rows.append(r)

# ---- merge into the TSV (idempotent) ------------------------------------------------------
with open(OUT, encoding='utf-8') as f:
    lines = f.read().split('\n')
header = lines[0]
assert header.split('\t') == COLS, header
kept, mine_old = [], {}
for ln in lines[1:]:
    if not ln: continue
    fs = ln.split('\t')
    key = (fs[0].strip().lower(), fs[1].strip().lower())
    if 'd20pfsrd.com' in fs[6] and '/path-of-war/classes/' in fs[6]:
        mine_old[key] = ln   # a row this parser wrote before — refresh it
    else:
        kept.append(ln)

existing_keys = set()
for ln in kept:
    fs = ln.split('\t')
    existing_keys.add((fs[0].strip().lower(), fs[1].strip().lower()))

added, refreshed, dupes = [], 0, []
for r in new_rows:
    key = (r["name"].lower(), r["base_class"].lower())
    if key in existing_keys:
        dupes.append(f'{r["name"]} [{r["base_class"]}]'); continue
    if key in mine_old: refreshed += 1
    added.append('\t'.join(scrub(r.get(c, '')) for c in COLS))

out_lines = [header] + kept + added
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write('\n'.join(out_lines) + '\n')

bad = [i for i, ln in enumerate(out_lines) if ln.count('\t') != len(COLS) - 1]
print(f"parsed={len(new_rows)} added={len(added) - refreshed} refreshed={refreshed} "
      f"skipped_duplicate={len(dupes)} skipped_class_page={len(skipped_class_pages)}")
if dupes: print("  duplicates:", "; ".join(dupes))
print("  class pages skipped:", "; ".join(skipped_class_pages))
print(f"tsv rows={len(out_lines) - 1} column_check={'OK' if not bad else f'BAD lines {bad}'}")
for r in new_rows:
    print(f"  {r['name']} [{r['base_class']}] feats=({r['altered_features'][:80]}) src={r['source'][:50]} desc_len={len(r['description'])}")
