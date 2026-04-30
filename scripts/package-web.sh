#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
STATIC_DIR="$BACKEND_DIR/src/main/resources/static"
TARGET_STATIC_DIR="$BACKEND_DIR/target/classes/static"
BACKEND_JAR="$BACKEND_DIR/target/javanavi-backend-0.1.0.jar"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
MAVEN_REPO="${MAVEN_REPO:-$ROOT_DIR/.m2/repository}"
MAVEN_PROFILES="${MAVEN_PROFILES:-}"
MAVEN_EXTRA_ARGS="${MAVEN_EXTRA_ARGS:-}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command npm
require_command mvn

if [[ ! -d "$JAVA_HOME" ]]; then
  echo "JAVA_HOME does not exist: $JAVA_HOME" >&2
  echo "Set JAVA_HOME to a Java 17+ installation and rerun." >&2
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
rm -rf "$STATIC_DIR" "$TARGET_STATIC_DIR"
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
    # shellcheck disable=SC2206
    EXTRA_ARGS=($MAVEN_EXTRA_ARGS)
    MAVEN_ARGS+=("${EXTRA_ARGS[@]}")
  fi
  mvn "${MAVEN_ARGS[@]}" package
)

JAR_PATH="$BACKEND_DIR/target/javanavi-backend-0.1.0.jar"
if [[ ! -f "$JAR_PATH" ]]; then
  echo "Expected jar not found: $JAR_PATH" >&2
  exit 1
fi

if ! "$JAVA_HOME/bin/jar" tf "$JAR_PATH" | grep -q 'BOOT-INF/classes/static/index.html'; then
  echo "Packaged jar does not contain React static index.html" >&2
  exit 1
fi

printf 'WEB_PACKAGE_JAR=%s\n' "$JAR_PATH"
printf 'WEB_PACKAGE_BUILD=passed\n'
