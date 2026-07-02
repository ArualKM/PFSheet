import re, os, glob, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
CL=os.path.join(ROOT,"3pp Classes","Spheres"); OUTDIR=os.path.join(ROOT,"csv")
def clean(s):
    if not s: return ''
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?is)<li[^>]*>','• ',s); s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s)
    s=re.sub(r'[ \t]+',' ',s); s='\n'.join(ln.strip() for ln in s.split('\n'))
    return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def canon(h,fb=''):
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h); return m.group(1) if m else fb
def body_paras(body):
    return [p for p in (clean(m.group(2)) for m in re.finditer(r'<(p|dl)[^>]*>(.*?)</\1>', body, re.S)) if p]
def features(body):
    out=[]
    for l in re.findall(r'<(?:b|strong)>\s*([A-Z][^<:]{2,40}\((?:Su|Ex|Sp|Ps|Su/Sp)\))\s*:?\s*</(?:b|strong)>', body):
        l=clean(l)
        if l and l not in out: out.append(l)
    return out
COLS=["name","base_class","system","altered_features","description","source","url"]
files=glob.glob(os.path.join(CL,"Base PF Archetypes","*","*.html"))+glob.glob(os.path.join(CL,"*","Archetypes","*.html"))
rows=[]
for p in files:
    try:
        h=open(p,encoding='utf-8',errors='replace').read()
        tm=re.search(r'<title>(.*?)</title>', h, re.S); title=clean(tm.group(1)) if tm else ''
        title=re.sub(r'\s*[-–]\s*Spheres of (Power|Might) Wiki.*$','',title).strip()
        bm=re.search(r'^(.*?)\s*\((.*?)\s+Archetype\)', title)
        if bm: name, base = bm.group(1).strip(), bm.group(2).strip()
        else: name, base = title, os.path.basename(os.path.dirname(p))
        m=re.search(r'<div id="page-content"[^>]*>(.*?)(?:<div class="page-tags"|<div id="footer"|<!-- end content)', h, re.S)
        body=m.group(1) if m else ''
        rows.append({"name":name,"base_class":base,"system":"spheres",
            "altered_features":cell(", ".join(features(body))),
            "description":cell("<br><br>".join(body_paras(body))),
            "source":"Spheres of Power/Might (Drop Dead Studios)","url":canon(h)})
    except Exception as e:
        pass
with open(os.path.join(OUTDIR,"_spheres_arch_rows.tsv"),"w",encoding="utf-8",newline="") as f:
    for r in rows: f.write("\t".join(r.get(c,"") for c in COLS)+"\n")
open(os.path.join(OUTDIR,"_spheres_arch.done"),"w").write(str(len(rows)))
print(f"spheres_archetypes={len(rows)}")
