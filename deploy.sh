#!/bin/bash
set -euo pipefail

# Builds the plugin and publishes it to Windy.
#
# The publishing key is never kept in this repo. It comes from the WINDY_API_KEY env var,
# or from a gitignored .secret-api-key.sh next to this file (export WINDY_API_KEY=...).
# Windy refuses a version it already has: bump it in package.json and src/pluginConfig.ts first.
if [ -f .secret-api-key.sh ]; then
    # shellcheck disable=SC1091
    source .secret-api-key.sh
fi
: "${WINDY_API_KEY:?WINDY_API_KEY not set: export it, or add it to .secret-api-key.sh}"

# Windy records where a build came from, as its own GitHub workflow does
REPOSITORY=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
OWNER=${REPOSITORY%%/*}
SHA=$(git rev-parse HEAD)

echo "Building plugin..."
npm run build

cd dist

# What Windy publishes, and the plugin shows in its menu, is the version in src/pluginConfig.ts
node -e "
const shown = require('./plugin.json').version;
const pkg = require('../package.json').version;
if (shown !== pkg) {
    console.error('Version mismatch: src/pluginConfig.ts has ' + shown + ', package.json has ' + pkg);
    process.exit(1);
}
"

echo "Creating plugin archive..."
REPOSITORY="$REPOSITORY" OWNER="$OWNER" SHA="$SHA" node -e "
const fs = require('fs');
const info = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
const { REPOSITORY, OWNER, SHA } = process.env;
Object.assign(info, { repositoryName: REPOSITORY, commitSha: SHA, repositoryOwner: OWNER });
fs.writeFileSync('plugin.json', JSON.stringify(info));
"
# Only what Windy serves: the minified plugin, its metadata and the screenshot
tar cf ./plugin.tar \
    --exclude='./plugin.tar' \
    --exclude='*.map' \
    --exclude='plugin.js' \
    .

echo "Publishing plugin..."
curl -s --fail-with-body -XPOST 'https://node.windy.com/plugins/v1.0/upload' \
    -H "x-windy-api-key: ${WINDY_API_KEY}" \
    -F "plugin_archive=@./plugin.tar"

rm ./plugin.tar
echo ""
echo "Done!"
