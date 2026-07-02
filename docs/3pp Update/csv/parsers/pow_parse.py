import re, os, glob, html as _html, sys
ROOT = "/sessions/brave-blissful-turing/mnt/3pp Update"
DDIR = os.path.join(ROOT, "3pp System Rules", "Path Of War", "Disciplines")
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
    s = clean(s).replace('\t',' ').replace('\n','<br>')
    return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def enumval(s):
    s=cell(s); s=re.sub(r'^\u2022\s*','',s)
    s=re.sub(r'\s*<br>\s*\u2022?\s*',', ',s)
    return s.strip(', ').strip()
def vert(h):
    d={}
    for m in re.finditer(r'<div class="pi-item pi-data[^"]*" data-source="([^"]+)">\s*<h3 class="pi-data-label[^"]*">(.*?)</h3>\s*<div class="pi-data-value[^"]*">(.*?)</div>\s*</div>', h, re.S):
        d[m.group(1)]=m.group(3)
    return d
def canon(h,name):
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h)
    return m.group(1) if m else "https://metzo.miraheze.org/wiki/"+name.replace(' ','_')
ORD={'1st':1,'2nd':2,'3rd':3,'4th':4,'5th':5,'6th':6,'7th':7,'8th':8,'9th':9}

DCOLS=["name","associated_skill","associated_weapon_groups","martial_tradition","title_veil","dao_veil","description","source","url"]
MCOLS=["name","discipline","level","category","type","descriptor","description","source","url"]

def parse_disc(path):
    h=open(path,encoding='utf-8',errors='replace').read()
    nm=re.search(r'data-source="name"[^>]*>(.*?)</h2>', h, re.S)
    name=clean(nm.group(1)) if nm else os.path.basename(path).replace('.html','')
    v=vert(h)
    sb=re.search(r'data-source="sourcebook"[^>]*>(.*?)</td>', h, re.S)
    source=cell(sb.group(1)) if sb else ''
    url=canon(h,name)
    j=h.find('</aside>'); body=h[j+8:] if j>0 else h
    kf=body.find('id="catlinks"'); body=body[:kf] if kf>0 else body
    # description = <p> before first wikitable
    firstT=re.search(r'<table[^>]*wikitable', body)
    intro=body[:firstT.start()] if firstT else body
    ps=re.findall(r'<p>(.*?)</p>', intro, re.S)
    desc=cell("<br><br>".join(p for p in ps if clean(p)))
    disc_row={"name":name,"associated_skill":cell(v.get("skill","")),
        "associated_weapon_groups":cell(v.get("weapon","")),"martial_tradition":cell(v.get("tradition","")),
        "title_veil":cell(v.get("titleveil","")),"dao_veil":cell(v.get("daoveil","")),
        "description":desc,"source":source,"url":url}
    # headings + tables in order
    heads=[(m.start(), clean(m.group(2))) for m in re.finditer(r'<h([23])[^>]*>(.*?)</h\1>', body, re.S)]
    man=[]
    for tm in re.finditer(r'<table[^>]*wikitable[^>]*>(.*?)</table>', body, re.S):
        pos=tm.start(); t=tm.group(1)
        # level = last 'Nth Level' heading before pos
        lvl=''
        for hp,ht in heads:
            if hp<pos:
                mm=re.match(r'(\d+)(?:st|nd|rd|th)\s+Level', ht)
                if mm: lvl=mm.group(1)
            else: break
        rows=re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S)
        for r in rows:
            if '<th' in r: continue
            cells=re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
            if len(cells)<5: continue
            mnm=clean(cells[0])
            if not mnm: continue
            man.append({"name":mnm,"discipline":name,"level":lvl,"category":enumval(cells[1]),
                "type":enumval(cells[2]),"descriptor":enumval(cells[3]),"description":cell(cells[4]),
                "source":source,"url":url})
    return disc_row, man

discs, mans, errs = [], [], 0
for p in sorted(glob.glob(os.path.join(DDIR,"*.html"))):
    h=open(p,encoding='utf-8',errors='replace').read()
    if 'Associated Skill' not in h: continue   # skip class-like + index
    try:
        d,m=parse_disc(p); discs.append(d); mans.extend(m)
    except Exception as e:
        errs+=1; print("ERR",os.path.basename(p),e)
with open(os.path.join(OUTDIR,"pow_disciplines.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(DCOLS)+"\n")
    for r in discs: f.write("\t".join(r.get(c,"") for c in DCOLS)+"\n")
with open(os.path.join(OUTDIR,"pow_maneuvers.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(MCOLS)+"\n")
    for r in mans: f.write("\t".join(r.get(c,"") for c in MCOLS)+"\n")
print(f"disciplines={len(discs)} maneuvers={len(mans)} errs={errs}")
