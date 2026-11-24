# Contributing

Describe the task, the source format and the expected output in an issue before proposing a substantial change. Use fictional examples that reproduce the problem. Do not upload client material or credentials.

Keep changes focused. Preserve originals, source references and output revisions. A field that cannot be supported by a source should remain missing rather than be inferred silently.

Run `npm run check` and the tests relevant to the change. The OCR tests require Python, Poppler, the language data and a Unicode font. Use the Docker image to reproduce the complete processing environment.

For a pull request, state the user facing change, how it was verified and any remaining limitation. New readers should document supported formats and limits. New exports should be opened with an independent reader during verification.
