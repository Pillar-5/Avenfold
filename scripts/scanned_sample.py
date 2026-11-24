from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
root=Path(__file__).resolve().parent.parent/'samples'
root.mkdir(exist_ok=True)
im=Image.new('RGB',(1240,1754),'white');d=ImageDraw.Draw(im)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf' if Path('C:/Windows/Fonts/arial.ttf').exists() else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',30)
lines=['SAMPLE INVOICE','Fictional records for processing tests','','Supplier: Willow Print Studio','Reference: WP0064','Date: 2026-11-22','Currency: EUR','Subtotal: 250.00','Tax: 50.00','Total: 300.00','','Description: Printed training manuals.']
for i,line in enumerate(lines):d.text((100,120+i*65),line,font=font,fill='black')
im.save(root/'Scanned invoice.png')
c=canvas.Canvas(str(root/'Scanned invoice.pdf'),pagesize=(595.28,841.89));c.drawImage(ImageReader(im),0,0,width=595.28,height=841.89);c.save()
print('Scanned image and image only PDF created.')
