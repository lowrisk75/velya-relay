#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Velya Cloud Relay - GitHub Secrets Setup                                 ║
# ║  Automatically configure GitHub Actions secrets via API                    ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

REPO="lowrisk75/velya-relay"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Velya Cloud Relay - GitHub Secrets Setup                          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check GitHub CLI
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}❌ GitHub CLI (gh) not found${NC}"
    echo "Install: brew install gh"
    exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}❌ Not authenticated with GitHub${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✓${NC} GitHub CLI authenticated"
echo ""

# Prompt for Docker Hub credentials
echo -e "${YELLOW}📦 Docker Hub Credentials${NC}"
echo ""
echo "1. Go to: https://hub.docker.com/settings/security"
echo "2. Click 'New Access Token'"
echo "3. Description: 'GitHub Actions - Velya Relay'"
echo "4. Permissions: Read, Write, Delete"
echo "5. Click 'Generate' and copy the token"
echo ""

read -p "Docker Hub Username (default: lorislab): " DOCKER_USERNAME
DOCKER_USERNAME=${DOCKER_USERNAME:-lorislab}

read -sp "Docker Hub Token (paste here): " DOCKER_TOKEN
echo ""
echo ""

if [[ -z "$DOCKER_TOKEN" ]]; then
    echo -e "${YELLOW}❌ Docker token cannot be empty${NC}"
    exit 1
fi

# Add secrets using gh CLI
echo -e "${BLUE}Adding secrets to GitHub...${NC}"

echo "$DOCKER_USERNAME" | gh secret set DOCKER_USERNAME --repo "$REPO"
echo -e "${GREEN}✓${NC} DOCKER_USERNAME set"

echo "$DOCKER_TOKEN" | gh secret set DOCKER_TOKEN --repo "$REPO"
echo -e "${GREEN}✓${NC} DOCKER_TOKEN set"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Secrets configured successfully!                                         ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Verify secrets
echo -e "${BLUE}Verifying secrets...${NC}"
gh secret list --repo "$REPO"

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Re-run failed Docker build workflow"
echo "2. Or push a new commit to trigger automatically"
echo ""
echo "Command to trigger:"
echo "  cd /tmp/velya-relay-docker"
echo "  git commit --allow-empty -m 'ci: trigger Docker build with secrets'"
echo "  git push"
echo ""
