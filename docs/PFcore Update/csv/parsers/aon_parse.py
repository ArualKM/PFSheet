# -*- coding: utf-8 -*-
"""AoN (Archives of Nethys) PF1e HTML -> TSV parser for PFSheet/PathForge.
Tab-delimited. Internal newlines -> <br>. Exact rules text. Each row carries source + url.
Run:  python aon_parse.py [ROOT]      ROOT defaults to the PFcore Update folder.
Env:  LIMIT=N  -> parse only N files per table and print samples (validation mode)."""
import os, re, sys, json, glob, html as _html

ROOT = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\bitte\Desktop\PFcore Update'
OUT = os.path.join(ROOT, 'csv')
LIMIT = int(os.environ.get('LIMIT', '0'))
AON = 'https://aonprd.com/'

def read(p):
    with open(p, encoding='utf-8', errors='replace') as f: return f.read()

def clean(s):
    if not s: return ''
    s = re.sub(r'(?is)<br\s*/?>', '\n', s)
    s = re.sub(r'(?is)</(p|div|li|tr|h[1-6])>', '\n', s)
    s = re.sub(r'(?is)<li[^>]*>', '\n- ', s)
    s = re.sub(r'(?is)<[^>]+>', '', s)
    s = _html.unescape(s)
    s = s.replace('\r', ' ').replace('\t', ' ')
    s = re.sub(r'[  ]+', ' ', s)
    s = '\n'.join(ln.strip() for ln in s.split('\n'))
    s = re.sub(r'\n{2,}', '\n', s).strip()
    return s.replace('\n', '<br>')

def content(h):
    i = h.find('<h1 class="title"')
    if i < 0: i = 0
    j = h.find('<div class="footer"', i)
    return h[i:j] if j > 0 else h[i:]

def h1(frag):
    m = re.search(r'(?is)<h1 class="title">(.*?)</h1>', frag)
    return clean(m.group(1)) if m else ''

def source_of(frag):
    m = re.search(r'(?is)<b>\s*Source\s*</b>\s*<a[^>]*>\s*<i>(.*?)</i>', frag)
    if m: return clean(m.group(1))
    m = re.search(r'(?is)<b>\s*Source\s*</b>\s*(.*?)(?=<br|<b|<h|$)', frag)
    return clean(m.group(1)) if m else ''

def field(frag, label):
    m = re.search(r'(?is)<b>\s*' + label + r'\s*</b>\s*:?\s*(.*?)(?=<b>|<h2|<h3|$)', frag)
    return clean(m.group(1)) if m else ''

def field_line(frag, label):
    m = re.search(r'(?is)<b>\s*' + label + r'\s*</b>\s*:?\s*(.*?)(?=<br|<b|<h2|<h3|$)', frag)
    return clean(m.group(1)) if m else ''


def url_item(kind, name):
    return AON + kind + '.aspx?ItemName=' + name.replace(' ', '%20')

def files_top(rel):
    b = os.path.join(ROOT, rel)
    if not os.path.isdir(b): return []
    return sorted(os.path.join(b, f) for f in os.listdir(b) if f.endswith('.html') and not f.startswith('_'))

def files_rec(rel):
    b = os.path.join(ROOT, rel); out = []
    for dp, dn, fn in os.walk(b):
        for f in fn:
            if f.endswith('.html') and not f.startswith('_'): out.append(os.path.join(dp, f))
    return sorted(out)

def write_tsv(name, header, rows):
    if LIMIT:
        print('\n== %s (%d rows) ==' % (name, len(rows)))
        print('\t'.join(header))
        for r in rows[:2]:
            print('\t'.join((c or '')[:90] for c in r))
        return
    os.makedirs(OUT, exist_ok=True)
    def cell(c):
        c = '' if c is None else str(c)
        return c.replace('\t', ' ').replace('\r', ' ').replace('\n', '<br>')
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='') as f:
        f.write('\t'.join(header) + '\n')
        for r in rows:
            f.write('\t'.join(cell(c) for c in r) + '\n')
    print('wrote %s : %d rows' % (name, len(rows)))

def cap(lst):
    return lst[:LIMIT] if LIMIT else lst

def desc_tail(frag, after_labels):
    f = frag
    pos = -1
    for lab in after_labels:
        for m in re.finditer(r'(?is)<b>\s*' + lab + r'\s*</b>[^<]*', f):
            pos = max(pos, m.end())
    if pos > 0: return clean(f[pos:])
    m = re.search(r'(?is)<b>\s*Source\s*</b>.*?<br\s*/?>', f)
    return clean(f[m.end():]) if m else clean(f)

def section(frag, label):
    m = re.search(r'(?is)<h3 class="framing">\s*' + label + r'\s*</h3>(.*?)(?=<h3|<h2|$)', frag)
    return clean(m.group(1)) if m else ''

def mythic_section(frag):
    m = re.search(r'(?is)<h2[^>]*>\s*Mythic[^<]*</h2>(.*?)(?=<h2|$)', frag)
    return clean(m.group(1)) if m else ''

def class_flavor(frag):
    m = re.search(r'(?is)</i>\s*</a>\s*<br\s*/?>(.*?)(?=<b>\s*Role|<b>\s*Alignment|<b>\s*Hit Die|$)', frag)
    return clean(m.group(1)) if m else ''

def class_skills(frag):
    m = re.search(r'(?is)class skills are\s*(.*?)(?=Skill Points|Skill Ranks|<h|$)', frag)
    return clean(m.group(1)) if m else ''

def parse_table(frag):
    m = re.search(r'(?is)<table[^>]*>(.*?)</table>', frag)
    if not m: return ''
    grid = []
    for r in re.findall(r'(?is)<tr[^>]*>(.*?)</tr>', m.group(1)):
        cells = [clean(c) for c in re.findall(r'(?is)<t[dh][^>]*>(.*?)</t[dh]>', r)]
        if any(cells): grid.append(cells)
    return json.dumps(grid, ensure_ascii=False) if grid else ''

def parse_features(frag):
    out = []
    for m in re.finditer(r'(?is)<b>\s*([A-Z][^<:]{2,60}?)\s*\((Ex|Su|Sp)\)\s*</b>\s*:?\s*(.*?)(?=<b>[A-Z]|<h2|<h3|$)', frag):
        out.append((m.group(1).strip(), m.group(2), clean(m.group(3))))
    return out

def parse_feats():
    seen = {}; rows = []
    for p in cap(files_rec('Feats')):
        frag = content(read(p)); name = h1(frag)
        if not name or name.lower() in seen: continue
        seen[name.lower()] = 1
        m = re.search(r'(?is)<h2 class="title">', frag)
        base = frag[:m.start()] if m else frag; rest = frag[m.start():] if m else ''
        nm, types = name, ''
        mt = re.match(r'^(.*?)\s*\(([^()]*)\)\s*$', name)
        if mt: nm, types = mt.group(1).strip(), mt.group(2).strip()
        fl = ''
        mf = re.search(r'(?is)</a>\s*<br\s*/?>(.*?)(?=<b>|$)', base)
        if mf: fl = clean(mf.group(1))
        myth = ''
        mm = re.search(r'(?is)<h2 class="title">\s*Mythic[^<]*</h2>(.*?)(?=<h2|$)', rest)
        if mm: myth = clean(re.sub(r'(?is)<b>\s*Source\s*</b>.*?<br\s*/?>', '', mm.group(1), count=1))
        rows.append([nm, types, source_of(base), fl, field(base,'Prerequisites') or field(base,'Prerequisite'),
                     field(base,'Benefit'), field(base,'Normal'), field(base,'Special'), myth, url_item('FeatDisplay', nm)])
    return rows

def parse_traits():
    rows = []; base = os.path.join(ROOT, 'Traits')
    if os.path.isdir(base):
        for typ in sorted(os.listdir(base)):
            td = os.path.join(base, typ)
            if not os.path.isdir(td) or typ.lower() == 'drawbacks': continue
            for p in cap(sorted(f for f in glob.glob(os.path.join(td, '*.html')) if not os.path.basename(f).startswith('_'))):
                frag = content(read(p)); name = h1(frag)
                if not name: continue
                rows.append([name, typ, field_line(frag,'Category'), source_of(frag),
                             field_line(frag,'Requirement\\(s\\)') or field_line(frag,'Requirements'),
                             desc_tail(frag, ['Requirement\\(s\\)','Requirements','Category']), url_item('TraitDisplay', name)])
    return rows

def parse_drawbacks():
    rows = []
    for p in cap(sorted(f for f in glob.glob(os.path.join(ROOT,'Traits','Drawbacks','*.html')) if not os.path.basename(f).startswith('_'))):
        frag = content(read(p)); name = h1(frag)
        if not name: continue
        rows.append([name, source_of(frag), field_line(frag,'Requirement\\(s\\)') or field_line(frag,'Requirements'),
                     desc_tail(frag, ['Requirement\\(s\\)','Requirements','Category']), url_item('TraitDisplay', name)])
    return rows

def parse_mythic_spells():
    rows = []
    for p in cap(files_top('Mythic/Mythic Spells')):
        frag = content(read(p)); name = h1(frag)
        if not name: continue
        rows.append([name, field(frag,'School'), field(frag,'Level'), field(frag,'Casting Time'), field(frag,'Components'),
                     field(frag,'Range'), field(frag,'Target') or field(frag,'Targets'), field(frag,'Area'), field(frag,'Effect'),
                     field(frag,'Duration'), field(frag,'Saving Throw'), field(frag,'Spell Resistance'),
                     section(frag,'Description'), mythic_section(frag), source_of(frag), url_item('SpellDisplay', name)])
    return rows

def parse_classes():
    cr = []; cp = []; cf = []
    for cat, rel in [('Main','Classes/Main Classes'), ('NPC','Classes/NPC Classes')]:
        for p in cap(files_top(rel)):
            frag = content(read(p)); name = h1(frag)
            if not name: continue
            cr.append([name, cat, source_of(frag), field(frag,'Hit Die'), field(frag,'Alignment'), field(frag,'Role'),
                       field(frag,'Starting Wealth'), class_skills(frag), field(frag,'Skill Points at each Level') or field(frag,'Skill Ranks per Level'),
                       field(frag,'Weapon and Armor Proficiency'), class_flavor(frag), url_item('ClassDisplay', name)])
            tj = parse_table(frag)
            if tj: cp.append([name, tj])
            for fn, ft, fd in parse_features(frag): cf.append([name, fn, ft, fd])
    return cr, cp, cf

def parse_prestige():
    rows = []; prog = []
    for p in cap(files_top('Classes/Prestige Classes')):
        frag = content(read(p)); name = h1(frag)
        if not name: continue
        rows.append([name, source_of(frag), field(frag,'Hit Die'), field(frag,'Alignment'), field(frag,'Role'),
                     field_line(frag,'Requirements') or field_line(frag,'Requirement'), class_flavor(frag), url_item('PrestigeClassesDisplay', name)])
        tj = parse_table(frag)
        if tj: prog.append([name, tj])
    return rows, prog

def parse_races():
    rows = []
    for cat, rel in [('Core','Races/Core Races'), ('Other','Races/Other Races')]:
        for p in cap(files_top(rel)):
            frag = content(read(p)); name = h1(frag)
            if not name: continue
            rows.append([name, cat, source_of(frag), clean(re.sub(r'(?is)^.*?</h1>', '', frag, count=1)), url_item('RacesDisplay', name)])
    return rows

def parse_archetypes():
    cand = [x for x in files_rec('Classes/Main Classes') if os.sep+'Archetypes'+os.sep in x]
    cand += [x for x in files_rec('Cohorts and Companions') if os.sep+'Archetypes'+os.sep in x]
    cand += [x for x in files_rec('Classes/NPC Classes') if os.sep+'Archetypes'+os.sep in x]
    rows = []
    for p in cap(sorted(cand)):
        frag = content(read(p)); name = h1(frag)
        if not name: continue
        parts = p.split(os.sep); cls = parts[parts.index('Archetypes')-1] if 'Archetypes' in parts else ''
        rows.append([name, cls, source_of(frag), clean(re.sub(r'(?is)^.*?</h1>', '', frag, count=1)),
                     AON + 'ArchetypeDisplay.aspx?FixedName=' + name.replace(' ', '%20')])
    return rows

def main():
    print('ROOT =', ROOT, '| LIMIT =', LIMIT)
    write_tsv('feats.tsv', ['name','types','source','description','prerequisites','benefit','normal','special','mythic','url'], parse_feats())
    write_tsv('traits.tsv', ['name','type','category','source','requirements','description','url'], parse_traits())
    write_tsv('drawbacks.tsv', ['name','source','requirements','description','url'], parse_drawbacks())
    write_tsv('mythic_spells.tsv', ['name','school','level','casting_time','components','range','target','area','effect','duration','saving_throw','spell_resistance','description','mythic','source','url'], parse_mythic_spells())
    cr, cp, cf = parse_classes()
    write_tsv('classes.tsv', ['name','category','source','hit_die','alignment','role','starting_wealth','class_skills','skill_points_per_level','proficiencies','description','url'], cr)
    write_tsv('class_progression.tsv', ['class','json_data'], cp)
    write_tsv('class_features.tsv', ['class','feature','type','description'], cf)
    pr, pp = parse_prestige()
    write_tsv('prestige_classes.tsv', ['name','source','hit_die','alignment','role','requirements','description','url'], pr)
    write_tsv('prestige_progression.tsv', ['class','json_data'], pp)
    write_tsv('races.tsv', ['name','category','source','details','url'], parse_races())
    write_tsv('archetypes.tsv', ['name','class','source','description','url'], parse_archetypes())

if __name__ == '__main__':
    main()
