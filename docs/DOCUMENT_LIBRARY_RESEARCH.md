# Document library and storage decisions

Research and implementation review, 24 November 2026.

## Recommendation

Keep Avenfold as one document workspace. The library supplies durable originals and structured records; workbench recipes operate on selected library files. This connects filing, extraction, comparison and delivery without repeated uploads.

The implemented storage is local filesystem storage with a SQLite catalogue and a full text index. Folder names are catalogue metadata. Original bytes remain under stable identifiers even when a document moves between categories. ZIP exports materialise the readable folder hierarchy. This avoids duplicate originals and broken source references.

## Existing implementations inspected

| Project | Architecture and useful capabilities | Applied to Avenfold |
| --- | --- | --- |
| [Paperless ngx](https://github.com/paperless-ngx/paperless-ngx) | Python document processing and matching, document types, storage paths and workflows. Originals and generated archive representations are handled separately. | Separate originals from standard records, explain filing decisions, use a review queue, and treat categories as metadata rather than destructive file moves. |
| [Docspell](https://github.com/eikek/docspell) | Scala backend, Elm interface, metadata classification and OCR. Its file backend configuration supports database, filesystem and S3 storage. | Separate the document catalogue from file storage, retain extracted text for search and preserve uncertainty instead of inventing missing information. |
| [Mayan EDMS](https://docs.mayan-edms.com/chapters/features.html) | Document versions, metadata, workflow states and ingestion from folders, object storage and email. | Record metadata corrections and filing changes as revisions. Archive and restore rather than permanently delete original files. |
| [Nextcloud](https://docs.nextcloud.com/server/stable/admin_manual/configuration_files/primary_storage.html) | A file collaboration platform with supported object storage configurations. Its primary object storage is managed through Nextcloud's catalogue. | Treat shared cloud storage as a separate deployment choice, with explicit ownership of the file catalogue. Do not have two applications independently modify a Nextcloud primary storage bucket. |

Paperless and Docspell were cloned into the excluded references directory. The inspected checkouts were Paperless faa6f09 and Docspell 751b0b8. The inspected files include Paperless's `documents/matching.py` and `documents/consumer.py`, and Docspell's `TextClassifier.scala` and `FileStoreConfig.scala`. Paperless is GPL licensed and Docspell is AGPL licensed. Their code was not copied into the product. Avenfold's implementation is independently written; the adopted ideas are listed above. Archiver is used as a published streaming ZIP dependency, with its package licence retained.

## Implemented workflow

1. Upload up to 100 mixed files per batch. Each original is saved before browser text extraction starts.
2. Reuse an existing original when its SHA256 matches a stored file. Existing manual filing and corrections are retained.
3. Read supported documents and scans using the application's document readers and local OCR. Unsupported content or reading failures retain accepted original uploads and enter review.
4. Apply category keywords and heading evidence first. For automatic processing, unclear categories or missing required fields can use the existing server AI connection. Rules mode keeps document processing local.
5. Extract only fields defined by the chosen category template. Every automatic nonempty value must have source evidence. Missing and conflicting values remain explicit.
6. Save the category, fields, tags, extraction method, model where used, original hash and metadata revisions in the local catalogue.
7. Preserve originals alone, or also create standard Word and PDF records. A custom Word layout can be assigned per category. PDF uses the standard layout.
8. Search names, fields and document text. Filter folders and review status; move documents, correct records, archive and restore.
9. Export selected documents or a folder as originals, standard records, or both. Standard exports include category CSV registers, a combined Excel workbook and source evidence. Original exports verify stored bytes against their upload hashes. A manifest accompanies the ZIP.
10. Reuse stored documents in the workbench, including quotation and document comparison recipes.

Default categories cover invoices, receipts, quotations, policies, agreements, company records, correspondence and uncategorised documents. Custom categories support parent folders, filing keywords and configurable template fields.

The classification is assisted filing, not a guarantee of semantic accuracy. Rules and model decisions are visible and editable. This build does not train a machine learning classifier from corrections. Standard records supplement the originals; they are not certified copies or complete visual reproductions.

## Storage options

| Option | Appropriate use | Decision |
| --- | --- | --- |
| Local files and SQLite | One computer, private files, inexpensive operation and straightforward offline rules processing. | Implemented. Back up the entire data folder, including the database, originals and generated records. |
| Persistent disk on a web host | A small single instance web deployment, with durable disk and database backups. | Feasible later. Render's free web service filesystem is ephemeral and cannot attach a persistent disk. It must not be the only copy of uploaded documents. [Render documentation](https://render.com/docs/free) |
| Hosted object storage and a persistent database | Shared online access, independent app deployments and larger libraries. | Preferred hosted architecture. Requires accounts, access controls, private objects, a storage adapter and backup policies before public deployment. Hosting the UI alone does not supply these features. |
| [SeaweedFS](https://github.com/seaweedfs/seaweedfs) | Self hosted object and file storage, including S3 interfaces. Its community repository uses Apache 2.0 licensing. | A credible object storage option when infrastructure can be operated and backed up. Open source does not make hardware and maintenance free. |
| [Garage](https://github.com/deuxfleurs-org/garage) | Self hosted S3 compatible object storage for smaller distributed deployments, released under AGPL. | Another credible server option. Integrate through its storage protocol rather than embedding the server into Avenfold. |
| Desktop installer | A standalone local application with packaged runtime, controlled filesystem access and updates. | A later packaging step. The current local server and Windows launcher already keep files on the PC. They are not a standalone Windows installer. |

For an eventual desktop edition, compare an Electron package containing the existing Node service with a Tauri shell and managed backend sidecar. Tauri exposes scoped filesystem permissions; a shell alone does not package Avenfold's Node, PDF and OCR dependencies. [Tauri filesystem documentation](https://tauri.app/plugin/file-system/)

## Practical deployment boundary

No cloud storage has been connected and no public deployment has been made. This build remains a single computer workspace. A shared version needs server authentication, per organisation storage isolation, access rules, encrypted transport and tested backup recovery before real shared use. A library ZIP is a portable export, not a full database backup with an automatic restore facility.

Templates and classification can be expanded without migrating original files. That is the main architectural reason to start with the library now and decide its eventual hosting and installer packaging after real document tests.
