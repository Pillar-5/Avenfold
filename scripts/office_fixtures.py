from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent/'samples'
presentation=Presentation()
slide=presentation.slides.add_slide(presentation.slide_layouts[6])
box=slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(5))
lines=['SAMPLE DOCUMENT: Fictional records','Supplier: Format Test Office','Reference: FT001','Currency: EUR','Total: 72.50']
for i,line in enumerate(lines):
    para=box.text_frame.paragraphs[0] if i==0 else box.text_frame.add_paragraph()
    para.text=line
    para.font.size=Pt(22)
presentation.save(root/'Format check.pptx')
content='<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text>'+''.join('<text:p>'+line+'</text:p>' for line in lines)+'</office:text></office:body></office:document-content>'
manifest='<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>'
with ZipFile(root/'Format check.odt','w') as archive:
    archive.writestr('mimetype','application/vnd.oasis.opendocument.text',compress_type=ZIP_STORED)
    archive.writestr('content.xml',content,compress_type=ZIP_DEFLATED)
    archive.writestr('META-INF/manifest.xml',manifest,compress_type=ZIP_DEFLATED)
print('Office format fixtures created.')
