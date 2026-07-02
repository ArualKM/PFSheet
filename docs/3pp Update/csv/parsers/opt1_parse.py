import re, os, glob, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
OPT=os.path.join(ROOT,"3pp Optional Rulesets")
OUTDIR=os.path.join(ROOT,"csv"); os.makedirs(OUTDIR,exist_ok=True)
def clean(s):
    if not s: return ''
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s); s=re.sub(r'[ \t]+',' ',s)
    s='\n'.join(ln.strip() for ln in s.split('\n')); return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def canon(h,fb=''):
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h) or re.search(r'<meta property="og:url" content="([^"]+)"', h)
    return m.group(1) if m else fb

# ---- MAJOR DRAWBACKS (29 subpages) ----
DDIR=os.path.join(OPT,"Major Drawbacks")
DCOLS=["name","effect","bonus_granted","description","source","url"]
drows=[]
SRC_DB="Ultimate Options: Minor and Major Drawbacks (Rogue Genius Games)"
for p in sorted(glob.glob(os.path.join(DDIR,"*.html"))):
    h=open(p,encoding='utf-8',errors='replace').read()
    m=re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
    name=clean(m.group(1)) if m else os.path.basename(p).replace('.html','')
    txt=clean(re.sub(r'(?is)<script.*?</script>','',h))
    bm=re.search(r'Bane\s*:\s*(.*?)(?:\n\s*\n|Section 15|Copyright|This site may|Latest Pathfinder)', txt, re.S)
    effect=cell(bm.group(1)) if bm else ''
    bo=re.search(r'(?:Boon|Benefit)\s*:\s*(.*?)(?:\n\s*\n|Section 15|Bane)', txt, re.S)
    drows.append({"name":name,"effect":effect,"bonus_granted":cell(bo.group(1)) if bo else '',
        "description":"","source":SRC_DB,"url":canon(h)})
with open(os.path.join(OUTDIR,"major_drawbacks.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(DCOLS)+"\n")
    for r in drows: f.write("\t".join(r.get(c,"") for c in DCOLS)+"\n")

# ---- FLAWS (single page, 13 h3) ----
FCOLS=["name","drawback_effect","prerequisite","description","source","url"]
h=open(os.path.join(OPT,"Flaws (3.5 SRD).html"),encoding='utf-8',errors='replace').read()
url=canon(h,"https://www.d20srd.org/srd/variant/buildingCharacters/characterFlaws.htm")
# region after 'Flaw Descriptions'
i=h.find('Flaw Descriptions'); body=h[i:]
# split on h3 flaw headings
parts=re.split(r'<h3[^>]*>(.*?)</h3>', body)
frows=[]
# parts: [pre, name1, block1, name2, block2, ...]
for k in range(1,len(parts)-1,2):
    name=clean(parts[k]); block=parts[k+1]
    # cut block at next h2/footer
    block=re.split(r'<h2', block)[0]
    txt=clean(block)
    pre=re.search(r'Prerequisite[s]?\s*:?\s*(.*?)(?:\n|Effect)', txt, re.S)
    eff=re.search(r'Effect\s*:?\s*(.*)$', txt, re.S)
    desc=txt.split('Effect')[0].strip()
    if not name or len(name)>50: continue
    frows.append({"name":name,"drawback_effect":cell(eff.group(1) if eff else txt),
        "prerequisite":cell(pre.group(1)) if pre else '',"description":cell(desc),
        "source":"Character Flaws (3.5e SRD variant)","url":url})
with open(os.path.join(OUTDIR,"flaws.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(FCOLS)+"\n")
    for r in frows: f.write("\t".join(r.get(c,"") for c in FCOLS)+"\n")
print(f"major_drawbacks={len(drows)} flaws={len(frows)}")
