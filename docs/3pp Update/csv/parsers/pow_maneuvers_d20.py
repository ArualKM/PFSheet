import re, os, glob, html as _html, collections
ROOT=r"C:\Users\bitte\Documents\Projects\PFSheet\docs\3pp Update\3pp System Rules\Path Of War\Disciplines\Maneuvers"
OUT=r"C:\Users\bitte\Documents\Projects\PFSheet\docs\3pp Update\csv\pow_maneuvers.tsv"
def clean(s):
    if not s: return ''
    s=s.replace('\r',' '); s=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',' ',s)
    s=re.sub(r'(?is)<br\s*/?>','\n',s); s=re.sub(r'(?is)</(p|li|dt|dd|tr|div|h[1-6])>','\n',s)
    s=re.sub(r'(?s)<[^>]+>','',s); s=_html.unescape(s)
    s=re.sub(r'[ \t]+',' ',s); s='\n'.join(x.strip() for x in s.split('\n'))
    return re.sub(r'\n{3,}','\n\n',s).strip()
def cell(s):
    s=clean(s).replace('\t',' ').replace('\n','<br>'); return re.sub(r'(?:<br>){3,}','<br><br>',s).strip()
def scrub(s): return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',' ',str(s)).replace('\t',' ').replace('\r',' ').replace('\n','<br>')
def content(h):
    m=re.search(r'<div[^>]*class="[^"]*(?:page-content|entry-content|article-content)[^"]*"[^>]*>(.*)',h,re.S)
    return m.group(1) if m else h
def canon(h):
    m=re.search(r'<link rel="canonical" href="([^"]+)"',h); return m.group(1) if m else ''
FOOT=r'<hr|Section\s*15|OPEN GAME LICENSE|<div class="comments|printfooter|class="entry-tags|Latest Pathfinder|<p><b>Source'
KEYMAP={'Discipline':'discipline_raw','Level':'level','Prerequisite':'prerequisite','Prerequisites':'prerequisite',
 'Prerequisite(s)':'prerequisite','Initiation Action':'initiation_action','Action':'initiation_action',
 'Range':'range','Target':'target','Targets':'target','Area':'target','Effect':'target','Duration':'duration','Saving Throw':'saving_throw'}
def parse_fields(body):
    f={}; stat_end=0
    for km in re.finditer(r'<b>\s*([A-Za-z()/ ]+?)\s*</b>\s*:?\s*(.*?)(?=<b>|<br\s*/?>|</p>|DESCRIPTION|$)',body,re.S):
        k=clean(km.group(1)); v=clean(km.group(2)).strip('; ')
        if k in KEYMAP:
            stat_end=km.end(); f.setdefault(KEYMAP[k], v)
    return f, stat_end
def summary_types(dp):
    lp=os.path.join(dp,'__list.html')
    if not os.path.exists(lp): return {}
    b=content(open(lp,encoding='utf-8',errors='replace').read()); mp={}
    for tbl in re.findall(r'<table[^>]*>(.*?)</table>',b,re.S):
        heads=[clean(x) for x in re.findall(r'<th[^>]*>(.*?)</th>',tbl,re.S)]
        if 'Type' not in heads or 'Maneuver' not in heads: continue
        ti=heads.index('Type'); ni=heads.index('Maneuver')
        for r in re.findall(r'<tr[^>]*>(.*?)</tr>',tbl,re.S):
            cs=re.findall(r'<td[^>]*>(.*?)</td>',r,re.S)
            if len(cs)>max(ti,ni):
                nm=clean(cs[ni]); ty=clean(cs[ti])
                if nm and nm not in mp: mp[nm]=ty
    return mp
def book_for(dp):
    lp=os.path.join(dp,'__list.html')
    if not os.path.exists(lp): return 'Path of War (Dreamscarred Press)'
    t=clean(open(lp,encoding='utf-8',errors='replace').read())
    exp=bool(re.search(r'Path of War[:\s]*Expanded',t,re.I)); core=bool(re.search(r'Path of War(?![:\s]*Expanded)',t,re.I))
    if exp and core: return 'Path of War / Path of War: Expanded (Dreamscarred Press)'
    return 'Path of War: Expanded (Dreamscarred Press)' if exp else 'Path of War (Dreamscarred Press)'
COLS=["name","discipline","level","category","type","descriptor","initiation_action","range","target","duration","saving_throw","prerequisite","description","source","url"]
rows=[]
for d in sorted(os.listdir(ROOT)):
    dp=os.path.join(ROOT,d)
    if not os.path.isdir(dp): continue
    src=book_for(dp); smap=summary_types(dp)
    for p in sorted(glob.glob(os.path.join(dp,'*.html'))):
        if os.path.basename(p)=='__list.html': continue
        h=open(p,encoding='utf-8',errors='replace').read()
        body=re.split(FOOT,content(h))[0]
        nm=re.search(r'<h1[^>]*>(.*?)</h1>',body,re.S) or re.search(r'<title>(.*?)</title>',h,re.S)
        name=re.sub(r'\s*[-–]\s*d20PFSRD.*$','',clean(nm.group(1)) if nm else os.path.basename(p)[:-5]).strip()
        f,stat_end=parse_fields(body)
        paren=re.search(r'\(([^)]+)\)',f.get('discipline_raw','')); ptype=paren.group(1).strip() if paren else ''
        raw_type=smap.get(name) or ptype
        bm=re.match(r'^([A-Za-z]+)',raw_type); typ=bm.group(1) if bm else raw_type
        descriptor=raw_type[len(typ):].strip() if bm else ''
        dm=re.search(r'(?is)DESCRIPTION\s*(?:</p>)?',body)
        desc=cell(body[dm.end():]) if (dm and dm.start()>=stat_end-10) else cell(body[stat_end:])
        rows.append({"name":name,"discipline":d,"level":f.get('level',''),
            "category":'Stance' if 'stance' in typ.lower() else 'Maneuver',"type":typ,"descriptor":descriptor,
            "initiation_action":f.get('initiation_action',''),"range":f.get('range',''),
            "target":f.get('target',''),"duration":f.get('duration',''),"saving_throw":f.get('saving_throw',''),
            "prerequisite":f.get('prerequisite',''),"description":desc,"source":src,"url":canon(h)})
with open(OUT,'w',encoding='utf-8',newline='') as fo:
    fo.write('\t'.join(COLS)+'\n')
    for r in rows: fo.write('\t'.join(scrub(r.get(c,'')) for c in COLS)+'\n')
print("maneuvers:",len(rows),"| disciplines:",len(set(r['discipline'] for r in rows)))
print("category:",dict(collections.Counter(r['category'] for r in rows)))
print("type:",collections.Counter(r['type'] for r in rows).most_common(6))
print("filled -> desc:",sum(1 for r in rows if r['description'].strip()),"type:",sum(1 for r in rows if r['type'].strip()),"range:",sum(1 for r in rows if r['range'].strip()))
