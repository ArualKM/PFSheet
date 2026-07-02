# Backfill blank base_class values for system=spheres rows in threepp_archetypes.tsv.
#
# The original arch_spheres.py derived base_class from the page title pattern
# "Name (X Archetype)"; pages under Spheres/<Power|Might|Guile|Champions>/Archetypes/
# don't use that title form, so those rows landed with a blank base_class.
#
# Resolution order (per blank row):
#   1. Match the row to its archived HTML file by name (squashed-alnum key).
#   2. Read the wiki breadcrumb ("Home Page » <Class> » <Archetype>") — authoritative.
#   3. Fall back to text patterns over the page body (or the TSV description if no
#      file matched): "archetype of the <class>", "This alters/replaces the <class>'s",
#      "their <class> levels", possessives, then a dominant-mention frequency scan.
#   4. OVERRIDES for pages resolved by manually reading the archived HTML.
#
# In-place, idempotent: only fills blank base_class, never touches any other field.
# Run:  python -X utf8 "docs/3pp Update/csv/parsers/spheres_baseclass_backfill.py" [--dry-run]
import re, os, sys, glob, html as _html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))            # .../3pp Update
TSV = os.path.join(ROOT, "csv", "threepp_archetypes.tsv")
CL = os.path.join(ROOT, "3pp Classes", "Spheres")
DRY = "--dry-run" in sys.argv

# ---- helpers copied from arch_spheres.py ----
def clean(s):
    if not s: return ''
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?is)<li[^>]*>','• ',s); s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s)
    s=re.sub(r'[ \t]+',' ',s); s='\n'.join(ln.strip() for ln in s.split('\n'))
    return re.sub(r'\n{3,}','\n\n',s).strip()

def body_of(h):
    m=re.search(r'<div id="page-content"[^>]*>(.*?)(?:<div class="page-tags"|<div id="footer"|<!-- end content)', h, re.S)
    return m.group(1) if m else h

# ---- class vocabulary (canonical casing) ----
# Spheres classes (top-level class pages under Power/Might/Guile/Champions) + the
# handful of Paizo classes an Archetypes-folder page could plausibly reference.
SPHERE_CLASSES = [
    # Power
    "Armorist","Elementalist","Eliciter","Fey Adept","Hedgewitch","Incanter",
    "Mageknight","Shifter","Soul Weaver","Symbiat","Thaumaturge","Wraith",
    # Might
    "Armiger","Blacksmith","Commander","Conscript","Savant","Scholar","Sentinel",
    "Striker","Technician",
    # Guile
    "Advisor","Agent","Conduit","Courser","Envoy","Genius","Mastermind","Professional",
    # Champions
    "Bravo","Crimson Dancer","Dissident","Prodigy","Sage","Theorist","Troubadour","Warden",
]
CANON = {c.lower(): c for c in SPHERE_CLASSES}

# Manual resolutions (no breadcrumb + the page never names its class directly;
# resolved by grepping the class pages for the features each archetype replaces:
# whim/cunning celerity/exploit uncertainty are Bravo-only features, master
# illusionist/create reality are Fey Adept's — both pages are also from Fey
# Adept-specific products). Keyed by squashed row name.
OVERRIDES = {
    'allusionist': 'Bravo',
    'dynamo': 'Bravo',
    'eclectic': 'Bravo',
    'inspiredinventor': 'Fey Adept',
    'regisseur': 'Fey Adept',
}

def squash(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def row_keys(name):
    """Candidate lookup keys for a TSV row name (annotations stripped)."""
    n = re.sub(r'\s*\[[^\]]*\]', ' ', name)     # drop [3PP]-style tags
    n = re.sub(r'\s*\([^)]*\)', ' ', n)          # drop (SM—)-style tags
    keys = [squash(n)]
    full = squash(name)                          # keep paren words: Savant (Class Version)
    if full not in keys: keys.append(full)
    noise = full.replace('version', '')          # "savantclassversion" -> "savantclass"
    if noise not in keys: keys.append(noise)
    return [k for k in keys if k]

def breadcrumb_class(h):
    m = re.search(r'<div id="breadcrumbs"[^>]*>(.*?)</div>', h, re.S)
    if not m: return ''
    crumbs = [clean(c) for c in re.split(r'&raquo;|»', m.group(1))]
    crumbs = [c for c in crumbs if c]
    if len(crumbs) >= 2:
        return CANON.get(crumbs[-2].lower(), '')
    return ''

CLASS_ALT = '|'.join(sorted((re.escape(c.lower()) for c in CANON), key=len, reverse=True))
# Tiers, most reliable first. Each tier is tried in order; the first tier with a
# single clearly-leading class wins outright (so one explicit "an archetype of the
# Thaumaturge" can't be outvoted by many possessive mentions of the archetype's
# own name — the Savant (Class Version) trap).
PATTERNS = [
    re.compile(r'archetype (?:of|for) (?:the|a|an|their|his|her) (' + CLASS_ALT + r')\b'),
    re.compile(r'\bclass:\s*(' + CLASS_ALT + r')\b'),
    re.compile(r'this (?:alters|replaces|modifies) the (' + CLASS_ALT + r')(?:’|\')s\b'),
    re.compile(r'\b(?:their|his|her|its) (' + CLASS_ALT + r') levels?\b'),
    re.compile(r'\b(' + CLASS_ALT + r') levels?\b'),
    re.compile(r'\bthe (' + CLASS_ALT + r')(?:’|\')s\b'),
]
MENTION = re.compile(r'\b(' + CLASS_ALT + r')s?\b')

def text_class(text, own_name):
    """Resolve the base class from cleaned text; return canonical class or ''."""
    t = re.sub(r'\s+', ' ', text.lower())
    own = squash(own_name)
    for rx in PATTERNS:
        counts = {}
        for m in rx.finditer(t):
            c = m.group(1)
            counts[c] = counts.get(c, 0) + 1
        best = sorted(counts.items(), key=lambda kv: -kv[1])
        if best and (len(best) == 1 or best[0][1] > best[1][1]):
            return CANON[best[0][0]]
    # last resort: a single class dominating all mentions (>=3 hits, 2x the runner-up),
    # never counting the archetype's own name.
    counts = {}
    for m in MENTION.finditer(t):
        c = m.group(1)
        if squash(c) in own: continue
        counts[c] = counts.get(c, 0) + 1
    top = sorted(counts.items(), key=lambda kv: -kv[1])
    if top and top[0][1] >= 3 and (len(top) == 1 or top[0][1] >= 2 * top[1][1]):
        return CANON[top[0][0]]
    return ''

# ---- index the archived archetype pages ----
files = {}
for p in glob.glob(os.path.join(CL, '*', 'Archetypes', '*.html')):
    files[squash(os.path.splitext(os.path.basename(p))[0])] = p

# ---- load, backfill, write ----
lines = open(TSV, encoding='utf-8').read().split('\n')
if lines and lines[-1] == '': lines.pop()
header = lines[0].split('\t')
ncols = len(header)
i_name, i_base, i_sys, i_desc = (header.index(c) for c in ('name','base_class','system','description'))

filled, unresolved, how = 0, [], {'breadcrumb':0,'text':0,'desc':0,'override':0}
for i in range(1, len(lines)):
    f = lines[i].split('\t')
    assert len(f) == ncols, f'row {i}: {len(f)} cols'
    if f[i_sys] != 'spheres' or f[i_base].strip(): continue
    name = f[i_name]
    cls, via = '', ''
    for k in row_keys(name):
        if k in OVERRIDES: cls, via = OVERRIDES[k], 'override'; break
    path = ''
    if not cls:
        for k in row_keys(name):
            if k in files: path = files[k]; break
    if not cls and path:
        h = open(path, encoding='utf-8', errors='replace').read()
        cls = breadcrumb_class(h)
        via = 'breadcrumb' if cls else ''
        if not cls:
            cls = text_class(clean(body_of(h)), name)
            via = 'text' if cls else ''
    if not cls:  # no file matched (or file gave nothing): mine the TSV description
        cls = text_class(f[i_desc].replace('<br>', ' '), name)
        via = 'desc' if cls else ''
    if cls:
        f[i_base] = cls
        lines[i] = '\t'.join(f)
        filled += 1; how[via] += 1
    else:
        unresolved.append(name)

if not DRY:
    with open(TSV, 'w', encoding='utf-8', newline='') as out:
        out.write('\n'.join(lines) + '\n')

# ---- verify ----
chk = open(TSV, encoding='utf-8').read().split('\n')
if chk and chk[-1] == '': chk.pop()
bad = [n for n, ln in enumerate(chk) if len(ln.split('\t')) != ncols]
blanks = sum(1 for ln in chk[1:] if not ln.split('\t')[i_base].strip() and ln.split('\t')[i_sys] == 'spheres')
print(f"rows={len(chk)-1} cols_ok={not bad} filled={filled} via={how}")
print(f"spheres blank base_class remaining (on disk): {blanks}{' [dry-run]' if DRY else ''}")
if unresolved:
    print(f"unresolved={len(unresolved)}: " + '; '.join(unresolved[:10]))
