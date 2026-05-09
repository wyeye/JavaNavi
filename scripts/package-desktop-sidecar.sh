#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
RESOURCE_DIR="$ROOT_DIR/src-tauri/resources"
RESOURCE_JAR="$RESOURCE_DIR/javanavi-backend.jar"
RESOURCE_RUNTIME_DIR="$RESOURCE_DIR/java-runtime"
TAURI_RELEASE_RESOURCE_DIR="$ROOT_DIR/src-tauri/target/release/resources"
JAVANAVI_DESKTOP_BUNDLE_JRE="${JAVANAVI_DESKTOP_BUNDLE_JRE:-1}"
# Spring Boot's configuration binder uses java.beans.PropertyEditorSupport from java.desktop.
# DM JDBC also touches javax.sql.rowset.spi.SyncProviderException from java.sql.rowset.
JAVANAVI_DESKTOP_JLINK_MODULES="${JAVANAVI_DESKTOP_JLINK_MODULES:-java.base,java.logging,java.naming,java.management,java.instrument,java.sql,java.sql.rowset,java.xml,java.net.http,jdk.crypto.ec,jdk.unsupported,java.security.sasl,java.security.jgss,jdk.charsets,java.desktop}"

canonical_path() {
  local path="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -am "$path"
  else
    printf '%s\n' "$path"
  fi
}

safe_rm_under_root() {
  local target root_canonical
  root_canonical="$(canonical_path "$ROOT_DIR")"
  for target in "$@"; do
    if [[ -z "$target" ]]; then
      echo "Refusing to remove an empty path" >&2
      exit 1
    fi
    local parent resolved resolved_canonical
    parent="$(dirname "$target")"
    mkdir -p "$parent"
    resolved="$(cd "$parent" && pwd -P)/$(basename "$target")"
    resolved_canonical="$(canonical_path "$resolved")"
    case "$resolved_canonical" in
      "$root_canonical"/*) rm -rf "$resolved" ;;
      *)
        echo "Refusing to remove path outside repository: $target" >&2
        exit 1
        ;;
    esac
  done
}

"$ROOT_DIR/scripts/package-web.sh"

BACKEND_VERSION="$(awk '
  /<artifactId>javanavi-backend<\/artifactId>/ { found = 1; next }
  found && /<version>/ {
    sub(/.*<version>/, "")
    sub(/<\/version>.*/, "")
    print
    exit
  }
' "$BACKEND_DIR/pom.xml")"
if [[ -z "$BACKEND_VERSION" ]]; then
  echo "Unable to read javanavi-backend version from $BACKEND_DIR/pom.xml" >&2
  exit 1
fi
SOURCE_JAR="$BACKEND_DIR/target/javanavi-backend-$BACKEND_VERSION.jar"

if [[ ! -f "$SOURCE_JAR" ]]; then
  echo "Expected Java Web jar not found: $SOURCE_JAR" >&2
  exit 1
fi

mkdir -p "$RESOURCE_DIR"
cp "$SOURCE_JAR" "$RESOURCE_JAR"

java_binary_name() {
  case "${JAVANAVI_DESKTOP_RUNTIME_PLATFORM:-$(uname -s | tr '[:upper:]' '[:lower:]')}" in
    *mingw*|*msys*|*cygwin*|*windows*|win*) printf 'java.exe' ;;
    *) printf 'java' ;;
  esac
}

runtime_java_path() {
  printf '%s/bin/%s' "$1" "$(java_binary_name)"
}

copy_prebuilt_runtime() {
  local source_dir="$1"
  local java_path
  java_path="$(runtime_java_path "$source_dir")"
  if [[ ! -f "$java_path" ]]; then
    echo "Prebuilt Java runtime is missing $java_path" >&2
    exit 1
  fi
  safe_rm_under_root "$RESOURCE_RUNTIME_DIR"
  mkdir -p "$RESOURCE_RUNTIME_DIR"
  (cd "$source_dir" && tar cf - .) | (cd "$RESOURCE_RUNTIME_DIR" && tar xf -)
}

copy_runtime_archive() {
  local archive="$1"
  if [[ ! -f "$archive" ]]; then
    echo "Java runtime archive not found: $archive" >&2
    exit 1
  fi
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  case "$archive" in
    *.zip)
      if ! command -v unzip >/dev/null 2>&1; then
        echo "unzip is required to extract $archive" >&2
        exit 1
      fi
      unzip -q "$archive" -d "$tmp_dir"
      ;;
    *.tar|*.tar.gz|*.tgz)
      tar xf "$archive" -C "$tmp_dir"
      ;;
    *)
      echo "Unsupported Java runtime archive format: $archive" >&2
      exit 1
      ;;
  esac
  local java_path
  java_path="$(find "$tmp_dir" -path "*/bin/$(java_binary_name)" -type f | head -n 1)"
  if [[ -z "$java_path" ]]; then
    echo "Could not find bin/$(java_binary_name) inside $archive" >&2
    exit 1
  fi
  copy_prebuilt_runtime "$(cd "$(dirname "$java_path")/.." && pwd)"
  rm -rf "$tmp_dir"
}

find_jdk_home() {
  if [[ -n "${JAVANAVI_DESKTOP_JAVA_HOME:-}" ]]; then
    printf '%s\n' "$JAVANAVI_DESKTOP_JAVA_HOME"
    return 0
  fi
  if [[ -n "${JAVA_HOME:-}" ]]; then
    printf '%s\n' "$JAVA_HOME"
    return 0
  fi
  if command -v javac >/dev/null 2>&1; then
    local javac_path
    javac_path="$(readlink -f "$(command -v javac)")"
    printf '%s\n' "$(cd "$(dirname "$javac_path")/.." && pwd)"
    return 0
  fi
  if command -v java >/dev/null 2>&1; then
    local java_path
    java_path="$(readlink -f "$(command -v java)")"
    printf '%s\n' "$(cd "$(dirname "$java_path")/.." && pwd)"
    return 0
  fi
  return 1
}

build_jlink_runtime() {
  local jdk_home="$1"
  local jlink="$jdk_home/bin/jlink"
  local java="$jdk_home/bin/java"
  if [[ ! -x "$jlink" ]]; then
    echo "jlink not found at $jlink; set JAVANAVI_DESKTOP_RUNTIME_DIR to a prebuilt runtime or JAVANAVI_DESKTOP_JAVA_HOME to a JDK." >&2
    exit 1
  fi
  if [[ ! -x "$java" ]]; then
    echo "java not found at $java" >&2
    exit 1
  fi
  safe_rm_under_root "$RESOURCE_RUNTIME_DIR"
  local options=(
    --add-modules "$JAVANAVI_DESKTOP_JLINK_MODULES"
    --no-header-files
    --no-man-pages
    --compress=2
    --output "$RESOURCE_RUNTIME_DIR"
  )
  if command -v objcopy >/dev/null 2>&1; then
    options=(--strip-debug "${options[@]}")
  else
    echo "DESKTOP_JRE_STRIP_DEBUG=skipped(objcopy-unavailable)" >&2
  fi
  "$jlink" "${options[@]}"
}

if [[ "$JAVANAVI_DESKTOP_BUNDLE_JRE" != "0" && "$JAVANAVI_DESKTOP_BUNDLE_JRE" != "false" && "$JAVANAVI_DESKTOP_BUNDLE_JRE" != "no" ]]; then
  if [[ -n "${JAVANAVI_DESKTOP_RUNTIME_ARCHIVE:-}" ]]; then
    copy_runtime_archive "$JAVANAVI_DESKTOP_RUNTIME_ARCHIVE"
    printf 'DESKTOP_BUNDLED_JRE_SOURCE=%s\n' "$JAVANAVI_DESKTOP_RUNTIME_ARCHIVE"
  elif [[ -n "${JAVANAVI_DESKTOP_RUNTIME_DIR:-}" ]]; then
    copy_prebuilt_runtime "$JAVANAVI_DESKTOP_RUNTIME_DIR"
    printf 'DESKTOP_BUNDLED_JRE_SOURCE=%s\n' "$JAVANAVI_DESKTOP_RUNTIME_DIR"
  else
    JDK_HOME="$(find_jdk_home)"
    build_jlink_runtime "$JDK_HOME"
    printf 'DESKTOP_BUNDLED_JRE_SOURCE=%s\n' "$JDK_HOME"
  fi
  BUNDLED_JAVA="$(runtime_java_path "$RESOURCE_RUNTIME_DIR")"
  if [[ ! -f "$BUNDLED_JAVA" ]]; then
    echo "Bundled Java runtime was not created correctly: $BUNDLED_JAVA" >&2
    exit 1
  fi
  if [[ ! -x "$BUNDLED_JAVA" ]]; then
    chmod +x "$BUNDLED_JAVA" 2>/dev/null || true
  fi
  chmod -R u+rwX,go+rX "$RESOURCE_RUNTIME_DIR" 2>/dev/null || true
  printf 'DESKTOP_BUNDLED_JRE=%s\n' "$RESOURCE_RUNTIME_DIR"
  printf 'DESKTOP_BUNDLED_JRE_SIZE_MB=%s\n' "$(du -sm "$RESOURCE_RUNTIME_DIR" | awk '{print $1}')"
else
  safe_rm_under_root "$RESOURCE_RUNTIME_DIR"
  printf 'DESKTOP_BUNDLED_JRE=disabled\n'
fi

# Tauri preserves read-only legal file permissions when copying resources into
# target/release/resources. A later rebuild can then fail while overwriting those
# stale files, so clear only the generated resource mirror before native build.
safe_rm_under_root "$TAURI_RELEASE_RESOURCE_DIR/java-runtime" "$TAURI_RELEASE_RESOURCE_DIR/javanavi-backend.jar" 2>/dev/null || true

printf 'DESKTOP_JLINK_MODULES=%s\n' "$JAVANAVI_DESKTOP_JLINK_MODULES"
printf 'DESKTOP_SIDECAR_JAR=%s\n' "$RESOURCE_JAR"
printf 'DESKTOP_SIDECAR_STAGE=passed\n'
