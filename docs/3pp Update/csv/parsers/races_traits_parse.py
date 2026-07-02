import re, os, glob, html as _html
# threepp_races.tsv (Miraheze Akashic race pages) + threepp_racial_traits.tsv (Spheres
# wikidot Alternate Racial Traits) + threepp_traits.tsv (Spheres wikidot Traits pages).
# Stdlib-only, idempotent; run with: python -X utf8 races_traits_parse.py
ROOT=os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))
OUTDIR=os.path.join(ROOT,"csv")
RACES_DIR=os.path.join(ROOT,"3pp Races","Akashic")
SPH_RACES=os.path.join(ROOT,"3pp Races","Spheres","Alternate Racial Traits - Spheres of Power Wiki.html")
TRAITS_DIR=os.path.join(ROOT,"3pp Traits","Spheres")
SRC_SPH="Spheres of Power/Might (Drop Dead Studios)"
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
def wikidot_url(h,fb=''):
    m=re.search(r'href="(https?://spheresofpower\.wikidot\.com/[^"#]+)#toc', h); return m.group(1) if m else fb
def ultimate_tab(body):
    t0=body.find('wiki-tab-0-0'); t1=body.find('wiki-tab-0-1')
    if t0>=0 and t1>t0: return body[t0:t1]
    return body
def strip_tag(name):
    m=re.search(r'\s*\[([^\]\[]+)\]\s*$', name)
    if m: return name[:m.start()].strip(), m.group(1).strip()
    return name.strip(), ''

# ---------- (1) threepp_races.tsv — Miraheze Akashic races (portable infobox) ----------
ABIL={"statstr":"Strength","statdex":"Dexterity","statcon":"Constitution",
      "statint":"Intelligence","statwis":"Wisdom","statcha":"Charisma"}
RCOLS=["name","system","ability_modifiers","size","speed","racial_traits","description","source","url"]
def vert(aside):
    d={}
    for m in re.finditer(r'data-source="([^"]+)">\s*<h3 class="pi-data-label[^"]*">.*?</h3>\s*<div class="pi-data-value[^"]*">(.*?)</div>', aside, re.S):
        d[m.group(1)]=m.group(2)
    return d
races=[]
for p in sorted(glob.glob(os.path.join(RACES_DIR,"*.html"))):
    h=open(p,encoding='utf-8',errors='replace').read()
    i=h.find('<aside'); j=h.find('</aside>')
    aside=h[i:j+8] if 0<=i<j else ''
    v=vert(aside)
    m=re.search(r'data-source="name"[^>]*>(.*?)</h2>', aside, re.S)
    name=clean(m.group(1)) if m else os.path.basename(p)[:-5]
    mods=[]
    for tm in re.finditer(r'<td[^>]*data-source="(stat\w+)"[^>]*>(.*?)</td>', aside, re.S):
        key,val=tm.group(1),clean(tm.group(2))
        if key not in ABIL or not val: continue
        if re.match(r'^[+\-–−]', val): mods.append(f"{val} {ABIL[key]}")
        elif val.lower()=='none': mods.append(f"no {ABIL[key]} score")
        else: mods.append(f"{ABIL[key]} {val}")
    if clean(v.get("statspecial","")): mods.append(clean(v.get("statspecial","")))
    speed="; ".join(x for x in (clean(v.get("move","")),clean(v.get("movespecial",""))) if x)
    sb=re.search(r'data-source="sourcebook"[^>]*>(.*?)</td>', aside, re.S)
    body=h[j+8:] if j>0 else h
    body=re.split(r'id="catlinks"|<div class="printfooter"|NewPP limit', body)[0]
    # description = intro paragraphs before the "<Race> Racial Traits" h2 (TOC has no <p>)
    rt=re.search(r'<h2 id="[^"]*Racial_Traits[^"]*">.*?</h2>\s*(?:</div>)?', body, re.S)
    intro=body[:rt.start()] if rt else body
    desc=cell("<br><br>".join(pp for pp in (clean(mm.group(1)) for mm in re.finditer(r'<p[^>]*>(.*?)</p>', intro, re.S)) if pp))
    # racial_traits = the full Racial Traits h2 section (base list + nested subsections)
    traits=''
    if rt:
        rest=body[rt.end():]
        nxt=re.search(r'<div class="mw-heading mw-heading2">|<h2[ >]', rest)
        traits=cell(rest[:nxt.start()] if nxt else rest)
    races.append({"name":name,"system":"akashic","ability_modifiers":cell(", ".join(mods)),
        "size":cell(v.get("size1","")),"speed":cell(speed),"racial_traits":traits,
        "description":desc,"source":cell(sb.group(1)) if sb else '',
        "url":canon(h,"https://metzo.miraheze.org/wiki/"+name.replace(' ','_'))})
with open(os.path.join(OUTDIR,"threepp_races.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(RCOLS)+"\n")
    for r in races: f.write("\t".join(scrub(r.get(c,"")) for c in RCOLS)+"\n")

# ---------- (2) threepp_racial_traits.tsv — Spheres wikidot Alternate Racial Traits ----------
ATCOLS=["name","race","system","replaces","description","source","url"]
def find_replaces(txt):
    out=[]
    for m in re.finditer(r'(?:This|These|It)\s+(?:alternate\s+)?(?:racial\s+)?(?:traits?\s+)?(?:replaces?|modif(?:ies|y)|alters?)\s+(?:the\s+)?([^.]+)', txt):
        v=m.group(1)
        for cut in (', but ',' but ',' and counts ','; ',' for the purpose'):
            k=v.find(cut)
            if k>0: v=v[:k]
        v=re.sub(r'\s*\[[^\]\[]*\]\s*$','',v).strip()
        v=re.sub(r'\s+(?:alternate\s+)?racial\s+traits?$','',v).strip()
        v=re.sub(r'\s+traits?$','',v).strip().strip(',;')
        if v and v not in out: out.append(v)
    return "; ".join(out)
alt_rows=[]; alt_skipped=[]
def parse_alt_racial():
    h=open(SPH_RACES,encoding='utf-8',errors='replace').read()
    tab=ultimate_tab(content(h))
    url=wikidot_url(h,"http://spheresofpower.wikidot.com/alternate-racial-traits")
    race='Any'; cur=None; her=None
    def close_cur():
        nonlocal cur
        if cur:
            cur["description"]=cell(cur["_d"]); cur["replaces"]=cell(find_replaces(clean(cur["_d"])))
            alt_rows.append(cur); cur=None
    def close_her():
        nonlocal her
        if her:
            her["description"]=cell("<br><br>".join(x for x in her["_d"] if x))
            her["replaces"]=cell(find_replaces(clean(" ".join(her["_d"]))))
            alt_rows.append(her); her=None
    for bm in re.finditer(r'<(h2|h3|h4|p|ul|ol)[^>]*>(.*?)</\1>', tab, re.S):
        tag,inner=bm.group(1),bm.group(2)
        if tag in ('h2','h3'):
            close_cur(); close_her()
            t=clean(inner); race='Any' if t.lower()=='any race' else t
        elif tag=='h4':
            close_cur(); close_her()
            nm,tg=strip_tag(clean(inner))
            hr=race
            pm=re.search(r'\s*\(([^()]+)\)\s*$', nm)
            if pm: hr=pm.group(1).strip(); nm=nm[:pm.start()].strip()
            her={"name":nm,"race":hr,"system":"spheres","_d":[],
                 "source":SRC_SPH+(f" [{tg}]" if tg else ''),"url":url}
        elif tag in ('ul','ol'):
            t=clean(inner)
            if her: her["_d"].append(t)
            elif cur: cur["_d"]+="\n"+t
        else: # p
            if her:
                t=clean(inner)
                if t: her["_d"].append(t)
                continue
            sm=re.match(r'\s*<strong>(.*?)</strong>\s*:?\s*(.*)$', inner, re.S)
            if sm:
                close_cur()
                nm,tg=strip_tag(clean(sm.group(1)).rstrip(':').strip())
                if nm.lower() in ('note','special'): nm=f"{nm} ({race})"
                cur={"name":nm,"race":race,"system":"spheres","_d":clean(sm.group(2)),
                     "source":SRC_SPH+(f" [{tg}]" if tg else ''),"url":url}
            else:
                t=clean(inner)
                if not t: continue
                if cur: cur["_d"]+="\n"+t
                else: alt_skipped.append(f"[{race}] {t[:70]}")
    close_cur(); close_her()
parse_alt_racial()
with open(os.path.join(OUTDIR,"threepp_racial_traits.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(ATCOLS)+"\n")
    for r in alt_rows: f.write("\t".join(scrub(r.get(c,"")) for c in ATCOLS)+"\n")

# ---------- (3) threepp_traits.tsv — Spheres wikidot Traits + Practitioner Traits ----------
TCOLS=["name","type","system","description","source","url"]
trait_rows=[]
def clean_trait_name(nm, cat):
    nm,tg=strip_tag(nm)
    pm=re.search(r'\s*\(([^()]+)\)\s*$', nm)
    if pm and cat and pm.group(1).strip().lower()==cat.strip().lower():
        nm=nm[:pm.start()].strip()
    return nm,tg
def parse_trait_page(path, ttype_fn, fb_url):
    h=open(path,encoding='utf-8',errors='replace').read()
    tab=ultimate_tab(content(h))
    url=wikidot_url(h,fb_url)
    cat=''; cat_tag=''; cur=None
    def close_cur():
        nonlocal cur
        if cur:
            cur["description"]=cell("<br><br>".join(x for x in cur["_d"] if x))
            trait_rows.append(cur); cur=None
    for bm in re.finditer(r'<(h1|h2|h4|h5|p|ul|ol)[^>]*>(.*?)</\1>', tab, re.S):
        tag,inner=bm.group(1),bm.group(2)
        if tag in ('h1','h2'):
            close_cur(); cat,cat_tag=strip_tag(clean(inner))
        elif tag=='h4':
            close_cur()
            nm,tg=clean_trait_name(clean(inner),re.sub(r'\s+Traits$','',cat))
            tg=tg or cat_tag
            cur={"name":nm,"type":ttype_fn(cat,nm),"system":"spheres","_d":[],
                 "source":SRC_SPH+(f" [{tg}]" if tg else ''),"url":url}
        elif tag=='h5':
            if cur: cur["_d"].append(clean(inner)+":")
        else: # p / ul / ol
            t=clean(inner)
            if t and cur: cur["_d"].append(t)
    close_cur()
def prac_type(cat,nm):
    c=re.sub(r'\s+Traits$','',cat).strip()
    return f"Practitioner ({c})" if c else "Practitioner"
def gen_type(cat,nm):
    if not cat: return "Optional Rule" if nm.lower().startswith('optional rule') else "General"
    return cat
parse_trait_page(os.path.join(TRAITS_DIR,"Practitioner Traits - Spheres of Power Wiki.html"),
                 prac_type,"http://spheresofpower.wikidot.com/practitioner-traits")
parse_trait_page(os.path.join(TRAITS_DIR,"Traits - Spheres of Power Wiki.html"),
                 gen_type,"http://spheresofpower.wikidot.com/traits")
with open(os.path.join(OUTDIR,"threepp_traits.tsv"),"w",encoding="utf-8",newline="") as f:
    f.write("\t".join(TCOLS)+"\n")
    for r in trait_rows: f.write("\t".join(scrub(r.get(c,"")) for c in TCOLS)+"\n")

for w in alt_skipped: print("skipped-preamble:", w)
print(f"threepp_races={len(races)} threepp_racial_traits={len(alt_rows)} threepp_traits={len(trait_rows)}")
