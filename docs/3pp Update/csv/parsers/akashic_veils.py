import re, os, glob, html as _html
ROOT="/sessions/brave-blissful-turing/mnt/3pp Update"
VDIR=os.path.join(ROOT,"3pp System Rules","Akashic","Veil Lists")
OUTDIR=os.path.join(ROOT,"csv"); os.makedirs(OUTDIR,exist_ok=True)
def clean(s):
    if not s: return ''
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?is)<li[^>]*>','• ',s); s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s)
    s=re.sub(r'[ \t]+',' ',s); s='\n'.join(ln.strip() for ln in s.split('\n'))
    return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def linklist(s):
    links=re.findall(r'<a[^>]*>(.*?)</a>', s, re.S)
    vals=[clean(x) for x in links if clean(x)]
    if vals: return ", ".join(dict.fromkeys(vals))
    return cell(s)
def srcval(s):
    s=cell(s); s=re.sub(r'^•\s*','',s); s=re.sub(r'\s*<br>\s*•?\s*','; ',s); return s.strip('; ').strip()
def canon(h):
    m=re.search(r'<link rel="canonical" href="([^"]+)"', h); return m.group(1) if m else ''
VHEAD=["Name","Slot","Descriptors","Effect","Bind effect","Source"]
veils={}; juncs=set(); total_rows=0
for p in sorted(glob.glob(os.path.join(VDIR,"*.html"))):
    base=os.path.basename(p).replace('.html','')
    if base.startswith('_') or 'overview' in base.lower(): continue
    cls=base.replace(' Veil List','').strip()
    h=open(p,encoding='utf-8',errors='replace').read(); url=canon(h)
    j=h.find('</aside>'); body=h[j+8:] if j>0 else h
    kf=body.find('id="catlinks"'); body=body[:kf] if kf>0 else body
    for tm in re.finditer(r'<table[^>]*wikitable[^>]*>(.*?)</table>', body, re.S):
        t=tm.group(1)
        hdr=[clean(x) for x in re.findall(r'<th[^>]*>(.*?)</th>', t, re.S)]
        if hdr[:6]!=VHEAD: continue
        for r in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S):
            if '<th' in r: continue
            c=re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
            if len(c)<6: continue
            name=clean(c[0])
            if not name: continue
            total_rows+=1
            is_retold = bool(re.search(r'retold', name, re.I))
            row={"name":name,"slot":linklist(c[1]),"descriptors":linklist(c[2]),
                 "effect":cell(c[3]),"bind_effect":cell(c[4]),
                 "is_retold":"yes" if is_retold else "","source":srcval(c[5]),"url":url}
            juncs.add((name, cls))
            prev=veils.get(name); rich=len(row["effect"])+len(row["bind_effect"])
            if prev is None or rich>(len(prev["effect"])+len(prev["bind_effect"])): veils[name]=row
VCOLS=["name","slot","descriptors","effect","bind_effect","is_retold","source","url"]
with open(os.path.join(OUTDIR,"akashic_veils.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(VCOLS)+"\n")
    for n in sorted(veils): f.write("\t".join(veils[n].get(c,"") for c in VCOLS)+"\n")
with open(os.path.join(OUTDIR,"veil_class_lists.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("veil\tveil_list\n")
    for n,cl in sorted(juncs): f.write(f"{n}\t{cl}\n")
print(f"total_data_rows={total_rows} unique_veils={len(veils)} junctions={len(juncs)}")
