"""Source-only date and section structure; never infer missing dates or employers."""
import re

MONTH = r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?'
DATE_VALUE = rf'(?:{MONTH}\s+(?:19|20)\d{{2}}|(?:19|20)\d{{2}}|Present|Current|Now|Incoming\s+(?:Summer|Spring|Fall|Winter)\s+20\d{{2}})'
DATE_RANGE = re.compile(rf'(?<!\w){DATE_VALUE}(?:\s*[-–—]\s*{DATE_VALUE})?', re.I)
INSTITUTION = re.compile(r'\b(?:universit\w*|college|school|institute|academy|IIT|NIT|IGNOU)\b',re.I)
DEGREE = re.compile(r'\b(?:Bachelor|Master|Doctor|Honours|Associate|B\.?\s*(?:S|A|Tech|Des|Arch)|M\.?\s*(?:S|A|Tech|Des)|Ph\.?D|MBA)\b',re.I)

def dates(value):
    match=DATE_RANGE.search(value or '')
    raw=match.group() if match else ''
    parts=re.split(r'\s*[-–—]\s*',raw,maxsplit=1)
    return {'dates':raw,'startDate':parts[0] if len(parts)==2 else '', 'endDate':parts[-1] if parts else ''}

def experience_entries(raw):
    lines=[line.rstrip() for line in raw.splitlines()]
    anchors=[]
    for i,line in enumerate(lines):
        s=line.strip()
        if not s or s.startswith(('•','●','-','*')):continue
        match=DATE_RANGE.search(s)
        if not match:continue
        before=s[:match.start()].strip(' |')
        after=s[match.end():].strip(' |')
        # A date-only metadata row or a header/date row, not a prose year mention.
        if before and not re.search(r'\s{2,}|\s[|/@]\s',s):continue
        if after and not (s[match.end():].lstrip().startswith('|') or re.search(r'\s{2,}',s[match.end():])):continue
        previous=[j for j in range(i) if lines[j].strip()]
        start=i
        header=before
        if not header and previous:
            start=previous[-1];header=lines[start].strip()
            # Stacked employer, title, date.
            if not re.search(r'\s[|/@]\s|\s{2,}',header) and re.search(r'\b(?:designer|engineer|intern|manager|analyst|developer|architect|lead|consultant|chair)\b',header,re.I) and len(previous)>1:
                p=previous[-2]
                if not anchors or p>anchors[-1][1]:
                    header=lines[p].strip()+' | '+header;start=p
        anchors.append((start,i,header,match.group(),after))
    entries=[]
    for n,(start,date_i,header,raw_date,location) in enumerate(anchors):
        chunks=[x.strip() for x in re.split(r'\s+[|/@]\s+|\s{2,}',header) if x.strip()]
        role_first=' @ ' in header or (len(chunks)>1 and re.search(r'\b(?:designer|engineer|intern|manager|developer|architect|analyst)\b',chunks[0],re.I) and ' / ' not in header)
        company=chunks[1] if role_first and len(chunks)>1 else chunks[0] if chunks else ''
        title=chunks[0] if role_first else chunks[1] if len(chunks)>1 else ''
        stop=anchors[n+1][0] if n+1<len(anchors) else len(lines)
        body_start=date_i+1
        if not title:
            following=next((j for j in range(body_start,stop) if lines[j].strip()),None)
            if following is not None:
                metadata=re.split(r'\s{2,}|\s+\|\s+',lines[following].strip())
                if re.fullmatch(r'[\w .&/+()\-]{1,80}(?:Designer|Engineer|Intern|Manager|Developer|Architect|Analyst|Consultant|Lead)',metadata[0],re.I):
                    title=metadata[0];body_start=following+1
                    if len(metadata)>1 and not location:location=' | '.join(metadata[1:])
        bullets=[];paragraph=''
        for line in lines[body_start:stop]:
            value=line.strip()
            if not value:
                if paragraph:bullets.append(paragraph);paragraph=''
                continue
            marked=bool(re.match(r'^[•●\uf0b7*\-]\s*',value))
            if marked and paragraph:bullets.append(paragraph);paragraph=''
            value=re.sub(r'^[•●\uf0b7*\-]\s*','',value)
            paragraph=(paragraph+' '+value).strip()
        if paragraph:bullets.append(paragraph)
        entries.append({'company':company,'title':title,**dates(raw_date),'location':location,'bullets':bullets})
    return entries

def education_entries(raw):
    entries=[];current=None
    for original in (raw or '').splitlines():
        line=original.strip()
        if not line:continue
        cells=re.split(r'\s{2,}',line)
        notes=''
        if len(cells)>1 and INSTITUTION.search(cells[0]):line=cells[0];notes=' '.join(cells[1:])
        match=DATE_RANGE.search(line)
        clean=(line[:match.start()]+line[match.end():]).strip(' |,–—-') if match else line
        institution=bool(INSTITUTION.search(clean)) and not DEGREE.search(clean)
        if institution and current and current['college'].rstrip().endswith(','):
            current['college']+=' '+clean
            if notes:current['details']=(current.get('details','')+' '+notes).strip()
            continue
        if institution or current is None:
            if current:entries.append(current)
            current={'id':str(len(entries)+1),'college':clean if institution else '', 'degree':'' if institution else clean,
                     'field':'','startDate':'','endDate':'','grade':'','maxGrade':'','gradeType':'CGPA'}
        elif DEGREE.search(clean) and not current['degree']:current['degree']=clean
        elif clean and not (match and original[match.end():].strip().startswith('|')):
            current['details']=(current.get('details','')+' '+clean).strip()
        if match:current.update(dates(match.group()))
        if notes:
            if DATE_RANGE.fullmatch(notes):current.update(dates(notes))
            elif DEGREE.search(notes) and not current['degree']:current['degree']=notes
            else:current['details']=(current.get('details','')+' '+notes).strip()
    if current:entries.append(current)
    for entry in entries:
        grade=re.search(r'\s*[|,;]?\s*(CPI|CGPA|GPA)\s*:\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)',entry['degree'],re.I)
        if grade:
            entry['degree']=entry['degree'][:grade.start()].rstrip(' |,;')
            entry.update(grade=grade[2],maxGrade=grade[3],gradeType='CGPA')
            entry['details']=(entry.get('details','')+' '+grade.group().strip(' |,;')).strip()
    return entries

def form_details(details):
    """Fill editable form fields without discarding the extracted date strings."""
    if isinstance(details.get('education'),str) and 'educationHistory' not in details:
        details['educationHistory']=education_entries(details['education'])
    if isinstance(details.get('experience'),list):
        details['experienceHistory']=[{'id':str(i+1),'company':e.get('company',''),'role':e.get('title',''),
            **dates(e.get('dates','')),'jobDescription':'\n'.join('- '+b for b in e.get('bullets',[])),
            'skills':[],'domains':[],'responsibilities':''} for i,e in enumerate(details['experience'])]
    return details
