"""Read visible word positions before interpreting resume sections."""
import re
from collections import Counter

def rows(words):
    result=[]
    for word in sorted(words,key=lambda w:(round(w['top']/3),w['x0'])):
        if not result or abs(word['top']-result[-1][0]['top'])>3:result.append([])
        result[-1].append(word)
    return [sorted(row,key=lambda w:w['x0']) for row in result]

def line(row):
    text='';last=None
    for word in row:
        text+=('  ' if last is not None and word['x0']-last>9 else ' ' if last is not None else '')+re.sub(r'\s+',' ',word['text']).strip()
        last=word['x1']
    return text.strip()

def render_rows(groups):
    output=[];previous=None
    for row in groups:
        if previous and row[0]['top']-previous[0]['top']>max(w['bottom']-w['top'] for w in previous)*1.6:output.append('')
        output.append(line(row));previous=row
    return '\n'.join(output)

def page_text(page,headings):
    words=page.extract_words(x_tolerance=2,y_tolerance=3)
    if not words:return ''
    groups=rows(words)
    labels={re.sub(r'[^A-Z]','',k.upper()):k for k in headings}
    def heading(row):
        for n in range(min(5,len(row)),0,-1):
            key=re.sub(r'[^A-Z]','',' '.join(w['text'] for w in row[:n]).upper())
            if key in labels:return labels[key],n
        return None
    hits=[(row,heading(row)) for row in groups if heading(row)]
    starts=[]
    # Independent side columns have their own section labels.
    for row,_ in hits:
        x=row[0]['x0']
        if not any(abs(x-s)<page.width*.18 for s in starts):starts.append(x)
    starts.sort()
    from service.document_structure import DATE_RANGE, MONTH
    date_columns=[]
    for r in groups:
        for i,w in enumerate(r):
            if re.fullmatch(MONTH,re.sub(r'\s+',' ',w['text']).strip(),re.I) and i+1<len(r) and re.fullmatch(r'(?:19|20)\d{2}',r[i+1]['text'].strip()):
                if i==0 or w['x0']-r[i-1]['x1']>25:date_columns.append(round(w['x0']/20)*20)
    for x,count in Counter(date_columns).items():
        if len(starts)>1 and count>=2 and starts[0]<x<starts[-1] and not any(abs(x-s)<page.width*.18 for s in starts):starts.append(x)
    clusters=sorted(x for x,count in Counter(date_columns).items() if count>=2)
    if len(starts)==1 and len(clusters)>=2 and clusters[-1]-clusters[0]>page.width*.25:
        # Shared section headings can span parallel job columns on later pages.
        indent=clusters[0]-starts[0]
        cuts=[0,*[x-indent-8 for x in clusters[1:]],page.width]
        output=[render_rows([r for r in groups if r[0]['top']<hits[0][0][0]['top']-3])]
        for i,(r,(label,n)) in enumerate(hits):
            top=r[0]['bottom'];bottom=hits[i+1][0][0]['top'] if i+1<len(hits) else page.height
            output.append(label)
            for left,right in zip(cuts,cuts[1:]):
                output.append(render_rows(rows([w for w in words if top<=w['top']<bottom and left<=w['x0']<right])))
        return '\n\n'.join(output)
    starts.sort()
    if len(starts)>1:
        top=min(row[0]['top'] for row,_ in hits)
        prefix=[r for r in groups if r[0]['top']<top-3]
        chunks=['\n'.join(line(r) for r in prefix)]
        cuts=[0,*[x-8 for x in starts[1:]],page.width]
        for left,right in zip(cuts,cuts[1:]):
            column=[w for w in words if w['top']>=top-3 and left<=w['x0']<right]
            chunks.append(render_rows(rows(column)))
        return '\n\n'.join(chunks)
    # A section-label gutter plus employer/date and narrative columns (e.g. CVs).
    if hits and any(len(r)>n and r[n]['x0']-r[n-1]['x1']>15 for r,(_,n) in hits):
        output=[]
        positions={id(r):(label,n) for r,(label,n) in hits}
        section=None;block=[]
        def flush():
            if not block:return
            candidates=[]
            for r in block:
                for a,b in zip(r,r[1:]):
                    if b['x0']-a['x1']>22:candidates.append(round(b['x0']/10)*10)
            counts=Counter(candidates)
            split=counts.most_common(1)[0][0]-3 if counts and counts.most_common(1)[0][1]>=3 else None
            if section=='experience' and split:
                metadata=rows([w for r in block for w in r if w['x0']<split])
                from service.document_structure import DATE_RANGE
                anchors=[i for i,r in enumerate(metadata) if DATE_RANGE.fullmatch(line(r))]
                if anchors:
                    for n,i in enumerate(anchors):
                        start=max(0,i-2);end=max(0,anchors[n+1]-2) if n+1<len(anchors) else len(metadata)
                        head=[line(r) for r in metadata[start:i]]
                        output.extend([' | '.join(head)+'  '+line(metadata[i])])
                        y=metadata[start][0]['top'];bottom=metadata[end][0]['top'] if end<len(metadata) else page.height
                        body=rows([w for r in block for w in r if w['x0']>=split and y-3<=w['top']<bottom-3])
                        if body:output.extend(['- '+' '.join(line(r) for r in body),''])
                    return
            output.extend(line(r) for r in block)
        for r in groups:
            found=positions.get(id(r))
            if found:
                flush();block=[]
                label,n=found;section=headings[label];output.extend(['',label])
                if len(r)>n:block.append(r[n:])
            else:block.append(r)
        flush()
        return '\n'.join(output)
    return render_rows(groups)
