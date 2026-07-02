import re, os, glob, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
CL=os.path.join(ROOT,"3pp Classes"); OUTDIR=os.path.join(ROOT,"csv")
def scrub(s):
    return str(s).replace('\t',' ').replace('\r',' ').replace('\n','<br>')
def clean(s):
    if not s: return ''
    s=s.replace('\r',' ').replace('\u2028',' ').replace('\u2029',' ')
    s=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',' ',s)
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?is)<li[^>]*>','• ',s); s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s)
    s=re.sub(r'[ \t]+',' ',s); s='\n'.join(ln.strip() for ln in s.split('\n'))
    return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def canon(h,fb=''):
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h); return m.group(1) if m else fb
def vert(h):
    d={}
    for m in re.finditer(r'data-source="([^"]+)">\s*<h3 class="pi-data-label[^"]*">(.*?)</h3>\s*<div class="pi-data-value[^"]*">(.*?)</div>', h, re.S):
        d[m.group(1)]=m.group(3)
    return d
def body_paras(body):
    return [p for p in (clean(m.group(2)) for m in re.finditer(r'<(p|dl)[^>]*>(.*?)</\1>', body, re.S)) if p]
def features(body):
    out=[]
    for l in re.findall(r'<(?:b|strong)>\s*([A-Z][^<:]{2,40}\((?:Su|Ex|Sp|Ps|Su/Sp)\))\s*:?\s*</(?:b|strong)>', body):
        l=clean(l)
        if l and l not in out: out.append(l)
    return out
COLS=["name","base_class","system","altered_features","description","source","url"]
rows=[]
for sysname,folder in [("akashic","Akashic/Archetypes"),("psionic","Psionics/Archetypes")]:
    for p in sorted(glob.glob(os.path.join(CL,folder,"*.html"))):
        h=open(p,encoding='utf-8',errors='replace').read()
        v=vert(h)
        m=re.search(r'data-source="name"[^>]*>(.*?)</h2>', h, re.S) or re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
        name=clean(m.group(1)) if m else os.path.basename(p).replace('.html','')
        j=h.rfind('</aside>'); body=h[j+8:] if j>0 else h[h.find('</h1>'):]
        body=re.split(r'id="catlinks"|<div class="printfooter"|NewPP limit', body)[0]
        sb=re.search(r'data-source="sourcebook"[^>]*>(.*?)</td>', h, re.S)
        rows.append({"name":name,"base_class":cell(v.get("class1","")),"system":sysname,
            "altered_features":cell(", ".join(features(body))),
            "description":cell("<br><br>".join(body_paras(body))),
            "source":cell(sb.group(1)) if sb else '',
            "url":canon(h,"https://metzo.miraheze.org/wiki/"+name.replace(' ','_'))})
with open(os.path.join(OUTDIR,"threepp_archetypes.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(COLS)+"\n")
    for r in rows: f.write("\t".join(scrub(r.get(c,"")) for c in COLS)+"\n")
print(f"miraheze_archetypes={len(rows)}")
