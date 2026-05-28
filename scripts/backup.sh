#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Velya Cloud Relay - Backup Script                                        ║
# ║  Automated backup for PostgreSQL database and Redis data                  ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
#
# Usage:
#   ./scripts/backup.sh [--output-dir ./backups] [--retention-days 7]
#
# Backup includes:
#   - PostgreSQL full dump (schema + data)
#   - Redis RDB snapshot
#   - Environment configuration (.env file - secrets masked)
#   - Docker compose configuration
#
# Scheduling with cron:
#   0 2 * * * /path/to/velya-relay/scripts/backup.sh --output-dir /mnt/backups

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${PROJECT_DIR}/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Docker compose service names
POSTGRES_CONTAINER="velya-relay-postgres-1"
REDIS_CONTAINER="velya-relay-redis-1"

# Database credentials (from .env or defaults)
PG_DATABASE="${PG_DATABASE:-velya_relay}"
PG_USER="${PG_USER:-velya_user}"

# ─────────────────────────────────────────────────────────────────────────────
# Parse Arguments
# ─────────────────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    --help|-h)
      echo "Velya Cloud Relay - Backup Script"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --output-dir DIR      Backup output directory (default: ./backups)"
      echo "  --retention-days N    Delete backups older than N days (default: 7)"
      echo "  --help, -h            Show this help message"
      echo ""
      echo "Scheduling:"
      echo "  # Daily at 2 AM"
      echo "  0 2 * * * $0 --output-dir /mnt/backups"
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

# Check if Docker is running
check_docker() {
  if ! command -v docker &> /dev/null; then
    error "Docker not found. Please install Docker."
    exit 1
  fi

  if ! docker info > /dev/null 2>&1; then
    error "Docker daemon is not running."
    exit 1
  fi
}

# Check if containers are running
check_containers() {
  local missing=0

  if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    error "PostgreSQL container not running: $POSTGRES_CONTAINER"
    missing=1
  fi

  if ! docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
    error "Redis container not running: $REDIS_CONTAINER"
    missing=1
  fi

  if [[ $missing -eq 1 ]]; then
    error "Required containers not running. Start with: docker-compose up -d"
    exit 1
  fi
}

# Backup PostgreSQL database
backup_postgres() {
  log "Backing up PostgreSQL database..."

  local backup_file="${OUTPUT_DIR}/postgres_${TIMESTAMP}.sql.gz"

  docker exec "$POSTGRES_CONTAINER" pg_dump \
    -U "$PG_USER" \
    -d "$PG_DATABASE" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    | gzip > "$backup_file"

  if [[ -f "$backup_file" ]]; then
    local size=$(du -h "$backup_file" | cut -f1)
    success "PostgreSQL backup: $backup_file ($size)"
  else
    error "PostgreSQL backup failed"
    return 1
  fi
}

# Backup Redis data
backup_redis() {
  log "Backing up Redis data..."

  # Trigger a Redis BGSAVE
  docker exec "$REDIS_CONTAINER" redis-cli BGSAVE > /dev/null

  # Wait for BGSAVE to complete
  log "  → Waiting for Redis BGSAVE..."
  local retries=0
  while [[ $retries -lt 30 ]]; do
    local status=$(docker exec "$REDIS_CONTAINER" redis-cli LASTSAVE)
    sleep 1
    local current=$(docker exec "$REDIS_CONTAINER" redis-cli LASTSAVE)
    if [[ "$current" != "$status" ]]; then
      break
    fi
    retries=$((retries + 1))
  done

  # Copy dump.rdb
  local backup_file="${OUTPUT_DIR}/redis_${TIMESTAMP}.rdb"
  docker exec "$REDIS_CONTAINER" cat /data/dump.rdb > "$backup_file"

  if [[ -f "$backup_file" ]]; then
    local size=$(du -h "$backup_file" | cut -f1)
    success "Redis backup: $backup_file ($size)"
  else
    error "Redis backup failed"
    return 1
  fi
}

# Backup configuration files
backup_config() {
  log "Backing up configuration..."

  local config_archive="${OUTPUT_DIR}/config_${TIMESTAMP}.tar.gz"

  # Create temporary directory for masked configs
  local temp_dir=$(mktemp -d)

  # Copy and mask .env file
  if [[ -f "${PROJECT_DIR}/.env" ]]; then
    sed -E 's/(PASSWORD|SECRET|KEY)=.*/\1=***MASKED***/g' "${PROJECT_DIR}/.env" > "${temp_dir}/.env"
  fi

  # Copy docker-compose.yml
  if [[ -f "${PROJECT_DIR}/docker-compose.yml" ]]; then
    cp "${PROJECT_DIR}/docker-compose.yml" "${temp_dir}/"
  fi

  # Copy init-db.sql
  if [[ -f "${PROJECT_DIR}/init-db.sql" ]]; then
    cp "${PROJECT_DIR}/init-db.sql" "${temp_dir}/"
  fi

  # Create archive
  tar -czf "$config_archive" -C "$temp_dir" .
  rm -rf "$temp_dir"

  if [[ -f "$config_archive" ]]; then
    local size=$(du -h "$config_archive" | cut -f1)
    success "Config backup: $config_archive ($size)"
  else
    error "Config backup failed"
    return 1
  fi
}

# Create manifest file
create_manifest() {
  log "Creating backup manifest..."

  local manifest_file="${OUTPUT_DIR}/manifest_${TIMESTAMP}.txt"

  cat > "$manifest_file" <<EOF
Velya Cloud Relay - Backup Manifest
═════════════════════════════════════════════════════════════════════════

Backup Time: $(date +'%Y-%m-%d %H:%M:%S %Z')
Host: $(hostname)
Docker Version: $(docker --version)

Files
─────────────────────────────────────────────────────────────────────────
$(ls -lh "${OUTPUT_DIR}"/*_${TIMESTAMP}.* 2>/dev/null || echo "No backup files found")

Database Info
─────────────────────────────────────────────────────────────────────────
PostgreSQL Version: $(docker exec "$POSTGRES_CONTAINER" psql -U "$PG_USER" -d "$PG_DATABASE" -tAc "SELECT version();" 2>/dev/null | head -1)

Tables:
$(docker exec "$POSTGRES_CONTAINER" psql -U "$PG_USER" -d "$PG_DATABASE" -tAc "
  SELECT
    schemaname || '.' || tablename AS table,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
" 2>/dev/null)

Redis Info
─────────────────────────────────────────────────────────────────────────
$(docker exec "$REDIS_CONTAINER" redis-cli INFO stats 2>/dev/null | grep -E "total_commands_processed|keyspace")

Container Status
─────────────────────────────────────────────────────────────────────────
$(docker ps --filter "name=velya-relay" --format "table {{.Names}}\t{{.Status}}\t{{.Size}}")

Restore Instructions
─────────────────────────────────────────────────────────────────────────
1. Stop existing containers:
   docker-compose down

2. Restore PostgreSQL:
   gunzip -c postgres_${TIMESTAMP}.sql.gz | docker exec -i postgres_container psql -U velya_user -d velya_relay

3. Restore Redis:
   docker exec redis_container redis-cli SHUTDOWN NOSAVE
   docker cp redis_${TIMESTAMP}.rdb redis_container:/data/dump.rdb
   docker restart redis_container

4. Restore config:
   tar -xzf config_${TIMESTAMP}.tar.gz -C /path/to/velya-relay/

5. Start containers:
   docker-compose up -d

═════════════════════════════════════════════════════════════════════════
EOF

  success "Manifest created: $manifest_file"
}

# Clean up old backups
cleanup_old_backups() {
  log "Cleaning up backups older than $RETENTION_DAYS days..."

  local deleted=0

  while IFS= read -r -d '' file; do
    rm -f "$file"
    deleted=$((deleted + 1))
    log "  → Deleted: $(basename "$file")"
  done < <(find "$OUTPUT_DIR" -type f -name "*_[0-9]*.*" -mtime +$RETENTION_DAYS -print0)

  if [[ $deleted -gt 0 ]]; then
    success "Deleted $deleted old backup files"
  else
    log "No old backups to delete"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Execution
# ─────────────────────────────────────────────────────────────────────────────

main() {
  log "╔═══════════════════════════════════════════════════════════════════════════╗"
  log "║         Velya Cloud Relay - Backup                                        ║"
  log "╚═══════════════════════════════════════════════════════════════════════════╝"

  log "Output directory: $OUTPUT_DIR"
  log "Retention: $RETENTION_DAYS days"
  echo ""

  # Pre-flight checks
  check_docker
  check_containers

  # Create output directory
  mkdir -p "$OUTPUT_DIR"

  # Load environment variables
  if [[ -f "${PROJECT_DIR}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${PROJECT_DIR}/.env"
    set +a
  fi

  # Execute backups
  local failed=0

  backup_postgres || failed=$((failed + 1))
  backup_redis || failed=$((failed + 1))
  backup_config || failed=$((failed + 1))
  create_manifest

  echo ""

  # Cleanup
  cleanup_old_backups

  echo ""

  # Summary
  if [[ $failed -eq 0 ]]; then
    success "╔═══════════════════════════════════════════════════════════════════════════╗"
    success "║  Backup completed successfully!                                           ║"
    success "╚═══════════════════════════════════════════════════════════════════════════╝"

    # Calculate total backup size
    local total_size=$(du -sh "$OUTPUT_DIR" | cut -f1)
    log "Total backup size: $total_size"
    log "Backup location: $OUTPUT_DIR"

    exit 0
  else
    error "╔═══════════════════════════════════════════════════════════════════════════╗"
    error "║  Backup completed with $failed failures                                   ║"
    error "╚═══════════════════════════════════════════════════════════════════════════╝"
    exit 1
  fi
}

main
