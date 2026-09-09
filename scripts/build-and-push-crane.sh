#!/usr/bin/env bash
set -euo pipefail

image="${IMAGE:?IMAGE is required}"
platform="${PLATFORM:-linux/amd64}"
base_image="${BASE_IMAGE:-nginx:stable-alpine}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
site_root="$(cd "${script_dir}/.." && pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

test "${platform}" = "linux/amd64" || { printf 'Refusing unsupported platform: %s\n' "${platform}" >&2; exit 1; }
command -v crane >/dev/null || { printf 'crane is required\n' >&2; exit 1; }
command -v jq >/dev/null || { printf 'jq is required\n' >&2; exit 1; }

mkdir -p "${tmpdir}/rootfs/etc/nginx/conf.d" "${tmpdir}/rootfs/usr/share/nginx/html"
install -m 0644 "${site_root}/nginx.conf" "${tmpdir}/rootfs/etc/nginx/conf.d/default.conf"
cp -R "${site_root}/public/." "${tmpdir}/rootfs/usr/share/nginx/html/"

if command -v xattr >/dev/null 2>&1; then
  xattr -cr "${tmpdir}/rootfs"
fi
COPYFILE_DISABLE=1 tar --no-xattrs -C "${tmpdir}/rootfs" -czf "${tmpdir}/site-layer.tar.gz" .

crane append \
  --platform "${platform}" \
  --base "${base_image}" \
  --new_layer "${tmpdir}/site-layer.tar.gz" \
  --new_tag "${image}" \
  --set-base-image-annotations

crane config --platform "${platform}" "${image}" | jq -e \
  '.architecture == "amd64" and .os == "linux"' >/dev/null

printf 'Published %s\n' "${image}"
printf 'Platform: %s\n' "$(crane config --platform "${platform}" "${image}" | jq -r '.os + "/" + .architecture')"
printf 'Digest: %s\n' "$(crane digest "${image}")"
