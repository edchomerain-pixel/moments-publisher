#!/usr/bin/env bash
# Deterministic resizing only; preserve the supplied artwork, background and layout.
set -eu
cd "$(dirname "$0")/.."
source_file=public/branding/bashang-logo.png
logo_hash=$(sha256sum "$source_file" | cut -c1-8)
for size in 32 180 192 512; do
  magick "$source_file" -resize "${size}x${size}" -strip "PNG24:public/icons/bashang-${logo_hash}-${size}.png"
done
# Keep earlier install URLs usable, serving the same official artwork.
cp "public/icons/bashang-${logo_hash}-180.png" public/icons/apple-touch-icon.png
cp "public/icons/bashang-${logo_hash}-192.png" public/icons/icon-192.png
cp "public/icons/bashang-${logo_hash}-512.png" public/icons/icon-512.png
