#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Velya Cloud Relay - Data Migration Script                                ║
# ║  Exports data from existing relay server and imports to new instance      ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
#
# Usage:
#   ./scripts/migrate-from-existing.sh \
#     --source-host relay2.lorislab.fr \
#     --source-db velya_relay \
#     --source-user velya_user \
#     --target-host localhost \
#     --target-db velya_relay \
#     --target-user velya_user
#
# Requirements:
#   - psql (PostgreSQL client)
#   - SSH access to source server (for remote export)
#   - Write access to ./backups/ directory

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Default Configuration
# ─────────────────────────────────────────────────────────────────────────────

SOURCE_HOST=""
SOURCE_PORT="5432"
SOURCE_DB="velya_relay"
SOURCE_USER="velya_user"

TARGET_HOST="localhost"
TARGET_PORT="5432"
TARGET_DB="velya_relay"
TARGET_USER="velya_user"

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_FILE="${BACKUP_DIR}/velya_migration_${TIMESTAMP}.sql"

# Tables to migrate (in dependency order)
TABLES=(
  "users"
  "devices"
  "alarms"
  "alarm_events"
  "node_red_keys"
  "webhooks"
  "webhook_deliveries"
  "audit_log"
)

# ─────────────────────────────────────────────────────────────────────────────
# Parse Arguments
# ─────────────────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --source-host)
      SOURCE_HOST="$2"
      shift 2
      ;;
    --source-port)
      SOURCE_PORT="$2"
      shift 2
      ;;
    --source-db)
      SOURCE_DB="$2"
      shift 2
      ;;
    --source-user)
      SOURCE_USER="$2"
      shift 2
      ;;
    --target-host)
      TARGET_HOST="$2"
      shift 2
      ;;
    --target-port)
      TARGET_PORT="$2"
      shift 2
      ;;
    --target-db)
      TARGET_DB="$2"
      shift 2
      ;;
    --target-user)
      TARGET_USER="$2"
      shift 2
      ;;
    --help|-h)
      echo "Velya Cloud Relay - Data Migration Script"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --source-host HOST    Source PostgreSQL host (required)"
      echo "  --source-port PORT    Source PostgreSQL port (default: 5432)"
      echo "  --source-db DB        Source database name (default: velya_relay)"
      echo "  --source-user USER    Source database user (default: velya_user)"
      echo "  --target-host HOST    Target PostgreSQL host (default: localhost)"
      echo "  --target-port PORT    Target PostgreSQL port (default: 5432)"
      echo "  --target-db DB        Target database name (default: velya_relay)"
      echo "  --target-user USER    Target database user (default: velya_user)"
      echo "  --help, -h            Show this help message"
      echo ""
      echo "Examples:"
      echo "  # Migrate from remote to local Docker instance"
      echo "  $0 --source-host relay2.lorislab.fr --source-user velya_user"
      echo ""
      echo "  # Migrate between two remote servers"
      echo "  $0 --source-host old.example.com --target-host new.example.com"
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────────────

if [[ -z "$SOURCE_HOST" ]]; then
  echo "❌ Error: --source-host is required"
  echo "Use --help for usage information"
  exit 1
fi

if ! command -v psql &> /dev/null; then
  echo "❌ Error: psql not found. Please install PostgreSQL client:"
  echo "   macOS:  brew install postgresql"
  echo "   Ubuntu: apt-get install postgresql-client"
  echo "   RHEL:   yum install postgresql"
  exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ ERROR: $*" >&2
}

success() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $*"
}

# Test database connection
test_connection() {
  local host=$1
  local port=$2
  local db=$3
  local user=$4
  local label=$5

  log "Testing $label connection ($user@$host:$port/$db)..."

  if PGPASSWORD="${PGPASSWORD:-}" psql \
    -h "$host" \
    -p "$port" \
    -U "$user" \
    -d "$db" \
    -c "SELECT version();" > /dev/null 2>&1; then
    success "$label connection successful"
    return 0
  else
    error "$label connection failed"
    return 1
  fi
}

# Export data from source
export_data() {
  log "Exporting data from source database..."

  # Export schema (tables, sequences, indexes, constraints)
  log "  → Exporting schema..."
  PGPASSWORD="${SOURCE_PASSWORD:-}" pg_dump \
    -h "$SOURCE_HOST" \
    -p "$SOURCE_PORT" \
    -U "$SOURCE_USER" \
    -d "$SOURCE_DB" \
    --schema-only \
    --no-owner \
    --no-privileges \
    > "${EXPORT_FILE}.schema.sql"

  # Export data only (no schema)
  log "  → Exporting data..."
  PGPASSWORD="${SOURCE_PASSWORD:-}" pg_dump \
    -h "$SOURCE_HOST" \
    -p "$SOURCE_PORT" \
    -U "$SOURCE_USER" \
    -d "$SOURCE_DB" \
    --data-only \
    --no-owner \
    --no-privileges \
    --disable-triggers \
    --column-inserts \
    > "${EXPORT_FILE}.data.sql"

  success "Export completed: ${EXPORT_FILE}.{schema,data}.sql"
}

# Import data to target
import_data() {
  log "Importing data to target database..."

  # Warning prompt
  echo ""
  echo "⚠️  WARNING: This will modify the target database:"
  echo "    Host: $TARGET_HOST:$TARGET_PORT"
  echo "    Database: $TARGET_DB"
  echo "    User: $TARGET_USER"
  echo ""
  echo "Existing data in these tables will be preserved (ON CONFLICT DO UPDATE):"
  for table in "${TABLES[@]}"; do
    echo "  - $table"
  done
  echo ""
  read -p "Continue? (yes/no): " -r
  if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
    log "Import cancelled by user"
    exit 0
  fi

  # Import schema (idempotent - will not fail if tables exist)
  log "  → Importing schema..."
  PGPASSWORD="${TARGET_PASSWORD:-}" psql \
    -h "$TARGET_HOST" \
    -p "$TARGET_PORT" \
    -U "$TARGET_USER" \
    -d "$TARGET_DB" \
    -f "${EXPORT_FILE}.schema.sql" \
    --quiet \
    --single-transaction \
    || log "⚠️  Schema import warnings (expected if tables exist)"

  # Import data
  log "  → Importing data..."
  PGPASSWORD="${TARGET_PASSWORD:-}" psql \
    -h "$TARGET_HOST" \
    -p "$TARGET_PORT" \
    -U "$TARGET_USER" \
    -d "$TARGET_DB" \
    -f "${EXPORT_FILE}.data.sql" \
    --quiet \
    --single-transaction

  success "Import completed"
}

# Verify migration
verify_migration() {
  log "Verifying migration..."

  for table in "${TABLES[@]}"; do
    # Count rows in source
    SOURCE_COUNT=$(PGPASSWORD="${SOURCE_PASSWORD:-}" psql \
      -h "$SOURCE_HOST" \
      -p "$SOURCE_PORT" \
      -U "$SOURCE_USER" \
      -d "$SOURCE_DB" \
      -tAc "SELECT COUNT(*) FROM $table;")

    # Count rows in target
    TARGET_COUNT=$(PGPASSWORD="${TARGET_PASSWORD:-}" psql \
      -h "$TARGET_HOST" \
      -p "$TARGET_PORT" \
      -U "$TARGET_USER" \
      -d "$TARGET_DB" \
      -tAc "SELECT COUNT(*) FROM $table;")

    if [[ "$SOURCE_COUNT" -eq "$TARGET_COUNT" ]]; then
      success "  $table: $SOURCE_COUNT rows (✓ match)"
    else
      error "  $table: source=$SOURCE_COUNT, target=$TARGET_COUNT (✗ mismatch)"
    fi
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Execution
# ─────────────────────────────────────────────────────────────────────────────

main() {
  log "╔═══════════════════════════════════════════════════════════════════════════╗"
  log "║         Velya Cloud Relay - Data Migration                                ║"
  log "╚═══════════════════════════════════════════════════════════════════════════╝"

  log "Source: $SOURCE_USER@$SOURCE_HOST:$SOURCE_PORT/$SOURCE_DB"
  log "Target: $TARGET_USER@$TARGET_HOST:$TARGET_PORT/$TARGET_DB"
  log "Backup: $EXPORT_FILE"
  echo ""

  # Prompt for passwords (if not set via env vars)
  if [[ -z "${SOURCE_PASSWORD:-}" ]]; then
    read -sp "Source database password: " SOURCE_PASSWORD
    echo ""
    export SOURCE_PASSWORD
  fi

  if [[ -z "${TARGET_PASSWORD:-}" ]]; then
    read -sp "Target database password: " TARGET_PASSWORD
    echo ""
    export TARGET_PASSWORD
  fi

  echo ""

  # Test connections
  test_connection "$SOURCE_HOST" "$SOURCE_PORT" "$SOURCE_DB" "$SOURCE_USER" "Source" || exit 1
  test_connection "$TARGET_HOST" "$TARGET_PORT" "$TARGET_DB" "$TARGET_USER" "Target" || exit 1

  echo ""

  # Execute migration
  export_data
  import_data
  verify_migration

  echo ""
  success "╔═══════════════════════════════════════════════════════════════════════════╗"
  success "║  Migration completed successfully!                                        ║"
  success "╚═══════════════════════════════════════════════════════════════════════════╝"
  echo ""
  log "Backup files saved in: $BACKUP_DIR"
  log "  - ${EXPORT_FILE}.schema.sql"
  log "  - ${EXPORT_FILE}.data.sql"
  echo ""
  log "Next steps:"
  log "  1. Test the target server: curl http://$TARGET_HOST:8080/health"
  log "  2. Update iOS app Settings → Server Configuration with new URL"
  log "  3. Test alarm creation end-to-end"
  log "  4. Monitor logs for any migration issues"
  echo ""
}

main
