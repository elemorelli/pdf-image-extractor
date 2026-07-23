#!/usr/bin/env bash
# Extracts images from a PDF. Images with a soft mask (transparency) get
# composited into transparent PNGs; the rest are left as opaque PNGs.
#
# Requires: poppler-utils (pdfimages), ImageMagick (mogrify/convert/identify).
# Fedora: sudo dnf install poppler-utils ImageMagick

set -uo pipefail

MIN_DIMENSION_PX=100
pdf="${1:-}"

if [[ -z "$pdf" ]]; then
	echo "Usage: $0 <file.pdf>" >&2
	exit 1
fi

if [[ ! -f "$pdf" ]]; then
	echo "Error: '$pdf' is not a file" >&2
	exit 1
fi

shopt -s nullglob

echo "****** PROCESSING $pdf ******"

folder="$(basename "$pdf")"
folder="${folder%.pdf}"
mkdir -p "$folder"

# pdfimages -list reports each image's real PDF role (image vs smask) and
# its embedded PDF object ID, keyed by the same index pdfimages uses in its
# output filenames. The same object ID shows up again whenever a PDF reuses
# one embedded image in multiple places (a page background or border, for
# example), which lets us dedupe by PDF structure below instead of by
# comparing pixels after the fact.
echo "* Reading image/mask structure"
declare -A kind=()
declare -A objid=()
while read -r num type obj; do
	kind[$num]="$type"
	objid[$num]="$obj"
done < <(pdfimages -list "$pdf" | tail -n +3 | awk '{print $2, $3, $11}')

total_images=${#kind[@]}
echo "* Extracting images (0/$total_images)"
i=0
while IFS= read -r f; do
	i=$((i + 1))
	printf '\r  %d/%d %s' "$i" "$total_images" "$(basename "$f")"
done < <(pdfimages -print-filenames "$pdf" "$folder/$folder")
((total_images > 0)) && printf '\n'

(
	cd "$folder"

	declare -A raw_by_idx=()
	for f in ./*.p?m; do
		[[ "$f" =~ -([0-9]+)\.p.m$ ]] || continue
		raw_by_idx[$((10#${BASH_REMATCH[1]}))]="$f"
	done

	# Drop images that are the exact same embedded PDF object as one we've
	# already kept: same object ID means guaranteed-identical pixels, so
	# there's nothing to gain from converting/compositing it again.
	echo "* Skipping repeated embedded images"
	declare -A seen_object=()
	reused_count=0
	for idx in "${!raw_by_idx[@]}"; do
		[[ "${kind[$idx]:-image}" == "image" ]] || continue
		obj="${objid[$idx]:-}"
		[[ -n "$obj" ]] || continue
		if [[ -n "${seen_object[$obj]:-}" ]]; then
			rm -f -- "${raw_by_idx[$idx]}"
			unset 'raw_by_idx[$idx]'
			mask_idx=$((idx + 1))
			if [[ "${kind[$mask_idx]:-}" == "smask" && -n "${raw_by_idx[$mask_idx]:-}" ]]; then
				rm -f -- "${raw_by_idx[$mask_idx]}"
				unset 'raw_by_idx[$mask_idx]'
			fi
			reused_count=$((reused_count + 1))
		else
			seen_object[$obj]=1
		fi
	done
	echo "  skipped $reused_count reused image(s)"

	echo "* Converting images"
	ppms=(*.p?m)
	total=${#ppms[@]}
	i=0
	for f in "${ppms[@]}"; do
		i=$((i + 1))
		printf '\r  %d/%d' "$i" "$total"
		magick "$f" "${f%.*}.png"
	done
	((total > 0)) && printf '\n'
	rm -f ./*.ppm ./*.pgm ./*.pbm

	mkdir -p transparent opaque

	echo "* Purging small images (< ${MIN_DIMENSION_PX}px on either side); soft masks are exempt, they're expected to be low-res"
	pngs=(*.png)
	total=${#pngs[@]}
	i=0
	for img in "${pngs[@]}"; do
		i=$((i + 1))
		printf '\r  %d/%d' "$i" "$total"
		[[ "$img" =~ -([0-9]+)\.png$ ]] || continue
		idx=$((10#${BASH_REMATCH[1]}))
		[[ "${kind[$idx]:-image}" == "smask" ]] && continue
		read -r w h < <(identify -format "%w %h" "$img")
		if ((w < MIN_DIMENSION_PX || h < MIN_DIMENSION_PX)); then
			rm -f "$img"
		fi
	done
	((total > 0)) && printf '\n'

	echo "* Combining masks with their base images"
	declare -A file_by_idx=()
	for f in ./*.png; do
		[[ "$f" =~ -([0-9]+)\.png$ ]] || continue
		file_by_idx[$((10#${BASH_REMATCH[1]}))]="$f"
	done

	paired_count=0
	single_count=0
	orphan_mask_count=0
	total=${#file_by_idx[@]}
	i=0

	# A soft mask always immediately follows the image it belongs to in
	# pdfimages' numbering, so idx+1 is enough to find its mask, if any.
	for idx in "${!file_by_idx[@]}"; do
		i=$((i + 1))
		printf '\r  %d/%d' "$i" "$total"
		[[ "${kind[$idx]:-image}" == "smask" ]] && continue
		base="${file_by_idx[$idx]}"
		mask_idx=$((idx + 1))
		if [[ "${kind[$mask_idx]:-}" == "smask" && -n "${file_by_idx[$mask_idx]:-}" ]]; then
			mask="${file_by_idx[$mask_idx]}"
			magick "$base" "$mask" -alpha off -compose CopyOpacity -composite "transparent/$base"
			rm -f -- "$base" "$mask"
			unset 'file_by_idx[$mask_idx]'
			((paired_count++))
		else
			mv -- "$base" opaque/
			((single_count++))
		fi
	done
	((total > 0)) && printf '\n'

	# Anything left is a soft mask whose base image got purged above, not
	# useful on its own, so it's discarded rather than dumped in opaque/.
	for idx in "${!file_by_idx[@]}"; do
		f="${file_by_idx[$idx]}"
		[[ -e "$f" ]] || continue
		rm -f -- "$f"
		((orphan_mask_count++))
	done

	# Catches duplicates the object-ID skip above can't see: the same
	# picture embedded as two separate, unrelated PDF objects. Matches on
	# decoded pixel content (identify -format "%#"), not file bytes, so
	# re-encoded copies of the same image still count as a match.
	echo "* Deduping remaining images"
	declare -A seen_sig=()
	dupe_count=0
	dedupe_files=(transparent/*.png opaque/*.png)
	total=${#dedupe_files[@]}
	i=0
	for f in "${dedupe_files[@]}"; do
		i=$((i + 1))
		printf '\r  %d/%d' "$i" "$total"
		sig="$(identify -format "%#" "$f" 2>/dev/null)"
		[[ -n "$sig" ]] || continue
		if [[ -n "${seen_sig[$sig]:-}" ]]; then
			rm -f -- "$f"
			((dupe_count++))
		else
			seen_sig[$sig]="$f"
		fi
	done
	((total > 0)) && printf '\n'

	echo "* Summary: $paired_count pair(s) -> transparent/, $single_count image(s) -> opaque/, $orphan_mask_count orphaned mask(s) discarded, $reused_count reused image(s) skipped, $dupe_count duplicate(s) removed"
)

echo "****** $pdf DONE ******"
