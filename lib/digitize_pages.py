"""Prepare OCR pages and add invisible text without replacing original PDF artwork."""
import io
import json
import os
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

Image.MAX_IMAGE_PIXELS = 16_000_000


def prepare(spec):
    folder = Path(spec['folder'])
    folder.mkdir(parents=True, exist_ok=True)
    pages = []
    for source in spec['sources']:
        if source['name'].lower().endswith('.pdf'):
            reader = PdfReader(source['path'])
            if reader.is_encrypted:
                raise ValueError('Unlock password protected PDFs before digitising them.')
            if len(reader.pages) > 15:
                raise ValueError('Split PDFs into at most 15 pages.')
            for index, page in enumerate(reader.pages):
                width, height = float(page.cropbox.width), float(page.cropbox.height)
                if page.rotation % 180:
                    width, height = height, width
                if min(width, height) <= 0 or width * height * (150 / 72) ** 2 > 16_000_000:
                    raise ValueError('A PDF page exceeds the 16 megapixel OCR limit.')
                stem = folder / f'page-{len(pages) + 1}'
                subprocess.run([spec['poppler'], '-f', str(index+1), '-l', str(index+1),
                                '-cropbox', '-r', '150', '-singlefile', '-png',
                                source['path'], str(stem)], check=True, timeout=45,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                               **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}))
                with Image.open(str(stem)+'.png') as image:
                    pixels = image.size
                pages.append(dict(fileId=source['id'], sourceName=source['name'], sourcePage=index+1,
                                  width=width, height=height, pixelWidth=pixels[0], pixelHeight=pixels[1],
                                  nativeText=bool((page.extract_text() or '').strip()), image=str(stem)+'.png'))
        else:
            with Image.open(source['path']) as original:
                if original.width * original.height > 16_000_000:
                    raise ValueError('Use images of at most 16 megapixels.')
                if getattr(original, 'n_frames', 1) != 1:
                    raise ValueError('Convert multi frame images into a PDF first.')
                image = ImageOps.exif_transpose(original).convert('RGB')
                stem = folder / f'page-{len(pages) + 1}.png'
                image.save(stem)
                width = min(595.28, image.width * .75)
                height = width * image.height / image.width
                pages.append(dict(fileId=source['id'], sourceName=source['name'], sourcePage=1,
                                  width=width, height=height, pixelWidth=image.width,
                                  pixelHeight=image.height, nativeText=False, image=str(stem)))
        if len(pages) > 30:
            raise ValueError('Use at most 30 pages in one digitisation run.')
    return pages


def searchable(spec):
    font = spec['font']
    pdfmetrics.registerFont(TTFont('OCR', font))
    writer = PdfWriter()
    readers = {}
    for page in spec['pages']:
        width, height = page['width'], page['height']
        if page['sourceName'].lower().endswith('.pdf'):
            if page['fileId'] not in readers:
                readers[page['fileId']] = PdfReader(spec['sources'][page['fileId']])
            original = readers[page['fileId']].pages[page['sourcePage']-1]
        else:
            picture = io.BytesIO()
            c = canvas.Canvas(picture, pagesize=(width, height))
            c.drawImage(page['image'], 0, 0, width=width, height=height)
            c.save()
            original = PdfReader(io.BytesIO(picture.getvalue())).pages[0]
        if not page['nativeText']:
            overlay = io.BytesIO()
            c = canvas.Canvas(overlay, pagesize=(width, height))
            for word in page['words']:
                text = word['text']
                if not text.strip():
                    continue
                box = word['bbox']
                x = box['x0'] * width / page['pixelWidth']
                y = height - box['y1'] * height / page['pixelHeight']
                boxwidth = max(1, (box['x1']-box['x0']) * width / page['pixelWidth'])
                fontsize = max(1, (box['y1']-box['y0']) * height / page['pixelHeight'] * .9)
                t = c.beginText(x, y)
                t.setFont('OCR', fontsize)
                t.setTextRenderMode(3)
                measured = pdfmetrics.stringWidth(text, 'OCR', fontsize)
                t.setHorizScale(min(500, boxwidth / max(.01, measured) * 100))
                t.textOut(text)
                c.drawText(t)
            c.save()
            # OCR coordinates are relative to the displayed crop box.
            x, y = float(original.cropbox.left), float(original.cropbox.bottom)
            w, h = float(original.cropbox.width), float(original.cropbox.height)
            transforms = {0: (1, 0, 0, 1, x, y), 90: (0, 1, -1, 0, x+w, y),
                          180: (-1, 0, 0, -1, x+w, y+h), 270: (0, -1, 1, 0, x, y+h)}
            original.merge_transformed_page(PdfReader(io.BytesIO(overlay.getvalue())).pages[0],
                                            transforms[original.rotation % 360])
        writer.add_page(original)
    writer.add_metadata({'/Title': spec['title'], '/Producer': 'Avenfold',
                         '/Subject': 'Original appearance with searchable text. OCR requires review.'})
    with open(spec['output'], 'wb') as target:
        writer.write(target)
    return {'pages': len(spec['pages'])}


if __name__ == '__main__':
    try:
        with open(sys.argv[2], encoding='utf-8') as source:
            spec = json.load(source)
        result = prepare(spec) if sys.argv[1] == 'prepare' else searchable(spec)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
