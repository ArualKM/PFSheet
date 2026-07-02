import re, os, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
OPT=os.path.join(ROOT,"3pp Optional Rulesets"); OUTDIR=os.path.join(ROOT,"csv")
def clean(s):
    if not s: return ''
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s); s=re.sub(r'[ \t]+',' ',s)
    s='\n'.join(ln.strip() for ln in s.split('\n')); return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
h=open(os.path.join(OPT,"Oaths (Spheres).html"),encoding='utf-8',errors='replace').read()
cm=re.search(r'<link rel="canonical" href="([^"]+)"', h)
URL=cm.group(1) if cm else "http://spheresofpower.wikidot.com/oaths"
SRC="Spheres of Power — Oaths (Drop Dead Studios)"
# section bounds by content h2
def h2pos(name):
    for m in re.finditer(r'<h2[^>]*>(.*?)</h2>', h, re.S):
        if re.sub(r'<[^>]+>','',m.group(1)).strip().startswith(name):
            return m.start()
    return -1
o0=h2pos("Oaths"); b0=h2pos("Oath Points and Oath Boons"); e0=h2pos("Oaths and CR")
oath_html=h[o0:b0]; boon_html=h[b0:e0]
def blocks(seg):
    parts=re.split(r'<h3[^>]*>(.*?)</h3>', seg)
    out=[]
    for k in range(1,len(parts)-1,2):
        out.append((clean(parts[k]), parts[k+1]))
    return out
def pts(head):
    m=re.search(r'\((\d+)\s*Oath\s*[Pp]oint', head)
    if m: return m.group(1)
    if 'see text' in head.lower(): return 'see text'
    return ''
def srctag(head):
    m=re.search(r'\[([^\]]+)\]', head); return m.group(1) if m else ''
def basename(head):
    return re.sub(r'\s*[\(\[].*$','',head).strip()
# OATHS
OCOLS=["name","oath_points","oath","defiance_penalty","atonement","source","url"]
orows=[]
for head,blk in blocks(oath_html):
    if not head: continue
    t=clean(blk)
    def between(a,b):
        m=re.search(re.escape(a)+r'\s*(.*?)\s*'+re.escape(b), t, re.S); return m.group(1) if m else ''
    oath=between('Oath:','Defiance Penalty:') or (t.split('Defiance Penalty:')[0].replace('Oath:','').strip() if 'Oath:' in t else '')
    defi=between('Defiance Penalty:','Atonement:')
    aton=''
    ma=re.search(r'Atonement:\s*(.*)$', t, re.S)
    if ma: aton=ma.group(1)
    if not oath and 'Defiance Penalty' not in t:  # sub-entry w/o labels
        oath=t
    tag=srctag(head)
    orows.append({"name":basename(head),"oath_points":pts(head),"oath":cell(oath),
        "defiance_penalty":cell(defi),"atonement":cell(aton),
        "source":SRC+(f" [{tag}]" if tag else ""),"url":URL})
# BOONS
BCOLS=["name","oath_point_cost","type","description","source","url"]
brows=[]
for head,blk in blocks(boon_html):
    if not head: continue
    ty=re.search(r'\((Su|Ex|Sp)\)', head)
    brows.append({"name":basename(head),"oath_point_cost":pts(head),
        "type":ty.group(1) if ty else '',"description":cell(blk),
        "source":SRC+((" ["+srctag(head)+"]") if srctag(head) else ""),"url":URL})
for fn,cols,rows in [("oaths.tsv",OCOLS,orows),("oath_boons.tsv",BCOLS,brows)]:
    with open(os.path.join(OUTDIR,fn),"w",encoding="utf-8",newline="") as f:
        f.write("\t".join(cols)+"\n")
        for r in rows: f.write("\t".join(r.get(c,"") for c in cols)+"\n")
print(f"oaths={len(orows)} boons={len(brows)}")
