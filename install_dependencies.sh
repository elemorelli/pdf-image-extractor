#!/usr/bin/env bash
# Installs the tools pdf_extract.sh and webp_convert.sh depend on.
# Supports dnf (Fedora/RHEL) and apt (Debian/Ubuntu).

set -euo pipefail

# Re-invoke with sudo if not already running as root.
if ((EUID != 0)); then
	exec sudo "$0" "$@"
fi

if command -v dnf >/dev/null 2>&1; then
	echo "Detected dnf, installing poppler-utils, ImageMagick, libwebp-tools"
	dnf install -y poppler-utils ImageMagick libwebp-tools
elif command -v apt >/dev/null 2>&1; then
	echo "Detected apt, installing poppler-utils, imagemagick, webp"
	apt update
	apt install -y poppler-utils imagemagick webp
else
	echo "No supported package manager found (looked for dnf, apt)." >&2
	echo "Install these manually: poppler-utils (pdfimages), ImageMagick (convert/mogrify/identify), webp tools (cwebp)." >&2
	exit 1
fi

echo
echo "Verifying tools..."
missing=0
for tool in pdfimages convert mogrify identify cwebp; do
	if command -v "$tool" >/dev/null 2>&1; then
		echo "  OK: $tool -> $(command -v "$tool")"
	else
		echo "  MISSING: $tool"
		missing=1
	fi
done

((missing == 0)) || exit 1
