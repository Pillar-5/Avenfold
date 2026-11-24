import sys,json
from pypdf import PdfReader
reader=PdfReader(sys.argv[1])
if len(reader.pages)>50:raise ValueError('Split PDFs longer than 50 pages.')
lines=[];scans=[]
for index,page in enumerate(reader.pages):
    text=page.extract_text() or ''
    if len(text.strip())<20:scans.append(index+1)
    lines += [f'Page {index+1} | {line}' for line in text.splitlines() if line.strip()]
print(json.dumps({'text':'\n'.join(lines),'scanPages':scans},ensure_ascii=False))
