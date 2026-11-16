#!/usr/bin/env bash
# Build + deploy to devnet. Fails loudly (a silent failed deploy leaves the old binary live).
set -eo pipefail
cd "$(dirname "$0")/.."
PROGRAM=7hnz4i1zaz3UPW1eNzpTonN5GeLRCyVMSnpk5tTHKzTD
KEY=~/.config/solana/breakroom-devnet.json
RPC=https://rpc.magicblock.app/devnet
cargo build-sbf
anchor idl build -o target/idl/breakroom.json
cp target/idl/breakroom.json app/src/idl/
SIZE=$(stat -f%z target/deploy/breakroom.so)
MAX=$(solana program show $PROGRAM -u devnet | awk '/Data Length/ {print $3}')
if [ "$SIZE" -gt "$MAX" ]; then
  echo "program $SIZE > allocated $MAX: extending"
  solana program extend $PROGRAM $((SIZE - MAX + 40000)) -k $KEY -u devnet
fi
solana program deploy target/deploy/breakroom.so --program-id $PROGRAM -k $KEY -u $RPC --max-sign-attempts 60
solana program dump $PROGRAM /tmp/breakroom_dump.so -u devnet >/dev/null
python3 -c "import sys; a=open('/tmp/breakroom_dump.so','rb').read(); b=open('target/deploy/breakroom.so','rb').read(); sys.exit(0 if a[:len(b)]==b else 1)" && echo "deployed program matches the build"
