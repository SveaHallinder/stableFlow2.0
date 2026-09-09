#!/usr/bin/env bash
# Sätter Vault-secret 'service_role_key' + app.settings.supabase_url på staging.
# Nyckeln matas in tyst (read -s) → syns ej, hamnar ej i shell-historik.
set -euo pipefail
cd /Users/admin/stableFlow2.0
set -a; source .env; set +a
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
PGURI="host=db.zbcghmpjslasnxqcodqa.supabase.co port=5432 dbname=postgres user=postgres sslmode=require connect_timeout=10"

echo "Hämta projektets SERVICE_ROLE-nyckel:"
echo "  Dashboard -> Project Settings -> API -> 'service_role' (secret)"
echo "Klistra in den nedan (den visas INTE):"
read -rs -p "service_role key: " SRK
echo
if [ -z "$SRK" ]; then echo "Ingen nyckel angiven — avbryter."; exit 1; fi

echo "== sätter app.settings.supabase_url =="
psql "$PGURI" -v ON_ERROR_STOP=1 \
  -c "alter database postgres set \"app.settings.supabase_url\" = 'https://zbcghmpjslasnxqcodqa.supabase.co';"

echo "== sätter Vault-secret 'service_role_key' (idempotent) =="
psql "$PGURI" -v ON_ERROR_STOP=1 -v srk="$SRK" <<'SQL'
delete from vault.secrets where name = 'service_role_key';
select vault.create_secret(:'srk', 'service_role_key',
  'Used by notify_push to authenticate calls to the send-push-notification edge function');
SQL

echo "== verifiering (visar EJ nyckeln) =="
psql "$PGURI" -c "select name, created_at from vault.secrets where name = 'service_role_key';"
psql "$PGURI" -t -A -c "select 'supabase_url = '||coalesce(current_setting('app.settings.supabase_url', true),'<MISSING>');"
echo "== KLART — Vault-secret satt. =="
