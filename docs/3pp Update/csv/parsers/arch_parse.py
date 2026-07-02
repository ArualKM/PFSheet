import re, os, glob, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
CL=os.path.join(ROOT,"3pp Classes"); OUTDIR=os.path.join(ROOT,"csv")
def clean(s):
    if not s: return ''
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?is)<li[^>]*>','• ',s); s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s)
    s=re.sub(r'[ \t]+',' ',s); s='\n'.join(ln.strip() for ln in s.split('\n'))
    return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def canon(h,fb=''):
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h) or re.search(r'<meta property="og:url" content="([^"]+)"', h)
    return m.group(1) if m else fb
def vert(h):
    d={}
    for m in re.finditer(r'data-source="([^"]+)">\s*<h3 class="pi-data-label[^"]*">(.*?)</h3>\s*<div class="pi-data-value[^"]*">(.*?)</div>', h, re.S):
        d[m.group(1)]=m.group(3)
    return d
def body_paras(body):
    paras=[clean(m.group(2)) for m in re.finditer(r'<(p|dl)[^>]*>(.*?)</\1>', body, re.S)]
    return [p for p in paras if p]
def features(body):
    labs=re.findall(r'<(?:b|strong)>\s*([A-Z][^<:]{2,40}\((?:Su|Ex|Sp|Ps|Su/Sp)\))\s*:?\s*</(?:b|strong)>', body)
    seen=[]; 
    for l in labs:
        l=clean(l)
        if l and l not in seen: seen.append(l)
    return seen
COLS=["name","base_class","system","altered_features","description","source","url"]
rows=[]
# --- Miraheze: Akashic + Psionics archetypes ---
for sysname,folder in [("akashic","Akashic/Archetypes"),("psionic","Psionics/Archetypes")]:
    for p in sorted(glob.glob(os.path.join(CL,folder,"*.html"))):
        h=open(p,encoding='utf-8',errors='replace').read()
        v=vert(h)
        m=re.search(r'data-source="name"[^>]*>(.*?)</h2>', h, re.S) or re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
        name=clean(m.group(1)) if m else os.path.basename(p).replace('.html','')
        j=h.rfind('</aside>'); body=h[j+8:] if j>0 else h[h.find('</h1>'):]
        body=re.split(r'id="catlinks"|<div class="printfooter"|NewPP limit', body)[0]
        sb=re.search(r'data-source="sourcebook"[^>]*>(.*?)</td>', h, re.S)
        source=cell(sb.group(1)) if sb else cell(v.get("sourcebook",""))
        rows.append({"name":name,"base_class":cell(v.get("class1","")),"system":sysname,
            "altered_features":cell(", ".join(features(body))),
            "description":cell("<br><br>".join(body_paras(body))),"source":source,
            "url":canon(h,"https://metzo.miraheze.org/wiki/"+name.replace(' ','_'))})
# --- Spheres archetypes (wikidot): Base PF + class archetypes ---
for p in glob.glob(os.path.join(CL,"Spheres","**","*.html"), recursive=True):
    h=open(p,encoding='utf-8',errors='replace').read()
    tm=re.search(r'<title>(.*?)</title>', h, re.S); title=clean(tm.group(1)) if tm else ''
    title=re.sub(r'\s*-\s*Spheres of Power Wiki.*$','',title).strip()
    bm=re.search(r'^(.*?)\s*\((.*?)\s+Archetype\)', title)
    if bm: name, base = bm.group(1).strip(), bm.group(2).strip()
    else: name, base = title, os.path.basename(os.path.dirname(p))
    m=re.search(r'<div id="page-content"[^>]*>(.*?)(?:<div class="page-tags"|<div id="footer"|<!-- end content)', h, re.S)
    body=m.group(1) if m else ''
    rows.append({"name":name,"base_class":base,"system":"spheres",
        "altered_features":cell(", ".join(features(body))),
        "description":cell("<br><br>".join(body_paras(body))),
        "source":"Spheres of Power/Might (Drop Dead Studios)","url":canon(h)})
with open(os.path.join(OUTDIR,"threepp_archetypes.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(COLS)+"\n")
    for r in rows: f.write("\t".join(r.get(c,"") for c in COLS)+"\n")
print(f"archetypes={len(rows)}")
