#!/usr/bin/env bash
# Converts jpg/png images in a directory to webp, deleting the originals.
# Dry-run by default; pass --apply to actually convert and delete.
#
# Requires: libwebp-tools (cwebp). Fedora: sudo dnf install libwebp-tools

set -euo pipefail

DRY_RUN=true
QUALITY=80
TARGET_DIR="."

for arg in "$@"; do
	case "$arg" in
	--apply)
		DRY_RUN=false
		;;
	-q | --quality)
		echo "Use --quality=<0-100>, not '-q value'" >&2
		exit 1
		;;
	--quality=*)
		QUALITY="${arg#--quality=}"
		;;
	*)
		TARGET_DIR="$arg"
		;;
	esac
done

if [[ ! -d "$TARGET_DIR" ]]; then
	echo "Error: '$TARGET_DIR' is not a directory" >&2
	exit 1
fi

do_convert_webp() {
	local dir="$1" file="$2"
	local dst="${file%.*}.webp"

	if [[ -e "$dir/$dst" ]]; then
		echo "SKIP (exists): $dir/$file -> $dir/$dst"
		return
	fi

	if $DRY_RUN; then
		echo "[DRY-RUN] CONVERT $dir/$file -> $dir/$dst"
	else
		cwebp -q "$QUALITY" "$dir/$file" -o "$dir/$dst" -mt -quiet
		rm -f "$dir/$file"
		echo "Converted $dir/$file -> $dir/$dst"
	fi
}

shopt -s nullglob
files=("$TARGET_DIR"/*.jpg "$TARGET_DIR"/*.jpeg "$TARGET_DIR"/*.png "$TARGET_DIR"/*.JPG "$TARGET_DIR"/*.JPEG "$TARGET_DIR"/*.PNG)

for f in "${files[@]}"; do
	do_convert_webp "$TARGET_DIR" "$(basename "$f")"
done

if $DRY_RUN; then
	echo
	echo "Dry-run complete. Re-run with --apply to convert and delete originals."
fi
