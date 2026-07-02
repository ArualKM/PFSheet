import re, os, glob, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
CL=os.path.join(ROOT,"3pp Classes","Spheres"); OUTDIR=os.path.join(ROOT,"csv")
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
def content(h):
    m=re.search(r'<div id="page-content"[^>]*>(.*?)(?:<div class="page-tags"|<div id="footer"|<!-- end content)', h, re.S)
    return m.group(1) if m else ''
def paras(body):
    return [p for p in (clean(m.group(2)) for m in re.finditer(r'<(p|dl)[^>]*>(.*?)</\1>', body, re.S)) if p]
def features(body):
    out=[]
    for l in re.findall(r'<(?:b|strong)>\s*([A-Z][^<:]{2,44}\((?:Su|Ex|Sp|Ps|Su/Sp)\))\s*:?\s*</(?:b|strong)>', body):
        l=clean(l)
        if l and l not in out: out.append(l)
    return out
OPTKW=re.compile(r'(Discoveries|Alternate Class Features|Rage Powers|Rogue Talents|Ki Powers|Orders|Domains|Hexes|Exploits|Bloodlines|Schools|Revelations|Mysteries|Blessings|Wild Talents|Masterpieces|Hymns|Class Features|Talents|Options)$')
def opt_type(fn):
    for kw,ty in [("Alternate Class Features","alternate_class_feature"),("Discoveries","discovery"),
        ("Rage Powers","rage_power"),("Rogue Talents","rogue_talent"),("Ki Powers","ki_power"),
        ("Orders","order"),("Domains","domain"),("Hexes","hex"),("Exploits","exploit"),
        ("Bloodlines","bloodline"),("Schools","school"),("Revelations","revelation"),
        ("Mysteries","mystery"),("Blessings","blessing"),("Wild Talents","wild_talent"),
        ("Masterpieces","masterpiece"),("Hymns","hymn"),("Talents","talent"),("Options","option")]:
        if fn.endswith(kw): return ty
    return "option"
files=glob.glob(os.path.join(CL,"Base PF Archetypes","*","*.html"))+glob.glob(os.path.join(CL,"*","Archetypes","*.html"))
ACOLS=["name","base_class","system","altered_features","description","source","url"]
OCOLS=["name","base_class","system","option_type","description","source","url"]
arch=[]; opts=[]
for p in files:
    try:
        h=open(p,encoding='utf-8',errors='replace').read()
        fn=os.path.basename(p)[:-5]
        tm=re.search(r'<title>(.*?)</title>', h, re.S); title=clean(tm.group(1)) if tm else fn
        title=re.sub(r'\s*[-–]\s*Spheres of (Power|Might) Wiki.*$','',title).strip()
        body=content(h); desc=cell("<br><br>".join(paras(body))); url=canon(h)
        folder=os.path.basename(os.path.dirname(p))
        in_arch_folder="/Archetypes/" in p
        SRC="Spheres of Power/Might (Drop Dead Studios)"
        if (not in_arch_folder) and OPTKW.search(fn):
            opts.append({"name":title,"base_class":folder,"system":"spheres",
                "option_type":opt_type(fn),"description":desc,"source":SRC,"url":url})
        else:
            bm=re.search(r'\((.*?)\s+Archetype\)', title)
            if bm: base=bm.group(1).strip()
            elif not in_arch_folder: base=folder
            else:
                cm=re.search(r'archetype (?:for|of|available to)(?: the)?\s+([A-Z][a-zA-Z]+)', clean(body)[:400])
                base=cm.group(1) if cm else ''
            nm=re.sub(r'\s*\(.*?Archetype\)','',title).strip()
            arch.append({"name":nm,"base_class":base,"system":"spheres",
                "altered_features":cell(", ".join(features(body))),"description":desc,"source":SRC,"url":url})
    except Exception: pass
with open(os.path.join(OUTDIR,"_spheres_arch_rows.tsv"),"w",encoding="utf-8",newline="") as f:
    for r in arch: f.write("\t".join(scrub(r.get(c,"")) for c in ACOLS)+"\n")
with open(os.path.join(OUTDIR,"spheres_class_options.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(OCOLS)+"\n")
    for r in opts: f.write("\t".join(scrub(r.get(c,"")) for c in OCOLS)+"\n")
print(f"arch={len(arch)} opts={len(opts)}")
