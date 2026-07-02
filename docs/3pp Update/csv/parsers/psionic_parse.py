#!/usr/bin/env python3
import re, os, glob, html as _html, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else "/sessions/brave-blissful-turing/mnt/3pp Update"
POWDIR = os.path.join(ROOT, "3pp System Rules", "Psionics", "Powers")
OUTDIR = os.path.join(ROOT, "csv"); os.makedirs(OUTDIR, exist_ok=True)

def clean(s):
    if not s: return ''
    s = re.sub(r'(?is)<br\s*/?>', '\n', s)
    s = re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>', '\n', s)
    s = re.sub(r'(?is)<li[^>]*>', '• ', s)
    s = re.sub(r'(?s)<[^>]+>', '', s)
    s = _html.unescape(s)
    s = re.sub(r'[ \t]+', ' ', s)
    s = '\n'.join(ln.strip() for ln in s.split('\n'))
    return re.sub(r'\n{3,}', '\n\n', s).strip()

def cell(s):
    s = clean(s).replace('\t', ' ').replace('\n', '<br>')
    return re.sub(r'(?:<br>){3,}', '<br><br>', s).strip()

def infobox_vertical(h):
    d = {}
    for m in re.finditer(r'<div class="pi-item pi-data[^"]*" data-source="([^"]+)">\s*<h3 class="pi-data-label[^"]*">(.*?)</h3>\s*<div class="pi-data-value[^"]*">(.*?)</div>\s*</div>', h, re.S):
        d[m.group(1)] = m.group(3)
    return d

def infobox_horizontal(h):
    out = {}
    for tbl in re.findall(r'<table class="pi-horizontal-group">(.*?)</table>', h, re.S):
        labels = [clean(x) for x in re.findall(r'<th class="pi-horizontal-group-item[^"]*"[^>]*>(.*?)</th>', tbl, re.S)]
        vals   = [clean(x) for x in re.findall(r'<td class="pi-horizontal-group-item[^"]*"[^>]*>(.*?)</td>', tbl, re.S)]
        for lab, val in zip(labels, vals):
            if lab: out[lab] = val
    return out

def parse_classes(html_val):
    rows = []
    items = re.findall(r'<li[^>]*>(.*?)</li>', html_val, re.S) or [html_val]
    for it in items:
        t = clean(it)
        if not t: continue
        m = re.match(r'^(.*?)\s+(\d+)\b', t)
        if m:
            cls = re.sub(r'\s*\(.*$', '', m.group(1)).strip()
            rows.append((cls, m.group(2)))
        else:
            cls = re.sub(r'\s*\(.*$', '', t).strip()
            if cls: rows.append((cls, ''))
    return rows

def canon_url(h, name):
    m = re.search(r'<link rel="canonical" href="([^"]+)"', h)
    return m.group(1) if m else "https://metzo.miraheze.org/wiki/" + name.replace(' ', '_')

def split_body(body):
    mythic = ''
    mi = body.find('id="Mythic"')
    if mi > 0:
        pre = body[:mi]; hr = pre.rfind('<hr'); cut = hr if hr > 0 else mi
        mythic = body[cut:]; body = body[:cut]
    ia = body.find('<b>Augment')
    if ia < 0: ia = body.find('<b> Augment')
    isp = body.find('<b>Special')
    if isp < 0: isp = body.find('<b> Special')
    marks = [x for x in (ia, isp) if x >= 0]
    description = body[:min(marks)] if marks else body
    augment = special = ''
    if ia >= 0:
        aug_end = isp if (isp > ia) else len(body); augment = body[ia:aug_end]
    if isp >= 0:
        sp_end = ia if (ia > isp) else len(body); special = body[isp:sp_end]
    return description, augment, special, mythic

POW_COLS = ["name","discipline","descriptors","display","manifesting_time","range","target_area_effect","duration","saving_throw","power_resistance","power_points","description","augment","special","mythic","source","url"]
JUNC_COLS = ["power","class","level"]

def parse_power(path):
    h = open(path, encoding='utf-8', errors='replace').read()
    name_m = re.search(r'data-source="name"[^>]*>(.*?)</h2>', h, re.S)
    name = clean(name_m.group(1)) if name_m else os.path.splitext(os.path.basename(path))[0]
    v = infobox_vertical(h); hz = infobox_horizontal(h)
    j = h.find('</aside>'); body = h[j+8:] if j > 0 else h
    k = body.find('<h2');  body = body[:k] if k > 0 else body
    description, augment, special, mythic = split_body(body)
    sb = re.search(r'data-source="sourcebook"[^>]*>(.*?)</td>', h, re.S)
    source_val = cell(sb.group(1)) if sb else ''
    tae = [f"{lab}: {clean(hz[lab])}" for lab in ("Target","Area","Effect","Target or Area","Targets") if hz.get(lab, '').strip()]
    row = {"name": name, "discipline": cell(v.get("discipline","")), "descriptors": cell(v.get("descriptor1","")),
        "display": cell(v.get("display","")), "manifesting_time": cell(v.get("time","")),
        "range": cell(hz.get("Range","")), "target_area_effect": cell("<br>".join(tae)) if tae else '',
        "duration": cell(hz.get("Duration","")), "saving_throw": cell(hz.get("Saving Throw","")),
        "power_resistance": cell(hz.get("Power Resistance","")), "power_points": cell(hz.get("Power Points","")),
        "description": cell(description), "augment": cell(augment), "special": cell(special),
        "mythic": cell(mythic), "source": source_val, "url": canon_url(h, name)}
    juncs = []
    if v.get("class1"):
        for cls, lvl in parse_classes(v["class1"]): juncs.append({"power": name, "class": cls, "level": lvl})
    elif v.get("classall"):
        juncs.append({"power": name, "class": "All", "level": clean(v["classall"])})
    return row, juncs

def main():
    files = sorted(glob.glob(os.path.join(POWDIR, "*.html")))
    prows, jrows, errs = [], [], 0
    for p in files:
        try:
            r, js = parse_power(p); prows.append(r); jrows.extend(js)
        except Exception as e:
            errs += 1; print("ERR", os.path.basename(p), e)
    with open(os.path.join(OUTDIR, "psionic_powers.tsv"), "w", encoding="utf-8", newline="") as f:
        f.write("\t".join(POW_COLS) + "\n")
        for r in prows: f.write("\t".join(r.get(c, "") for c in POW_COLS) + "\n")
    with open(os.path.join(OUTDIR, "psionic_power_class_levels.tsv"), "w", encoding="utf-8", newline="") as f:
        f.write("\t".join(JUNC_COLS) + "\n")
        for r in jrows: f.write("\t".join(r.get(c, "") for c in JUNC_COLS) + "\n")
    print(f"powers={len(prows)} juncs={len(jrows)} errs={errs}")
main()
