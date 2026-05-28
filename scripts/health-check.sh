#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Velya Cloud Relay - Health Check Script                                  ║
# ║  Comprehensive health verification for production deployments              ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
#
# Usage:
#   ./scripts/health-check.sh [--url https://relay.velya.app] [--verbose]
#
# Exit codes:
#   0 = Healthy
#   1 = Unhealthy
#   2 = Configuration error

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

SERVER_URL="${VELYA_SERVER_URL:-http://localhost:8080}"
VERBOSE=false
TIMEOUT=10

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────────────────────
# Parse Arguments
# ─────────────────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)
      SERVER_URL="$2"
      shift 2
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --help|-h)
      echo "Velya Cloud Relay - Health Check Script"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --url URL         Server URL (default: http://localhost:8080)"
      echo "  --verbose, -v     Verbose output"
      echo "  --timeout SEC     Request timeout in seconds (default: 10)"
      echo "  --help, -h        Show this help message"
      echo ""
      echo "Environment Variables:"
      echo "  VELYA_SERVER_URL  Default server URL if --url not provided"
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      echo "Use --help for usage information"
      exit 2
      ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

log() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
  echo -e "${GREEN}[✓]${NC} $*"
}

warning() {
  echo -e "${YELLOW}[⚠]${NC} $*"
}

error() {
  echo -e "${RED}[✗]${NC} $*" >&2
}

verbose() {
  if [[ "$VERBOSE" == true ]]; then
    echo -e "${BLUE}[DEBUG]${NC} $*"
  fi
}

# HTTP request wrapper
http_get() {
  local url=$1
  local expected_status=${2:-200}

  verbose "GET $url (expect $expected_status)"

  local response
  local status_code

  response=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
  status_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')

  verbose "Response: $status_code"
  verbose "Body: $body"

  if [[ "$status_code" == "$expected_status" ]]; then
    echo "$body"
    return 0
  else
    error "HTTP $status_code (expected $expected_status)"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Health Checks
# ─────────────────────────────────────────────────────────────────────────────

check_http_reachability() {
  log "Checking HTTP reachability..."

  if ! command -v curl &> /dev/null; then
    error "curl not found. Please install curl."
    return 1
  fi

  if http_get "$SERVER_URL/health" 200 > /dev/null; then
    success "Server is reachable"
    return 0
  else
    error "Server is not reachable"
    return 1
  fi
}

check_health_endpoint() {
  log "Checking /health endpoint..."

  local response
  if ! response=$(http_get "$SERVER_URL/health" 200); then
    error "/health endpoint failed"
    return 1
  fi

  # Parse JSON (basic check - assumes jq not available)
  if echo "$response" | grep -q '"status":"healthy"'; then
    success "/health endpoint returned healthy"

    if [[ "$VERBOSE" == true ]]; then
      local postgres=$(echo "$response" | grep -o '"postgres":[^,}]*' | cut -d: -f2)
      local redis=$(echo "$response" | grep -o '"redis":[^,}]*' | cut -d: -f2)
      verbose "  PostgreSQL: $postgres"
      verbose "  Redis: $redis"
    fi

    return 0
  else
    error "/health endpoint returned unhealthy"
    error "Response: $response"
    return 1
  fi
}

check_websocket_upgrade() {
  log "Checking WebSocket upgrade capability..."

  # Note: Basic check - just verify the endpoint exists
  # Full WebSocket handshake requires a proper WS client

  local ws_url="${SERVER_URL/http/ws}/v1/relay?token=test"
  verbose "Testing WebSocket endpoint: $ws_url"

  # Try to connect - expect 401 Unauthorized (auth required)
  local status_code
  status_code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time "$TIMEOUT" \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    "$ws_url" 2>/dev/null || echo "000")

  if [[ "$status_code" == "401" ]] || [[ "$status_code" == "400" ]]; then
    success "WebSocket endpoint is responding (${status_code})"
    return 0
  elif [[ "$status_code" == "000" ]]; then
    warning "WebSocket endpoint not reachable (connection failed)"
    return 1
  else
    warning "WebSocket endpoint returned unexpected status: $status_code"
    return 1
  fi
}

check_cors_headers() {
  log "Checking CORS headers..."

  local origin="https://example.com"
  local headers
  headers=$(curl -s -o /dev/null -w "%{header_json}" \
    --max-time "$TIMEOUT" \
    -H "Origin: $origin" \
    "$SERVER_URL/health" 2>/dev/null | grep -i "access-control" || echo "")

  if [[ -n "$headers" ]]; then
    success "CORS headers present"
    if [[ "$VERBOSE" == true ]]; then
      verbose "  $headers"
    fi
    return 0
  else
    warning "No CORS headers found (may be expected if server restricts origins)"
    return 0 # Not a failure
  fi
}

check_ssl_certificate() {
  log "Checking SSL certificate..."

  # Only check if HTTPS
  if [[ "$SERVER_URL" != https://* ]]; then
    warning "Not HTTPS - skipping SSL check"
    return 0
  fi

  local domain
  domain=$(echo "$SERVER_URL" | sed -e 's|^https://||' -e 's|/.*$||' -e 's|:.*$||')

  verbose "Checking certificate for: $domain"

  local expiry
  if command -v openssl &> /dev/null; then
    expiry=$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null | \
      openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

    if [[ -n "$expiry" ]]; then
      success "SSL certificate valid (expires: $expiry)"

      # Check if expiring soon (< 30 days)
      local expiry_epoch
      expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null)
      local now_epoch
      now_epoch=$(date +%s)
      local days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))

      if [[ $days_remaining -lt 30 ]]; then
        warning "Certificate expires in $days_remaining days - consider renewal"
      fi

      return 0
    else
      error "Could not retrieve SSL certificate"
      return 1
    fi
  else
    warning "openssl not found - skipping certificate expiry check"
    return 0
  fi
}

check_database_connectivity() {
  log "Checking database connectivity (via /health)..."

  local response
  if ! response=$(http_get "$SERVER_URL/health" 200); then
    error "Cannot reach /health to check database"
    return 1
  fi

  if echo "$response" | grep -q '"postgres":true'; then
    success "PostgreSQL is connected"
    return 0
  else
    error "PostgreSQL is not connected"
    return 1
  fi
}

check_redis_connectivity() {
  log "Checking Redis connectivity (via /health)..."

  local response
  if ! response=$(http_get "$SERVER_URL/health" 200); then
    error "Cannot reach /health to check Redis"
    return 1
  fi

  if echo "$response" | grep -q '"redis":true'; then
    success "Redis is connected"
    return 0
  else
    error "Redis is not connected"
    return 1
  fi
}

check_response_time() {
  log "Checking response time..."

  local start
  local end
  local duration

  start=$(date +%s%N)
  if http_get "$SERVER_URL/health" 200 > /dev/null; then
    end=$(date +%s%N)
    duration=$(( (end - start) / 1000000 )) # Convert to milliseconds

    if [[ $duration -lt 500 ]]; then
      success "Response time: ${duration}ms (excellent)"
    elif [[ $duration -lt 1000 ]]; then
      success "Response time: ${duration}ms (good)"
    elif [[ $duration -lt 3000 ]]; then
      warning "Response time: ${duration}ms (slow)"
    else
      error "Response time: ${duration}ms (very slow)"
      return 1
    fi
    return 0
  else
    error "Could not measure response time"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Execution
# ─────────────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════════════════╗"
  echo "║         Velya Cloud Relay - Health Check                                  ║"
  echo "╚═══════════════════════════════════════════════════════════════════════════╝"
  echo ""
  log "Target: $SERVER_URL"
  log "Timeout: ${TIMEOUT}s"
  echo ""

  local failures=0
  local checks=0

  # Run all checks
  local check_functions=(
    check_http_reachability
    check_health_endpoint
    check_database_connectivity
    check_redis_connectivity
    check_websocket_upgrade
    check_cors_headers
    check_ssl_certificate
    check_response_time
  )

  for check in "${check_functions[@]}"; do
    checks=$((checks + 1))
    if ! $check; then
      failures=$((failures + 1))
    fi
    echo ""
  done

  # Summary
  echo "─────────────────────────────────────────────────────────────────────────────"
  echo ""

  if [[ $failures -eq 0 ]]; then
    success "╔═══════════════════════════════════════════════════════════════════════════╗"
    success "║  All checks passed! ($checks/$checks)                                    ║"
    success "╚═══════════════════════════════════════════════════════════════════════════╝"
    echo ""
    exit 0
  else
    error "╔═══════════════════════════════════════════════════════════════════════════╗"
    error "║  $failures/$checks checks failed                                          ║"
    error "╚═══════════════════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
  fi
}

main
