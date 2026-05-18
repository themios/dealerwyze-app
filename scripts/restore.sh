#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DealerWyze Database Restore Script
# Restores from Cloudflare R2 encrypted backup at various granularities.
#
# Requirements (must be installed locally):
#   - aws CLI        → brew install awscli
#   - openssl        → ships with macOS
#   - psql           → brew install postgresql
#   - grep / awk     → ships with macOS
#
# Usage:
#   chmod +x scripts/restore.sh
#   ./scripts/restore.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Load credentials ─────────────────────────────────────────────────────────
# Look for .env.local first, then fall back to .env
ENV_FILE=""
if [[ -f ".env.local" ]]; then ENV_FILE=".env.local"
elif [[ -f ".env" ]];       then ENV_FILE=".env"
fi

if [[ -n "$ENV_FILE" ]]; then
  # Export only the vars we need — don't pollute the shell environment
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    value="${value%\"}"
    value="${value#\"}"
    case "$key" in
      R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_BUCKET_NAME) export "$key=$value" ;;
    esac
  done < "$ENV_FILE"
fi

# Allow overrides via environment variables
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-dealerwyze-backups}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# ── Preflight checks ─────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in aws openssl psql grep awk; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${RED}Missing required tools: ${missing[*]}${RESET}"
    echo "Install with: brew install awscli postgresql"
    exit 1
  fi

  if [[ -z "$R2_ACCOUNT_ID" || -z "$R2_ACCESS_KEY_ID" || -z "$R2_SECRET_ACCESS_KEY" ]]; then
    echo -e "${RED}R2 credentials not found.${RESET}"
    echo "Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY to .env.local"
    exit 1
  fi
}

# ── AWS / R2 helper ───────────────────────────────────────────────────────────
r2() {
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="auto" \
  aws "$@" --endpoint-url "$R2_ENDPOINT" 2>/dev/null
}

# ── Download + decrypt + decompress a backup file ────────────────────────────
# Usage: fetch_backup <r2_key> <output_sql_path>
fetch_backup() {
  local r2_key="$1"
  local out_sql="$2"
  local enc_file
  enc_file="$(mktemp /tmp/dw_backup_XXXXXX.sql.gz.enc)"
  local gz_file="${enc_file%.enc}"

  echo -e "\n${CYAN}Downloading from R2…${RESET}"
  r2 s3 cp "s3://${R2_BUCKET_NAME}/${r2_key}" "$enc_file"

  echo -e "${CYAN}Decrypting…${RESET}"
  read -rsp "$(echo -e "${YELLOW}Enter backup encryption key: ${RESET}")" BACKUP_KEY
  echo
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in  "$enc_file" \
    -out "$gz_file" \
    -pass pass:"$BACKUP_KEY"
  unset BACKUP_KEY
  rm -f "$enc_file"

  echo -e "${CYAN}Decompressing…${RESET}"
  gunzip -c "$gz_file" > "$out_sql"
  rm -f "$gz_file"

  echo -e "${GREEN}Ready: ${out_sql}${RESET}"
  SQL_SIZE=$(wc -l < "$out_sql")
  echo -e "  ${SQL_SIZE} lines"
}

# ── List available backups ────────────────────────────────────────────────────
cmd_list() {
  echo -e "\n${BOLD}Available backups in R2${RESET}\n"

  echo -e "${CYAN}── Daily (last 7 days) ──────────────────────────────────────────${RESET}"
  r2 s3 ls "s3://${R2_BUCKET_NAME}/daily/" --recursive \
    | awk '{printf "  %-50s  %s MB\n", $4, int($3/1024/1024)}' \
    | sort -r \
    | head -10

  echo -e "\n${CYAN}── Weekly (last 4 weeks) ────────────────────────────────────────${RESET}"
  r2 s3 ls "s3://${R2_BUCKET_NAME}/weekly/" --recursive \
    | awk '{printf "  %-50s  %s MB\n", $4, int($3/1024/1024)}' \
    | sort -r | head -6

  echo -e "\n${CYAN}── Monthly ──────────────────────────────────────────────────────${RESET}"
  r2 s3 ls "s3://${R2_BUCKET_NAME}/monthly/" --recursive \
    | awk '{printf "  %-50s  %s MB\n", $4, int($3/1024/1024)}' \
    | sort -r | head -6

  echo
}

# ── Level 1: Verify backup integrity (no restore) ────────────────────────────
cmd_verify() {
  echo -e "\n${BOLD}Level 1 — Verify Backup Integrity${RESET}"
  echo "Downloads and decrypts the latest backup. Does NOT restore anything."
  echo

  LATEST=$(r2 s3 ls "s3://${R2_BUCKET_NAME}/daily/" --recursive \
    | sort -r | head -1 | awk '{print $4}')

  if [[ -z "$LATEST" ]]; then
    echo -e "${RED}No backups found in R2.${RESET}"; exit 1
  fi

  echo -e "Latest backup: ${CYAN}${LATEST}${RESET}"
  SQL_FILE=$(mktemp /tmp/dw_verify_XXXXXX.sql)

  fetch_backup "$LATEST" "$SQL_FILE"

  echo -e "\n${GREEN}✅ Backup decrypted successfully.${RESET}"
  echo -e "   Tables found:"
  grep "^INSERT INTO" "$SQL_FILE" | awk '{print $3}' | sort -u \
    | while read -r tbl; do
        COUNT=$(grep -c "^INSERT INTO ${tbl}" "$SQL_FILE" || true)
        printf "   %-40s %s rows\n" "$tbl" "$COUNT"
      done

  rm -f "$SQL_FILE"
}

# ── Level 2: Restore a single customer record ─────────────────────────────────
cmd_customer() {
  echo -e "\n${BOLD}Level 2 — Restore Single Customer Record${RESET}"
  echo -e "${YELLOW}⚠️  Try the admin Data Recovery page first — it's faster for recent deletions.${RESET}"
  echo -e "${YELLOW}    Use this only if the 7-day recovery window has passed.${RESET}\n"

  read -rp "Customer UUID to restore: " CUSTOMER_ID
  if [[ -z "$CUSTOMER_ID" ]]; then echo "Aborted."; exit 0; fi

  read -rp "Production database URL (postgresql://...): " PROD_DB_URL
  if [[ -z "$PROD_DB_URL" ]]; then echo "Aborted."; exit 0; fi

  # Choose backup
  echo -e "\nWhich backup? (press Enter for latest daily)"
  LATEST=$(r2 s3 ls "s3://${R2_BUCKET_NAME}/daily/" --recursive \
    | sort -r | head -1 | awk '{print $4}')
  read -rp "R2 key [${LATEST}]: " R2_KEY
  R2_KEY="${R2_KEY:-$LATEST}"

  SQL_FILE=$(mktemp /tmp/dw_restore_XXXXXX.sql)
  fetch_backup "$R2_KEY" "$SQL_FILE"

  # Extract this customer's INSERT
  EXTRACT=$(mktemp /tmp/dw_customer_XXXXXX.sql)
  grep "INSERT INTO public.customers" "$SQL_FILE" | grep "'${CUSTOMER_ID}'" > "$EXTRACT" || true

  FOUND=$(wc -l < "$EXTRACT" | tr -d ' ')
  if [[ "$FOUND" -eq 0 ]]; then
    echo -e "${RED}Customer ${CUSTOMER_ID} not found in this backup.${RESET}"
    rm -f "$SQL_FILE" "$EXTRACT"; exit 1
  fi

  echo -e "\n${GREEN}Found ${FOUND} row(s) for customer ${CUSTOMER_ID}.${RESET}"
  echo -e "\nPreview:"
  head -3 "$EXTRACT" | cut -c1-120
  echo

  read -rp "$(echo -e "${YELLOW}Restore this customer to production? [y/N]: ${RESET}")" CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted. Extract saved to: $EXTRACT"
    rm -f "$SQL_FILE"; exit 0
  fi

  echo -e "${CYAN}Restoring customer…${RESET}"
  psql "$PROD_DB_URL" < "$EXTRACT"
  echo -e "${GREEN}✅ Customer restored.${RESET}"

  rm -f "$SQL_FILE" "$EXTRACT"
}

# ── Level 3: Restore all data for one org/tenant ─────────────────────────────
cmd_org() {
  echo -e "\n${BOLD}Level 3 — Restore All Data for One Org (Tenant)${RESET}"
  echo -e "${YELLOW}⚠️  This restores ALL tables for an org from the backup.${RESET}"
  echo -e "${YELLOW}    Existing live records for this org will be overwritten on conflict.${RESET}\n"

  # The org's UUID is stored as user_id in customers/activities/vehicles
  read -rp "Org ID (UUID): " ORG_ID
  if [[ -z "$ORG_ID" ]]; then echo "Aborted."; exit 0; fi

  read -rp "Production database URL (postgresql://...): " PROD_DB_URL
  if [[ -z "$PROD_DB_URL" ]]; then echo "Aborted."; exit 0; fi

  echo -e "\nWhich backup? (press Enter for latest daily)"
  LATEST=$(r2 s3 ls "s3://${R2_BUCKET_NAME}/daily/" --recursive \
    | sort -r | head -1 | awk '{print $4}')
  read -rp "R2 key [${LATEST}]: " R2_KEY
  R2_KEY="${R2_KEY:-$LATEST}"

  SQL_FILE=$(mktemp /tmp/dw_restore_XXXXXX.sql)
  fetch_backup "$R2_KEY" "$SQL_FILE"

  EXTRACT=$(mktemp /tmp/dw_org_XXXXXX.sql)

  # Tables scoped by user_id (= org_id in DealerWyze data model)
  USER_ID_TABLES=(
    "public.customers"
    "public.activities"
    "public.vehicles"
    "public.ledger_transactions"
    "public.org_settings"
  )
  # Tables scoped by org_id column
  ORG_ID_TABLES=(
    "public.organizations"
    "public.profiles"
  )

  echo -e "${CYAN}Extracting rows for org ${ORG_ID}…${RESET}"
  {
    echo "-- DealerWyze org restore: ${ORG_ID}"
    echo "-- Source: ${R2_KEY}"
    echo "-- Generated: $(date -u)"
    echo "BEGIN;"
    echo

    for tbl in "${USER_ID_TABLES[@]}"; do
      COUNT=$(grep "INSERT INTO ${tbl}" "$SQL_FILE" | grep -c "'${ORG_ID}'" || true)
      if [[ "$COUNT" -gt 0 ]]; then
        echo "-- ${tbl}: ${COUNT} rows"
        grep "INSERT INTO ${tbl}" "$SQL_FILE" | grep "'${ORG_ID}'"
        echo
      fi
    done

    for tbl in "${ORG_ID_TABLES[@]}"; do
      COUNT=$(grep "INSERT INTO ${tbl}" "$SQL_FILE" | grep -c "'${ORG_ID}'" || true)
      if [[ "$COUNT" -gt 0 ]]; then
        echo "-- ${tbl}: ${COUNT} rows"
        grep "INSERT INTO ${tbl}" "$SQL_FILE" | grep "'${ORG_ID}'"
        echo
      fi
    done

    echo "COMMIT;"
  } > "$EXTRACT"

  TOTAL=$(grep -c "^INSERT" "$EXTRACT" || true)
  echo -e "${GREEN}Found ${TOTAL} rows across all tables.${RESET}"
  echo -e "\nRow counts by table:"
  grep "^-- public\." "$EXTRACT" | while read -r line; do echo "  $line"; done
  echo

  read -rp "$(echo -e "${YELLOW}Restore ${TOTAL} rows to production? [y/N]: ${RESET}")" CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted. Extract saved to: $EXTRACT"
    rm -f "$SQL_FILE"; exit 0
  fi

  echo -e "${CYAN}Restoring org data…${RESET}"
  psql "$PROD_DB_URL" < "$EXTRACT"
  echo -e "${GREEN}✅ Org data restored.${RESET}"

  rm -f "$SQL_FILE" "$EXTRACT"
}

# ── Level 4: Full database restore ───────────────────────────────────────────
cmd_full() {
  echo -e "\n${BOLD}Level 4 — Full Database Restore${RESET}"
  echo -e "${RED}⚠️  WARNING: This overwrites the ENTIRE target database.${RESET}"
  echo -e "${RED}   Do NOT run against production unless it is a true emergency.${RESET}"
  echo -e "${YELLOW}   Recommended: restore to a new Supabase project first, verify, then swap.${RESET}\n"

  read -rp "Target database URL (postgresql://...): " TARGET_DB_URL
  if [[ -z "$TARGET_DB_URL" ]]; then echo "Aborted."; exit 0; fi

  # Safety check — warn if this looks like the production URL
  if echo "$TARGET_DB_URL" | grep -q "arsdoonmqlilrqiqbbzh"; then
    echo -e "${RED}⚠️  This appears to be your PRODUCTION database.${RESET}"
    read -rp "$(echo -e "${RED}Type CONFIRM to proceed: ${RESET}")" DOUBLE_CONFIRM
    [[ "$DOUBLE_CONFIRM" != "CONFIRM" ]] && { echo "Aborted."; exit 0; }
  fi

  echo -e "\nWhich backup?"
  cmd_list
  read -rp "R2 key (copy from list above): " R2_KEY
  if [[ -z "$R2_KEY" ]]; then echo "Aborted."; exit 0; fi

  SQL_FILE=$(mktemp /tmp/dw_full_restore_XXXXXX.sql)
  fetch_backup "$R2_KEY" "$SQL_FILE"

  echo -e "\n${BOLD}Summary:${RESET}"
  echo -e "  Source:  ${CYAN}${R2_KEY}${RESET}"
  echo -e "  Target:  ${CYAN}${TARGET_DB_URL%@*}@***${RESET}"  # hide password
  LINES=$(wc -l < "$SQL_FILE" | tr -d ' ')
  echo -e "  Size:    ${LINES} lines"
  echo

  read -rp "$(echo -e "${RED}Proceed with full restore? [y/N]: ${RESET}")" CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."; rm -f "$SQL_FILE"; exit 0
  fi

  echo -e "${CYAN}Restoring full database… (this may take 10–20 minutes)${RESET}"
  psql "$TARGET_DB_URL" < "$SQL_FILE"
  echo -e "${GREEN}✅ Full restore complete.${RESET}"
  echo -e "\nNext steps:"
  echo -e "  1. Log in and verify data looks correct"
  echo -e "  2. Run: psql \$URL -c \"SELECT count(*) FROM organizations;\""
  echo -e "  3. Check Supabase RLS policies are enabled"
  echo -e "  4. If this was a staging restore, test all major flows before touching production"

  rm -f "$SQL_FILE"
}

# ── Main menu ─────────────────────────────────────────────────────────────────
main() {
  echo -e "\n${BOLD}DealerWyze Restore Tool${RESET}"
  echo -e "R2 bucket: ${CYAN}${R2_BUCKET_NAME}${RESET}\n"

  echo "  1) List available backups"
  echo "  2) Verify latest backup (decrypt + integrity check, no restore)"
  echo "  3) Restore single customer record"
  echo "  4) Restore all data for one org / dealership"
  echo "  5) Full database restore"
  echo "  q) Quit"
  echo
  read -rp "Choice: " CHOICE

  case "$CHOICE" in
    1) cmd_list    ;;
    2) cmd_verify  ;;
    3) cmd_customer ;;
    4) cmd_org     ;;
    5) cmd_full    ;;
    q|Q) echo "Bye."; exit 0 ;;
    *) echo "Invalid choice."; exit 1 ;;
  esac
}

check_deps
main
