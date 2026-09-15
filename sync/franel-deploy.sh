#!/usr/bin/env bash
# Franel sync daemon — VPS installer (run as adorneltarget)
# Assumes franel_sync.py + franel-sync.service were scp'ed to /tmp.
set -euo pipefail

APP=/home/adorneltarget/franel-sync
ENVF=/home/adorneltarget/.config/franel-sync.env

mkdir -p "$APP" /home/adorneltarget/.config
install -m 755 /tmp/franel_sync.py "$APP/franel_sync.py"
# User-level unit (like hermes-gateway.service) — no sudo needed,
# persists across reboots because linger is enabled for this user.
UNIT_D=$HOME/.config/systemd/user
mkdir -p "$UNIT_D"
install -m 644 /tmp/franel-sync.service "$UNIT_D/franel-sync.service"
# If an older system-level unit was ever installed, drop it (needs root to unload).
rm -f /etc/systemd/system/franel-sync.service 2>/dev/null || true

if [ ! -f "$ENVF" ]; then
  cat > "$ENVF" <<'EOF'
# Franel sync daemon config — keep this file 600, never share it.
SUPABASE_URL=https://qsqlipuyosgdzyphcfts.supabase.co
# Supabase -> Project Settings -> API -> "service_role" (secret). Paste below.
SUPABASE_SERVICE_KEY=__PASTE_SERVICE_ROLE_KEY__
# Must match the fixed clinic UUID seeded by migration 0003.
FRANEL_CLINIC_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
BRIDGE_URL=http://localhost:3000
# Optional: force a specific python for google_api.py calls (auto-detected by default).
# FRANEL_GAPI_PYTHON=/home/adorneltarget/.hermes/hermes-agent/venv/bin/python3
EOF
  chmod 600 "$ENVF"
  echo "created $ENVF (template)"
fi

python3 -m py_compile "$APP/franel_sync.py"
echo "py_compile OK"

if grep -q "__PASTE_SERVICE_ROLE_KEY__" "$ENVF"; then
  echo
  echo "SUPABASE_SERVICE_KEY is still the placeholder — service NOT started."
  echo "1) apply dashboard/supabase/migrations/0002 and 0003 in the Supabase SQL editor"
  echo "2) put the service_role key into $ENVF"
  echo "3) re-run this script"
  exit 0
fi

echo
echo "checking clinic row exists in Supabase (needs migration 0003)..."
SURL=$(grep -E '^SUPABASE_URL=' "$ENVF" | cut -d= -f2-)
SKEY=$(grep -E '^SUPABASE_SERVICE_KEY=' "$ENVF" | cut -d= -f2-)
CID=$(grep -E '^FRANEL_CLINIC_ID=' "$ENVF" | cut -d= -f2-)
HIT=$(curl -s --max-time 10 -H "apikey: $SKEY" -H "Authorization: Bearer $SKEY" \
  "$SURL/rest/v1/clinics?id=eq.$CID&select=id" 2>/dev/null || echo "")
if [ "$HIT" = "[]" ] || [ -z "$HIT" ]; then
  echo
  echo "clinic $CID not visible in Supabase — apply migration 0003 (seed),"
  echo "and 0002, in the SQL editor, then re-run this script."
  exit 1
fi
echo "clinic found."

echo
echo "dry-run check (read-only)..."
BEFORE=$(wc -l < "$APP/sync.log" 2>/dev/null || echo 0)
python3 "$APP/franel_sync.py" --once --dry-run || true
tail -n +"$((BEFORE + 1))" "$APP/sync.log" 2>/dev/null > /tmp/franel-dry.log || true
echo
echo "--- this dry run's log ---"
cat /tmp/franel-dry.log 2>/dev/null || true
if grep -q "PGRST204\|could not find column" /tmp/franel-dry.log 2>/dev/null; then
  echo
  echo "WARNING: Supabase is missing the 0002/0003 columns or seed. Apply those"
  echo "migrations first, then re-run this script."
  exit 1
fi

# User-level service: linger must be enabled so it survives logout/reboot.
LINGER=$(loginctl show-user "$(id -un)" 2>/dev/null | awk -F= '/^Linger=/{print $2}')
if [ "$LINGER" != "yes" ]; then
  echo
  echo "WARNING: linger is not enabled, so the user service will STOP at logout."
  echo "Run (as root):  sudo loginctl enable-linger $(id -un)"
fi

export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user daemon-reload
systemctl --user enable franel-sync.service
systemctl --user restart franel-sync.service
sleep 3
systemctl --user --no-pager status franel-sync.service || true
echo
echo "--- last log lines ---"
tail -n 30 "$APP/sync.log" 2>/dev/null || true
echo "install complete"