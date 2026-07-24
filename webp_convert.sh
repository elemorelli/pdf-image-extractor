#!/usr/bin/env bash
# Converts jpg/png images in one or more directories to webp, deleting the
# originals. Dry-run by default; pass --apply to actually convert and
# delete. Multiple directories share one combined progress count.
#
# Requires: libwebp-tools (cwebp). Fedora: sudo dnf install libwebp-tools

set -euo pipefail

emit_progress() {
	local stage="$1" done="${2:-}" total="${3:-}"
	if [[ -n "$done" && -n "$total" ]]; then
		printf '##PROGRESS##{"stage":"%s","done":%s,"total":%s}\n' "$stage" "$done" "$total"
	else
		printf '##PROGRESS##{"stage":"%s"}\n' "$stage"
	fi
}

DRY_RUN=true
QUALITY=90
TARGET_DIRS=()

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
		TARGET_DIRS+=("$arg")
		;;
	esac
done

if [[ ${#TARGET_DIRS[@]} -eq 0 ]]; then
	TARGET_DIRS=(".")
fi

for dir in "${TARGET_DIRS[@]}"; do
	if [[ ! -d "$dir" ]]; then
		echo "Error: '$dir' is not a directory" >&2
		exit 1
	fi
done

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

all_files=()
for dir in "${TARGET_DIRS[@]}"; do
	for f in "$dir"/*.jpg "$dir"/*.jpeg "$dir"/*.png "$dir"/*.JPG "$dir"/*.JPEG "$dir"/*.PNG; do
		all_files+=("$dir|$(basename "$f")")
	done
done

total=${#all_files[@]}
i=0
emit_progress "webp" 0 "$total"
for entry in "${all_files[@]}"; do
	dir="${entry%%|*}"
	file="${entry#*|}"
	do_convert_webp "$dir" "$file"
	i=$((i + 1))
	emit_progress "webp" "$i" "$total"
done

if $DRY_RUN; then
	echo
	echo "Dry-run complete. Re-run with --apply to convert and delete originals."
fi
