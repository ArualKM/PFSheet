"""Parse d20pfsrd Path of War base-class pages into threepp_classes.tsv rows.

Stalker / Warder / Warlord / Zealot are NEW rows; Harbinger / Mystic REPLACE the
sparse Fandom rows (matched by name + system=path_of_war). Idempotent: re-running
removes any prior row for these six (name, path_of_war) pairs and re-appends.
Run with:  python -X utf8 pow_classes_d20.py
"""
import re, os, html as _html, json

SRC = r"C:\Users\bitte\Documents\Projects\PFSheet\docs\3pp Update\3pp Classes\Path Of War"
OUT = r"C:\Users\bitte\Documents\Projects\PFSheet\docs\3pp Update\csv\threepp_classes.tsv"
FILES = ["Stalker – d20PFSRD.html", "Warder – d20PFSRD.html", "Warlord – d20PFSRD.html",
         "Zealot – d20PFSRD.html", "Harbinger – d20PFSRD.html", "Mystic – d20PFSRD.html"]
COLS = ["name", "class_type", "system", "alignment", "hit_die", "skill_points", "bab",
        "fort", "ref", "will", "class_features", "progression_json", "description", "source", "url"]

def clean(s):
    if not s: return ''
    s = s.replace('\r', ' ').replace('\xa0', ' ')
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', s)
    s = re.sub(r'(?is)<script[^>]*>.*?</script>', ' ', s)
    s = re.sub(r'(?is)<br\s*/?>', '\n', s)
    s = re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>', '\n', s)
    s = re.sub(r'(?s)<[^>]+>', '', s)
    s = _html.unescape(s).replace('\xa0', ' ')
    s = re.sub(r'[ \t]+', ' ', s)
    s = '\n'.join(x.strip() for x in s.split('\n'))
    return re.sub(r'\n{3,}', '\n\n', s).strip()

def cell(s):
    s = clean(s).replace('\t', ' ').replace('\n', '<br>')
    return re.sub(r'(?:<br>){3,}', '<br><br>', s).strip()

def scrub(s):
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', str(s)).replace('\t', ' ').replace('\r', ' ').replace('\n', '<br>')

def canon(h):
    m = re.search(r'<link rel="canonical" href="([^"]+)"', h)
    return m.group(1) if m else ''

def content(h):
    m = re.search(r'<div[^>]*class="[^"]*article-content[^"]*"[^>]*>(.*)', h, re.S)
    return m.group(1) if m else h

def stat_para(body, key):
    m = re.search(r'(?is)<p><b>\s*' + key + r'\s*</b>\s*:?\s*(.*?)</p>', body)
    return clean(m.group(1)) if m else ''

def progression(body):
    """First table whose first header is Level -> header-row JSON, complete columns."""
    for tm in re.finditer(r'(?s)<table[^>]*>(.*?)</table>', body):
        t = tm.group(1)
        trs = re.findall(r'(?s)<tr[^>]*>(.*?)</tr>', t)
        if not trs: continue
        hdr = [clean(x) for x in re.findall(r'(?s)<th[^>]*>(.*?)</th>', trs[0])]
        if not hdr or hdr[0] != 'Level': continue
        rows = [hdr]
        for r in trs[1:]:
            cs = [clean(x).replace('\n', ' ') for x in re.findall(r'(?s)<t[dh][^>]*>(.*?)</t[dh]>', r)]
            if cs: rows.append(cs)
        return rows
    return []

def features(body):
    """h4 headings inside the Class Features section."""
    m = re.search(r'(?is)<h3[^>]*>\s*Class Features\s*</h3>(.*?)(?=<h2|Section 15)', body)
    if not m: return []
    out = []
    for x in re.findall(r'(?is)<h4[^>]*>(.*?)</h4>', m.group(1)):
        x = clean(x).replace('\n', ' ')
        if x and x not in out: out.append(x)
    return out

def description(body):
    """Class intro text: every real paragraph between <h1> and the Hit Die stat line."""
    start = body.find('</h1>')
    end = re.search(r'(?is)<p><b>\s*Hit Die\s*</b>', body)
    end = end.start() if end else (re.search(r'(?is)<h3[^>]*>\s*Class Skills', body) or re.search(r'$', body)).start()
    seg = body[start + 5 if start >= 0 else 0:end]
    paras = []
    for pm in re.finditer(r'(?s)<p[^>]*>(.*?)</p>', seg):
        t = clean(pm.group(1))
        if not t or t == 'Subpages' or 'ognCreate' in t: continue
        paras.append(t)
    return '<br><br>'.join(cell(p) for p in paras)

def sources(h):
    """Section 15 lines naming the Path of War books."""
    i = h.find('Section 15')
    if i < 0: return 'Path of War (Dreamscarred Press)'
    seg = clean(h[i:i + 1200])
    lines = [ln.strip() for ln in seg.split('\n') if re.search(r'(?i)path of war', ln)]
    lines = [re.sub(r'\s+', ' ', ln).rstrip('.') for ln in lines]
    return '<br>'.join(dict.fromkeys(lines)) or 'Path of War (Dreamscarred Press)'

BAB_RATE = {20: 'Full', 15: '3/4', 10: '1/2'}
SAVE_RATE = {12: 'Good', 6: 'Poor'}

def rate(cell_txt, table):
    m = re.match(r'^\+(\d+)', cell_txt or '')
    if not m: return cell_txt or ''
    return table.get(int(m.group(1)), cell_txt)

rows = []
report = []
for fn in FILES:
    h = open(os.path.join(SRC, fn), encoding='utf-8', errors='replace').read()
    body = content(h)
    body = re.split(r'(?i)Section 15', body)[0]
    nm = re.search(r'(?s)<h1[^>]*>(.*?)</h1>', body)
    name = clean(nm.group(1)) if nm else fn.split('–')[0].strip()
    align = re.split(r'[.;]', stat_para(body, 'Alignment'))[0].strip()
    hd = stat_para(body, 'Hit Die').rstrip('.').strip()
    sp = stat_para(body, 'Skill Ranks per Level').rstrip('.').strip()
    prog = progression(body)
    lvl20 = next((r for r in prog[1:] if r and r[0].startswith('20')), None)
    idx = {c: i for i, c in enumerate(prog[0])} if prog else {}
    def col(key): return lvl20[idx[key]] if (lvl20 and key in idx and idx[key] < len(lvl20)) else ''
    rows.append({
        "name": name, "class_type": "base", "system": "path_of_war",
        "alignment": cell(align), "hit_die": cell(hd), "skill_points": cell(sp),
        "bab": rate(col('Base Attack Bonus'), BAB_RATE),
        "fort": rate(col('Fort Save'), SAVE_RATE),
        "ref": rate(col('Ref Save'), SAVE_RATE),
        "will": rate(col('Will Save'), SAVE_RATE),
        "class_features": cell(", ".join(features(body))),
        "progression_json": json.dumps(prog, ensure_ascii=False) if prog else '',
        "description": description(body), "source": sources(h), "url": canon(h)})
    report.append((name, hd, sp, len(prog) - 1 if prog else 0))

# Rewrite the TSV: drop any existing path_of_war row for these six names, append fresh.
names = {r["name"] for r in rows}
lines = open(OUT, encoding='utf-8').read().splitlines()
header, data = lines[0], lines[1:]
kept = [ln for ln in data if not (ln.split('\t')[0] in names and len(ln.split('\t')) > 2 and ln.split('\t')[2] == 'path_of_war')]
removed = len(data) - len(kept)
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write(header + '\n')
    for ln in kept: f.write(ln + '\n')
    for r in rows: f.write('\t'.join(scrub(r.get(c, '')) for c in COLS) + '\n')
print(f"removed={removed} appended={len(rows)} total_data_rows={len(kept) + len(rows)}")
for name, hd, sp, n in report:
    print(f"  {name}: hit_die={hd} skill_points={sp!r} progression_rows={n}")
