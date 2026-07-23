#!/usr/bin/env bash
# Extracts images from a PDF. Images with a soft mask (transparency) get
# composited into transparent PNGs; the rest are left as opaque PNGs.
#
# Requires: poppler-utils (pdfimages), ImageMagick (mogrify/convert/identify).
# Fedora: sudo dnf install poppler-utils ImageMagick

set -uo pipefail

MIN_DIMENSION_PX=100
REVIEW=0
pdf=""

for arg in "$@"; do
	case "$arg" in
	-r | --review)
		REVIEW=1
		;;
	*)
		pdf="$arg"
		;;
	esac
done

if [[ -z "$pdf" ]]; then
	echo "Usage: $0 [--review] <file.pdf>" >&2
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

# pdfimages -list reports each image's real PDF role (image vs smask),
# keyed by the same index pdfimages uses in its output filenames.
echo "* Reading image/mask structure"
declare -A kind=()
while read -r num type; do
	kind[$num]="$type"
done < <(pdfimages -list "$pdf" | tail -n +3 | awk '{print $2, $3}')

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

	if ((REVIEW == 1)); then
		echo "*** BEFORE CONTINUING, CHECK IMAGES IN $folder ***"
		read -rp "Press Enter to continue..."
	fi

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

	echo "* Summary: $paired_count pair(s) -> transparent/, $single_count image(s) -> opaque/, $orphan_mask_count orphaned mask(s) discarded"
)

echo "****** $pdf DONE ******"
