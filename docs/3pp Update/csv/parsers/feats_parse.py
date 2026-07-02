import re, os, glob, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
FDIR=os.path.join(ROOT,"3pp Feats"); OUTDIR=os.path.join(ROOT,"csv")
def clean(s):
    if not s: return ''
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?is)<li[^>]*>','• ',s); s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s)
    s=re.sub(r'[ \t]+',' ',s); s='\n'.join(ln.strip() for ln in s.split('\n'))
    return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def canon(h,name):
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h)
    return m.group(1) if m else "https://metzo.miraheze.org/wiki/"+name.replace(' ','_')
TYPES=['Combat','Metamagic','Item Creation','Teamwork','Critical','Grit','Style','Panache','Mythic','General']
def feat_type(cats):
    for T in TYPES:
        if any(c.lower()==T.lower()+' feats' or c.lower()==T.lower()+' feat' for c in cats): return T
    return 'General'
def system_of(cats, source):
    blob=' '.join(cats)+' '+source
    b=blob.lower()
    if 'akash' in b: return 'akashic'
    if 'psionic' in b: return 'psionic'
    if 'path of war' in b or 'maneuver' in b or 'martial discipline' in b: return 'path_of_war'
    if 'rune magic' in b: return 'rune_magic'
    if 'metascript' in b: return 'metascript'
    if 'sphere' in b: return 'spheres'
    return 'other'
COLS=["name","type","system","prerequisites","benefit","normal","special","source","url"]
feats={}
for folder in ("Metzofitz","Akashic"):
    for p in sorted(glob.glob(os.path.join(FDIR,folder,"*.html"))):
        h=open(p,encoding='utf-8',errors='replace').read()
        m=re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
        name=clean(m.group(1)) if m else os.path.basename(p).replace('.html','')
        name=re.sub(r'\s*-\s*Library of Metzofitz.*$','',name).strip()
        if not name: continue
        cats=[_html.unescape(c).replace('_',' ') for c in re.findall(r'title="Category:([^"]+)"', h)]
        source=''
        for c in cats:
            if c.startswith('Source:'): source=c.replace('Source:','').strip(); break
        hi=h.find('</h1>'); body=h[hi:]
        body=re.split(r'id="catlinks"|<div class="printfooter"', body)[0]
        fields={'prerequisites':'','benefit':'','normal':'','special':''}
        for pm in re.finditer(r'<p[^>]*>(.*?)</p>', body, re.S):
            seg=pm.group(1)
            lm=re.match(r'\s*<b>\s*(Prerequisite\(s\)|Prerequisites|Prerequisite|Benefits|Benefit|Normal|Special)\s*:?\s*</b>\s*:?\s*(.*)$', seg, re.S)
            if not lm: continue
            lab=lm.group(1).lower(); val=lm.group(2)
            if 'prereq' in lab: fields['prerequisites']=cell(val)
            elif 'benefit' in lab: fields['benefit']=cell(val)
            elif lab=='normal': fields['normal']=cell(val)
            elif lab=='special': fields['special']=cell(val)
        row={"name":name,"type":feat_type(cats),"system":system_of(cats,source),
            "prerequisites":fields['prerequisites'],"benefit":fields['benefit'],
            "normal":fields['normal'],"special":fields['special'],"source":source,"url":canon(h,name)}
        prev=feats.get(name)
        if prev is None or len(row['benefit'])>len(prev['benefit']): feats[name]=row
with open(os.path.join(OUTDIR,"metzofitz_feats.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(COLS)+"\n")
    for n in sorted(feats): f.write("\t".join(feats[n].get(c,"") for c in COLS)+"\n")
print(f"feats={len(feats)}")
