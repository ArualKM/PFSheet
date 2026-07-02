import re, os, glob, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
FD=os.path.join(ROOT,"3pp Feats","Spheres"); OUTDIR=os.path.join(ROOT,"csv")
def clean(s):
    if not s: return ''
    s=s.replace('\r',' ').replace(' ',' ').replace(' ',' ')
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s); s=re.sub(r'[ \t]+',' ',s)
    s='\n'.join(ln.strip() for ln in s.split('\n')); return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def scrub(s): return str(s).replace('\t',' ').replace('\r',' ').replace('\n','<br>')
def canon(h,fb=''):
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h); return m.group(1) if m else fb
COLS=["name","type","system","prerequisites","benefit","normal","special","source","url"]
rows=[]
for p in sorted(glob.glob(os.path.join(FD,"*.html"))):
    h=open(p,encoding='utf-8',errors='replace').read()
    m=re.search(r'<div id="page-content"[^>]*>(.*?)(?:<div class="page-tags"|<div id="footer")',h,re.S)
    body=m.group(1) if m else ''
    url=canon(h)
    parts=re.split(r'<h3[^>]*>(.*?)</h3>', body)
    for k in range(1,len(parts)-1,2):
        raw=clean(parts[k]); blk=clean(parts[k+1])
        if not raw or 'Table of Contents' in raw: continue
        tag=re.search(r'\[([^\]]+)\]', raw)
        name=re.sub(r'\s*\[[^\]]+\]','',raw).strip()
        typ=''
        pm=re.search(r'\(([^)]+)\)', name)
        if pm: typ=pm.group(1)
        src=re.search(r'Source\s*:\s*(.*?)(?:Prerequisite|Benefit|$)', blk, re.S)
        pre=re.search(r'Prerequisite[s]?\s*:\s*(.*?)(?:Benefit|Source|$)', blk, re.S)
        ben=re.search(r'Benefit[s]?\s*:\s*(.*?)(?:Normal\s*:|Special\s*:|$)', blk, re.S)
        nor=re.search(r'Normal\s*:\s*(.*?)(?:Special\s*:|$)', blk, re.S)
        spe=re.search(r'Special\s*:\s*(.*)$', blk, re.S)
        srctext="Spheres of Power/Might (Drop Dead Studios)"
        if src: srctext=cell(src.group(1))+((" ["+tag.group(1)+"]") if tag else "")
        elif tag: srctext+=" ["+tag.group(1)+"]"
        rows.append({"name":name,"type":typ,"system":"spheres",
            "prerequisites":cell(pre.group(1)) if pre else '',"benefit":cell(ben.group(1)) if ben else '',
            "normal":cell(nor.group(1)) if nor else '',"special":cell(spe.group(1)) if spe else '',
            "source":srctext,"url":url})
with open(os.path.join(OUTDIR,"spheres_feats.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(COLS)+"\n")
    for r in rows: f.write("\t".join(scrub(r.get(c,"")) for c in COLS)+"\n")
print(f"spheres_feats={len(rows)}")
