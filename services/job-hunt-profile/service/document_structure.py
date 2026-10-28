"""Source-only date and section structure; never infer missing dates or employers."""
import re

MONTH = r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?'
DATE_VALUE = rf'(?:{MONTH}\s+(?:19|20)(?:\d{{2}}|XX)|(?:19|20)(?:\d{{2}}|XX)|Present|Current|Now|Incoming\s+(?:Summer|Spring|Fall|Winter)\s+20\d{{2}})'
DATE_RANGE = re.compile(rf'(?<!\w){DATE_VALUE}(?:\s*[-–—]\s*{DATE_VALUE})?', re.I)
INSTITUTION = re.compile(r'\b(?:universit\w*|college|school|institute|academy|IIT|NIT|IGNOU)\b',re.I)
DEGREE = re.compile(r'\b(?:Bachelor|Master|Doctor|Honours|Associate|B\.?\s*(?:S|A|Tech|Des|Arch)|M\.?\s*(?:S|A|Tech|Des)|Ph\.?D|MBA)\b',re.I)

ROLE_TITLE = re.compile(r'\b(?:designer|engineer|intern|manager|analyst|developer|architect|lead|consultant|researcher|scientist|caller|instructor|director|officer)\b',re.I)

def stacked_employment_header(lines,date_index):
    """Require two distinct metadata rows and an optional explicit location."""
    metadata=[]
    for index in range(date_index-1,max(-1,date_index-4),-1):
        value=lines[index].strip()
        if not value or re.match(r'^[•●◦\uf0b7*\-]\s*',value) or DATE_RANGE.search(value):break
        if len(value)>100 or re.search(r'\s[|/@]\s|\s{2,}',value):break
        metadata.insert(0,(index,value))
    location=''
    if metadata and re.fullmatch(r'(?:Remote|Hybrid|On[- ]?site|[^,]{1,60},\s*[A-Z]{2}(?:\s+\d{5})?)',metadata[-1][1],re.I):
        _,location=metadata.pop()
    if len(metadata)!=2:return None
    roles=[position for position,(_,value) in enumerate(metadata) if ROLE_TITLE.search(value)]
    if len(roles)>1:return False
    if len(roles)!=1:return None
    role=metadata[roles[0]][1];company=metadata[1-roles[0]][1]
    return metadata[0][0],role+' @ '+company,location

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
        previous=[j for j in range(i) if lines[j].strip() and not re.fullmatch(r'[•●◦*\-]+',lines[j].strip())]
        start=i
        header=before
        if before and len(before)<90 and not re.search(r'\s[|/@]\s',before) and re.search(r'\b(?:designer|engineer|intern|manager|analyst|developer|architect|lead|consultant|researcher|caller|instructor)\b',before,re.I) and previous:
            prior=lines[previous[-1]].strip()
            cells=re.split(r'\s{2,}',prior)
            if len(cells)>1 and len(cells[0])<100 and not re.match(r'^[•●◦\uf0b7*\-]\s*',prior):
                header=cells[0].lstrip('•●◦* -')+' | '+before
                start=previous[-1]
                if not after:after=' | '.join(cells[1:])
        if not header and previous:
            start=previous[-1];header=lines[start].strip()
            stacked=stacked_employment_header(lines,i)
            if stacked is False:raise ValueError('Stacked employment role/company association is ambiguous')
            if stacked:
                start,header,stacked_location=stacked
                if not after:after=stacked_location
            # Stacked employer, title, date.
            if not stacked and not re.search(r'\s[|/@]\s|\s{2,}',header) and re.search(r'\b(?:designer|engineer|intern|manager|analyst|developer|architect|lead|consultant|chair)\b',header,re.I) and len(previous)>1:
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
            marked=bool(re.match(r'^[•●◦\uf0b7*\-]\s*',value))
            if marked and paragraph:bullets.append(paragraph);paragraph=''
            value=re.sub(r'^[•●◦\uf0b7*\-]\s*','',value)
            paragraph=(paragraph+' '+value).strip()
        if paragraph:bullets.append(paragraph)
        entries.append({'company':company,'title':title,**dates(raw_date),'location':location,'bullets':bullets})
    return entries

def education_entries(raw):
    entries=[];current=None
    for original in (raw or '').splitlines():
        line=re.sub(r'^[•●\uf0b7*\-]\s*','',original.strip())
        if not line:continue
        inline=re.split(r'\s+[–—-]\s+',line,maxsplit=1)
        degree_first=len(inline)==2 and DEGREE.search(inline[0]) and INSTITUTION.search(inline[1])
        school_first=len(inline)==2 and INSTITUTION.search(inline[0]) and DEGREE.search(inline[1])
        if degree_first or school_first:
            if current:entries.append(current);current=None
            school,degree=(inline[1],inline[0]) if degree_first else (inline[0],inline[1])
            entries.append({'id':str(len(entries)+1),'college':school.strip(),'degree':degree.strip(),
                'field':'','startDate':'','endDate':'','grade':'','maxGrade':'','gradeType':'CGPA'})
            continue
        cells=re.split(r'\s{2,}',line)
        notes=''
        if len(cells)>1 and (INSTITUTION.search(cells[0]) or DEGREE.search(cells[0])):line=cells[0];notes=' '.join(cells[1:])
        notes_date=DATE_RANGE.search(notes)
        if notes_date:notes=(notes[:notes_date.start()]+notes[notes_date.end():]).strip(' |,–—-')
        match=DATE_RANGE.search(line)
        clean=(line[:match.start()]+line[match.end():]).strip(' |,–—-') if match else line
        institution=bool(INSTITUTION.search(clean)) and not DEGREE.search(clean)
        if institution and current and current['college'].rstrip().endswith(','):
            current['college']+=' '+clean
            if notes:current['details']=(current.get('details','')+' '+notes).strip()
            continue
        if institution and current and not current['college'] and current['degree']:
            current['college']=clean
            if notes:current['details']=(current.get('details','')+' '+notes).strip()
            if match:current.update(dates(match.group()))
            continue
        if institution or current is None:
            if current:entries.append(current)
            current={'id':str(len(entries)+1),'college':clean if institution else '', 'degree':'' if institution else clean,
                     'field':'','startDate':'','endDate':'','grade':'','maxGrade':'','gradeType':'CGPA'}
        elif DEGREE.search(clean) and not current['degree']:current['degree']=clean
        elif clean and not (match and original[match.end():].strip().startswith('|')):
            current['details']=(current.get('details','')+' '+clean).strip()
        if match or notes_date:current.update(dates(match.group() if match else notes_date.group()))
        if notes:
            if DATE_RANGE.fullmatch(notes):current.update(dates(notes))
            elif ',' in notes and not re.search(r'\b(?:Bachelor|Master|Doctor|Honours|Associate|Science|Engineering|Technology)\b',notes,re.I):current['location']=notes
            elif DEGREE.search(notes) and not current['degree']:current['degree']=notes
            else:current['details']=(current.get('details','')+' '+notes).strip()
    if current:entries.append(current)
    for entry in entries:
        grade=re.search(r'\s*[|,;]?\s*(CPI|CGPA|GPA)\s*:\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)',entry['degree'],re.I)
        if grade:
            entry['degree']=entry['degree'][:grade.start()].rstrip(' |,;(')
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
