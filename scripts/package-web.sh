#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
STATIC_DIR="$BACKEND_DIR/src/main/resources/static"
TARGET_STATIC_DIR="$BACKEND_DIR/target/classes/static"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
MAVEN_REPO="${MAVEN_REPO:-$ROOT_DIR/.m2/repository}"
MAVEN_PROFILES="${MAVEN_PROFILES:-}"
MAVEN_EXTRA_ARGS="${MAVEN_EXTRA_ARGS:-}"
JAR_TOOL=""

safe_rm_under_root() {
  local target
  for target in "$@"; do
    if [[ -z "$target" ]]; then
      echo "Refusing to remove an empty path" >&2
      exit 1
    fi
    local parent resolved
    parent="$(dirname "$target")"
    mkdir -p "$parent"
    resolved="$(cd "$parent" && pwd -P)/$(basename "$target")"
    case "$resolved" in
      "$ROOT_DIR"/*) rm -rf "$resolved" ;;
      *)
        echo "Refusing to remove path outside repository: $target" >&2
        exit 1
        ;;
    esac
  done
}

read_maven_extra_args() {
  if [[ -z "$MAVEN_EXTRA_ARGS" ]]; then
    return 0
  fi
  local -a extra_args=()
  local arg
  read -r -a extra_args <<< "$MAVEN_EXTRA_ARGS"
  for arg in "${extra_args[@]}"; do
    case "$arg" in
      -D*|-P*|--batch-mode|--offline|--no-transfer-progress|-U) printf '%s\0' "$arg" ;;
      *)
        echo "Unsupported MAVEN_EXTRA_ARGS entry: $arg" >&2
        echo "Allowed prefixes: -D, -P, --batch-mode, --offline, --no-transfer-progress, -U" >&2
        exit 1
        ;;
    esac
  done
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

resolve_jar_tool() {
  local candidate
  for candidate in "$JAVA_HOME/bin/jar" "$JAVA_HOME/bin/jar.exe"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

assert_jar_entry() {
  local entry="$1"
  local description="$2"
  if ! grep -Fxq "$entry" <<< "$JAR_ENTRIES"; then
    echo "Packaged jar does not contain $description: $entry" >&2
    exit 1
  fi
}

assert_jar_prefix() {
  local prefix="$1"
  local description="$2"
  if ! grep -Fq "$prefix" <<< "$JAR_ENTRIES"; then
    echo "Packaged jar does not contain $description under: $prefix" >&2
    exit 1
  fi
}

assert_boot_manifest() {
  local jar_path="$1"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN
  (
    cd "$tmp_dir"
    "$JAR_TOOL" xf "$jar_path" META-INF/MANIFEST.MF
  )
  if [[ ! -f "$tmp_dir/META-INF/MANIFEST.MF" ]]; then
    echo "Packaged jar does not contain META-INF/MANIFEST.MF" >&2
    exit 1
  fi
  local manifest
  manifest="$(tr -d '\r' < "$tmp_dir/META-INF/MANIFEST.MF")"
  if ! grep -Fqx "Main-Class: org.springframework.boot.loader.launch.JarLauncher" <<< "$manifest"; then
    echo "Packaged jar manifest does not point to Spring Boot JarLauncher" >&2
    exit 1
  fi
  if ! grep -Fqx "Start-Class: com.javanavi.JavaNaviApplication" <<< "$manifest"; then
    echo "Packaged jar manifest does not point to com.javanavi.JavaNaviApplication" >&2
    exit 1
  fi
  trap - RETURN
  rm -rf "$tmp_dir"
}

require_command npm
require_command mvn

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
BACKEND_JAR="$BACKEND_DIR/target/javanavi-backend-$BACKEND_VERSION.jar"

if [[ ! -d "$JAVA_HOME" ]]; then
  echo "JAVA_HOME does not exist: $JAVA_HOME" >&2
  echo "Set JAVA_HOME to a Java 17+ installation and rerun." >&2
  exit 1
fi
if ! JAR_TOOL="$(resolve_jar_tool)"; then
  echo "JAVA_HOME does not provide an executable jar tool under: $JAVA_HOME/bin" >&2
  echo "Set JAVA_HOME to a Java 17+ JDK and rerun." >&2
  exit 1
fi

export JAVA_HOME
mkdir -p "$MAVEN_REPO"

printf '\n== Build React static assets ==\n'
(
  cd "$FRONTEND_DIR"
  npm ci
  npm run build
)

printf '\n== Stage React assets for Spring Boot ==\n'
safe_rm_under_root "$STATIC_DIR" "$TARGET_STATIC_DIR"
mkdir -p "$STATIC_DIR"
cp -R "$FRONTEND_DIR/dist/." "$STATIC_DIR/"
rm -f "$BACKEND_JAR" "$BACKEND_JAR.original"

printf '\n== Build Java Web package ==\n'
(
  cd "$BACKEND_DIR"
  MAVEN_ARGS=(-Dmaven.repo.local="$MAVEN_REPO" -DskipTests)
  if [[ -n "$MAVEN_PROFILES" ]]; then
    MAVEN_ARGS+=("-P$MAVEN_PROFILES")
  fi
  if [[ -n "$MAVEN_EXTRA_ARGS" ]]; then
    while IFS= read -r -d '' arg; do
      MAVEN_ARGS+=("$arg")
    done < <(read_maven_extra_args)
  fi
  mvn "${MAVEN_ARGS[@]}" package
)

JAR_PATH="$BACKEND_JAR"
if [[ ! -f "$JAR_PATH" ]]; then
  echo "Expected jar not found: $JAR_PATH" >&2
  exit 1
fi

JAR_ENTRIES="$("$JAR_TOOL" tf "$JAR_PATH")"
assert_jar_entry "BOOT-INF/classes/static/index.html" "React static index.html"
assert_jar_entry "BOOT-INF/classes/com/javanavi/JavaNaviApplication.class" "JavaNavi Spring Boot application class"
assert_jar_entry "org/springframework/boot/loader/launch/JarLauncher.class" "Spring Boot JarLauncher"
assert_jar_prefix "BOOT-INF/lib/" "Spring Boot nested dependencies"
assert_boot_manifest "$JAR_PATH"

printf 'WEB_PACKAGE_JAR=%s\n' "$JAR_PATH"
printf 'WEB_PACKAGE_BOOT_JAR=verified\n'
printf 'WEB_PACKAGE_BUILD=passed\n'
