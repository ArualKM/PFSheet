import re, os, glob, html as _html, json
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"; OUTDIR=os.path.join(ROOT,"csv")
def clean(s):
    if not s: return ''
    s=s.replace('\r',' ').replace(' ',' ').replace(' ',' ')
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?is)<li[^>]*>','• ',s); s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s)
    s=re.sub(r'[ \t]+',' ',s); s='\n'.join(ln.strip() for ln in s.split('\n')); return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def scrub(s): return str(s).replace('\t',' ').replace('\r',' ').replace('\n','<br>')
def canon(h,name): 
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h); return m.group(1) if m else ''
def vert(h):
    d={}
    for m in re.finditer(r'data-source="([^"]+)">\s*<h3 class="pi-data-label[^"]*">(.*?)</h3>\s*<div class="pi-data-value[^"]*">(.*?)</div>', h, re.S):
        d[m.group(1)]=clean(m.group(3))
    return d
def features(body):
    out=[]
    for l in re.findall(r'<(?:b|strong)>\s*([A-Z][^<:]{2,44}\((?:Su|Ex|Sp|Ps)\))\s*:?\s*</(?:b|strong)>', body):
        l=clean(l)
        if l and l not in out: out.append(l)
    return out
def progression(body):
    tm=re.search(r'<table[^>]*wikitable[^>]*>(.*?)</table>', body, re.S)
    if not tm: return ''
    t=tm.group(1); rows=re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S)
    hdr=[clean(x) for x in re.findall(r'<th[^>]*>(.*?)</th>', rows[0], re.S)] if rows else []
    out=[]
    for r in rows[1:]:
        cs=[clean(x) for x in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, re.S)]
        if cs and hdr and len(cs)==len(hdr): out.append(dict(zip(hdr,cs)))
        elif cs: out.append(cs)
    return json.dumps(out, ensure_ascii=False) if out else ''
COLS=["name","class_type","system","alignment","hit_die","skill_points","bab","fort","ref","will","class_features","progression_json","description","source","url"]
paths=glob.glob(os.path.join(ROOT,"3pp System Rules/Path Of War/Disciplines/*.html"))+glob.glob(os.path.join(ROOT,"3pp Classes/Path Of War/*.html"))
rows=[]; seen=set()
for p in paths:
    h=open(p,encoding='utf-8',errors='replace').read()
    if 'Associated Skill' in h: continue
    if 'hitdie' not in h and 'Hit Die' not in h: continue
    v=vert(h)
    m=re.search(r'data-source="name"[^>]*>(.*?)</h2>', h, re.S) or re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
    name=clean(m.group(1)) if m else os.path.basename(p)[:-5]
    name=re.sub(r'\s*[-–]\s*(Library of Metzofitz|Path of War).*$','',name).strip()
    if not name or name in seen: continue
    seen.add(name)
    j=h.rfind('</aside>'); body=h[j+8:] if j>0 else h[h.find('</h1>'):]
    body=re.split(r'id="catlinks"|<div class="printfooter"|NewPP limit', body)[0]
    sb=re.search(r'data-source="sourcebook"[^>]*>(.*?)</td>', h, re.S)
    paras=[x for x in (clean(mm.group(2)) for mm in re.finditer(r'<(p|dl)[^>]*>(.*?)</\1>',body,re.S)) if x][:6]
    rows.append({"name":name,"class_type":"base","system":"path_of_war",
        "alignment":v.get("alignment",""),"hit_die":v.get("hitdie",""),"skill_points":v.get("skilleachlevel",""),
        "bab":v.get("bab",""),"fort":v.get("savefort",""),"ref":v.get("saveref",""),"will":v.get("savewill",""),
        "class_features":cell(", ".join(features(body))),"progression_json":progression(body),
        "description":cell("<br><br>".join(paras)),"source":cell(sb.group(1)) if sb else '',"url":canon(h,name)})
with open(os.path.join(OUTDIR,"threepp_classes.tsv"),"a",encoding="utf-8",newline="") as f:
    for r in rows: f.write("\t".join(scrub(r.get(c,"")) for c in COLS)+"\n")
print(f"pow_classes_appended={len(rows)}: {[r['name'] for r in rows]}")
