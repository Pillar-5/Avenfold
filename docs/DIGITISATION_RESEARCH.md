# Document digitisation

Implemented locally on 24 November 2026.

The searchable PDF architecture follows the text layer approach described by [OCRmyPDF](https://ocrmypdf.readthedocs.io/en/latest/introduction.html). It keeps original PDF artwork and adds invisible recognised text. Avenfold does not run OCRmyPDF or claim its PDF/A guarantees. Poppler supplies OCR rasters; Tesseract.js supplies word coordinates and confidence; ReportLab builds an invisible text overlay; pypdf merges that overlay into the existing page coordinate system without normalising or rasterising the artwork. Rotation and crop box coordinates are handled separately from visible content.

[Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md) provides local recognition with block, line and word output explicitly enabled. The installed English, German and French models work without an external AI service. Recognition confidence is recorded as OCR confidence, not correctness. Originals and OCR derived outputs are separate, following the preservation principle used by [Paperless ngx](https://docs.paperless-ngx.com/administration/).

Editable Word output is an OCR reconstruction with page breaks and approximate indentation. It is distinct from the appearance preserving PDF. Category output reuses the existing source grounded library field extractor, with empty fields for absent or conflicting values. Excel includes the category records, field evidence, OCR transcript and word review sheet. OCR corrections regenerate output files rather than modifying source bytes or changing a library document silently.

Future mobile capture should submit one image per captured page with a batch identifier and page order. Perspective correction, edge detection, camera permissions and a capture quality check belong in that client. The same upload and persistent run queue can perform recognition and exports. This work exposes those server operations now; it does not implement a mobile client, automatic perspective correction, handwriting recognition guarantees, exact editable tables, cloud synchronisation or PDF/A validation.

Current safeguards include source hashes, original download access, bounded file and page sizes, local serial OCR jobs, language allowlists, escaped rendered OCR text, spreadsheet formula escaping, word ownership validation, explicit review and retained output revisions. Public hosting, authentication and shared access require a separate deployment design.
