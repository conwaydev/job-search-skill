#!/bin/sh
# Installs Node (current LTS) into <workspace>/.runtime/node for this folder only.
# No admin rights, nothing system-wide. Then installs the skill's dependencies
# and puts Node on the PATH for Claude via .claude/settings.local.json.
#
#   sh .claude/skills/job-search/setup/install-node.sh
#
# Safe to re-run. Mac and Linux.
set -eu

SKILL_DIR=$(cd "$(dirname "$0")/.." && pwd)
WORKSPACE=$(cd "$SKILL_DIR/../../.." && pwd)
RUNTIME="$WORKSPACE/.runtime"
DEST="$RUNTIME/node"

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "Unsupported system: $(uname -s)"; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=x64 ;;
  *) echo "Unsupported processor: $(uname -m)"; exit 1 ;;
esac

TMP="$RUNTIME/tmp"
mkdir -p "$TMP"

echo "Finding the current Node LTS release..."
curl -fsSL https://nodejs.org/dist/index.json -o "$TMP/index.json" || { echo "Could not reach nodejs.org. Check the internet connection."; exit 1; }
VERSION=$(tr '{' '\n' < "$TMP/index.json" | grep '"lts":"' | head -1 | sed 's/.*"version":"\([^"]*\)".*/\1/')
[ -n "$VERSION" ] || { echo "Could not read the Node release list."; exit 1; }

NAME="node-$VERSION-$OS-$ARCH"
echo "Downloading $NAME..."
curl -fsSL "https://nodejs.org/dist/$VERSION/$NAME.tar.gz" -o "$TMP/$NAME.tar.gz"
curl -fsSL "https://nodejs.org/dist/$VERSION/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"

echo "Checking the download..."
EXPECTED=$(grep " $NAME.tar.gz\$" "$TMP/SHASUMS256.txt" | cut -d' ' -f1)
ACTUAL=$(shasum -a 256 "$TMP/$NAME.tar.gz" 2>/dev/null | cut -d' ' -f1 || sha256sum "$TMP/$NAME.tar.gz" | cut -d' ' -f1)
[ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || { echo "The download did not match its checksum. Nothing was installed."; rm -rf "$TMP"; exit 1; }

tar -xzf "$TMP/$NAME.tar.gz" -C "$TMP"
rm -rf "$DEST"
mv "$TMP/$NAME" "$DEST"
rm -rf "$TMP"
BIN="$DEST/bin"
echo "Node $VERSION installed in $DEST"

echo "Installing the skill's dependencies..."
(cd "$SKILL_DIR" && PATH="$BIN:$PATH" "$BIN/npm" ci --no-audit --no-fund --loglevel=error)

PATH="$BIN:$PATH" "$BIN/node" "$SKILL_DIR/setup/write-path.mjs" "$WORKSPACE" "$BIN"
echo "Done."
