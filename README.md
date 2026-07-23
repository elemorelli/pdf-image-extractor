# PDF Image Extractor

Extracts images from a PDF, recombining any that have a soft mask (transparency) into proper transparent PNGs, and optionally converts the result to webp.

## Requirements

- `poppler-utils` for `pdfimages`
- `ImageMagick` for `magick`/`identify`
- `libwebp-tools` (or `webp` on Debian/Ubuntu) for `cwebp`

Run `./install_dependencies.sh` to install them via `dnf` or `apt`. It re-invokes itself with `sudo` if needed.

## Usage

```
./pdf_extract.sh <file.pdf>
./pdf_extract.sh <file.pdf> --webp
```

This creates a folder named after the PDF, with two subfolders:

- `transparent/` images that had a soft mask, composited with alpha
- `opaque/` images that never had a soft mask

### What it does, in order

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

- `pdf_extract.sh` only reads the source PDF, it is never modified or deleted.
- Everything destructive happens inside the generated per-PDF folder.
- `.gitignore` excludes PDFs, extracted/converted images, and common temp files, so only the scripts themselves are meant to be tracked in git.
- Web UI icons are from [Font Awesome Free](https://fontawesome.com/license/free) (CC BY 4.0).
