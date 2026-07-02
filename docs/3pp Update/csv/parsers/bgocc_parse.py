import re, os, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
OPT=os.path.join(ROOT,"3pp Optional Rulesets"); OUTDIR=os.path.join(ROOT,"csv")
def clean(s):
    if not s: return ''
    s=re.sub(r'(?is)<table.*?</table>',' ',s)  # drop roll tables from prose
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s); s=re.sub(r'[ \t]+',' ',s)
    s='\n'.join(ln.strip() for ln in s.split('\n')); return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
h=open(os.path.join(OPT,"Backgrounds and Occupations (Adamant).html"),encoding='utf-8',errors='replace').read()
cm=re.search(r'<link rel="canonical" href="([^"]+)"', h)
URL=cm.group(1) if cm else "https://www.d20pfsrd.com/gamemastering/other-rules/variant-rules-3rd-party/adamant-entertainment/backgrounds-occupations/"
SRC="Backgrounds & Occupations (Adamant Entertainment)"
# all headings in order
H=[(m.start(),m.end(),int(m.group(1)),re.sub('<[^>]+>','',m.group(2)).strip()) for m in re.finditer(r'<h([1-4])[^>]*>(.*?)</h\1>', h, re.S)]
def block_after(end,nextpos): return h[end:nextpos]
CATS={'Tribal','Marine','Wandering','Rural','Village','Urban','Castle','Outlaw'}
cbd=next((i for i,(s,e,l,t) in enumerate(H) if t.startswith('Character Background Details')), None)
STOP={'Discuss!','Latest Pathfinder products in the Open Gaming Store'}
brows=[]; orows=[]
for i,(s,e,l,t) in enumerate(H):
    nextpos=H[i+1][0] if i+1<len(H) else len(h)
    if l==3 and t in CATS:
        brows.append({"name":t,"type":"General Background","description":cell(block_after(e,nextpos)),
            "source":SRC,"url":URL})
    if cbd is not None and i>cbd and l==4 and not t.startswith('Table:') and t not in STOP and t:
        blk=block_after(e,nextpos); txt=cell(blk)
        cs=re.search(r'([^.<]*class skill[^.<]*\.)', clean(blk), re.I)
        feat=re.search(r'([^.<]*bonus feat[^.<]*\.)', clean(blk), re.I)
        orows.append({"name":t,"class_skills_or_benefit":cell(cs.group(1)) if cs else '',
            "granted_feat":cell(feat.group(1)) if feat else '',"description":txt,"source":SRC,"url":URL})
BCOLS=["name","type","description","source","url"]
OCOLS=["name","class_skills_or_benefit","granted_feat","description","source","url"]
for fn,cols,rows in [("backgrounds.tsv",BCOLS,brows),("occupations.tsv",OCOLS,orows)]:
    with open(os.path.join(OUTDIR,fn),"w",encoding="utf-8",newline="") as f:
        f.write("\t".join(cols)+"\n")
        for r in rows: f.write("\t".join(r.get(c,"") for c in cols)+"\n")
print(f"backgrounds={len(brows)} occupations={len(orows)}")
