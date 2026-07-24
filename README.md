# PDF Image Extractor

Extracts images from a PDF, recombining any that have a soft mask (transparency) into proper transparent PNGs, and optionally converts the result to webp.

Available as a standalone `pdf_extract.sh` script, or as a small web app (with a Docker image) that wraps it with uploads, background jobs, and a browser UI for browsing and downloading the results.

## Web app

### Quick start (Docker Compose)

```
docker compose up -d --build
```

Then open `http://localhost:3000`. Uploaded PDFs and extracted images are kept in a named Docker volume (`data`), so they survive container restarts. Finished jobs are swept automatically after `RETENTION_HOURS` (see below).

### Environment variables

All are optional; defaults work out of the box.

| Variable          | Default | Purpose                                             |
| ----------------- | ------- | ---------------------------------------------------- |
| `PORT`             | `3000`  | Port the server listens on                          |
| `DATA_DIR`         | `/data` | Where uploads, job output, and the audit log live    |
| `MAX_UPLOAD_MB`    | `200`   | Max accepted PDF size, in megabytes                  |
| `RETENTION_HOURS`  | `24`    | How long a finished job is kept before it is deleted |

Set them under `environment:` in `docker-compose.yml`, or with `docker run -e`.

### Deploying from the published image (e.g. a home server)

Every push to `main` builds and publishes an image to GHCR via `.github/workflows/docker-publish.yml`, tagged `latest` and with the commit SHA. `docker-compose.yml` already points at `ghcr.io/elemorelli/pdf-image-extractor:latest`, so a server only needs that one file, not the full repo.

One-time setup on the server:

1. Copy `docker-compose.yml` there (`scp` it, or `curl` it from the repo).
2. The first push creates the GHCR package as private. Make it public in the package's GitHub settings, or `docker login ghcr.io` on the server with a token that has `read:packages`.

To update after a new push lands:

```
docker compose pull
docker compose up -d
```

No rebuild, no source checkout. Roll back by pointing `image:` at a `:<commit-sha>` tag instead of `:latest`.

### Running without Docker

Requires the same tools as the CLI script (see [Requirements](#requirements)) plus Node.js 24+.

```
npm install
npm start          # serves on :3000, data in ./data
npm run start:dev   # same, but rebuilds the frontend and restarts on file changes
```

### API

The frontend talks to a small JSON API under `/api`. Useful if you want to script uploads instead of using the browser:

| Method & path                              | Purpose                                             |
| ------------------------------------------- | ---------------------------------------------------- |
| `GET /api/config`                           | Returns the configured max upload size              |
| `POST /api/extract`                         | Upload a PDF (`multipart/form-data`, field `pdf`, optional `webp=true`); returns a `jobId` |
| `GET /api/status/:jobId`                    | Current stage/progress/done/error for a job         |
| `GET /api/status/:jobId/stream`             | Same, as a Server-Sent Events stream                 |
| `GET /api/jobs`                             | List all jobs                                       |
| `GET /api/jobs/:jobId`                      | Job details plus its extracted files                |
| `DELETE /api/jobs/:jobId`                   | Cancel (if running) and delete a job                 |
| `GET /api/jobs/:jobId/files/:subfolder/:filename` | Fetch a single extracted image                 |
| `DELETE /api/jobs/:jobId/files/:subfolder/:filename` | Delete a single extracted image             |
| `GET /api/jobs/:jobId/download`             | Download all results as a zip                       |
| `POST /api/jobs/:jobId/download`            | Download a chosen subset as a zip (`{ files: [{ subfolder, filename }] }`) |

## CLI usage

### Requirements

- `poppler-utils` for `pdfimages`
- `ImageMagick` for `magick`/`identify`
- `libwebp-tools` (or `webp` on Debian/Ubuntu) for `cwebp`

Run `./install_dependencies.sh` to install them via `dnf` or `apt`. It re-invokes itself with `sudo` if needed. The Docker image installs these itself, so this section only matters if you're running the script or the web app directly on your machine.

### Usage

```
./pdf_extract.sh <file.pdf>
./pdf_extract.sh <file.pdf> --webp
```

This creates a folder named after the PDF, with two subfolders:

- `transparent/` images that had a soft mask, composited with alpha
- `opaque/` images that never had a soft mask

#### What it does, in order

1. Reads `pdfimages -list` to learn each embedded image's role (base image or soft mask) and its PDF object ID.
2. Extracts every image with `pdfimages`.
3. Skips images that are the exact same embedded PDF object as one already kept (a background or border reused across many pages, for example). Same object ID means guaranteed identical pixels, so there is nothing to gain from processing it twice.
4. Converts the remaining raw images to PNG.
5. Purges images smaller than 100px on either side. Soft masks are exempt, since they are expected to be low resolution.
6. Composites each base image with its soft mask into a transparent PNG, or moves it to `opaque/` if it never had one.
7. Removes any remaining duplicate images by comparing decoded pixel content, not file bytes, so a re-encoded copy of the same image still counts as a match. This catches duplicates the object ID check above cannot see, such as the same picture embedded twice as two separate PDF objects.
8. With `--webp`, runs `webp_convert.sh --apply` against both `transparent/` and `opaque/`, converting the PNGs to webp and deleting the originals.

## webp_convert.sh

Converts jpg/png images in a single directory to webp, deleting the originals. Dry run by default.

```
./webp_convert.sh <dir>              # dry run, just reports what it would do
./webp_convert.sh --apply <dir>      # actually converts and deletes
./webp_convert.sh --apply --quality=80 <dir>
```

Converts in place, `pic.png` becomes `pic.webp` in the same directory. Skips a file if its `.webp` already exists, so re-running is cheap.

## Notes

- `pdf_extract.sh` only reads the source PDF, it is never modified or deleted. The web app runs it against a copy of each upload, inside its own job folder.
- Everything destructive happens inside the generated per-PDF folder (CLI) or per-job folder (web app), never on the source PDF.
- `.gitignore` excludes PDFs, extracted/converted images, and common temp files, so only the scripts and app code themselves are meant to be tracked in git.
- Web UI icons are from [Font Awesome Free](https://fontawesome.com/license/free) (CC BY 4.0).
