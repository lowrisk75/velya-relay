#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Velya Cloud Relay - Railway Deployment Script                            ║
# ║  Automated deployment to Railway with all required configuration           ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Velya Cloud Relay - Railway Deployment                            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
fi

echo -e "${GREEN}✓${NC} Railway CLI installed"
echo ""

# Login to Railway
echo -e "${BLUE}Step 1: Railway Authentication${NC}"
railway login

echo ""
echo -e "${GREEN}✓${NC} Authenticated with Railway"
echo ""

# Create new project or link existing
echo -e "${BLUE}Step 2: Railway Project Setup${NC}"
echo "Choose an option:"
echo "  1) Create new Railway project"
echo "  2) Link to existing Railway project"
read -p "Choice (1 or 2): " PROJECT_CHOICE

if [[ "$PROJECT_CHOICE" == "1" ]]; then
    echo ""
    read -p "Project name (default: velya-relay): " PROJECT_NAME
    PROJECT_NAME=${PROJECT_NAME:-velya-relay}

    railway init --name "$PROJECT_NAME"
    echo -e "${GREEN}✓${NC} Project created: $PROJECT_NAME"
else
    railway link
    echo -e "${GREEN}✓${NC} Linked to existing project"
fi

echo ""
echo -e "${BLUE}Step 3: Add PostgreSQL Database${NC}"
railway add --plugin postgresql
echo -e "${GREEN}✓${NC} PostgreSQL added"

echo ""
echo -e "${BLUE}Step 4: Add Redis${NC}"
railway add --plugin redis
echo -e "${GREEN}✓${NC} Redis added"

echo ""
echo -e "${BLUE}Step 5: Environment Variables${NC}"
echo ""

# APNs Configuration
echo -e "${YELLOW}📱 APNs Configuration${NC}"
echo ""
echo "Get these values from:"
echo "  https://developer.apple.com/account/resources/authkeys/list"
echo ""

read -p "APNS_KEY_ID (10 chars, e.g., ANAK3AMTW4): " APNS_KEY_ID
read -p "APNS_TEAM_ID (10 chars, e.g., TDV6D5L785): " APNS_TEAM_ID
read -p "APNS_BUNDLE_ID (default: com.lorislab.velya): " APNS_BUNDLE_ID
APNS_BUNDLE_ID=${APNS_BUNDLE_ID:-com.lorislab.velya}
read -p "APNS_PRODUCTION (true/false, default: false): " APNS_PRODUCTION
APNS_PRODUCTION=${APNS_PRODUCTION:-false}

echo ""
echo -e "${YELLOW}🔑 APNs Key File${NC}"
echo ""
echo "Locate your APNs .p8 key file and paste the path:"
read -p "Path to AuthKey.p8: " APNS_KEY_PATH

if [[ ! -f "$APNS_KEY_PATH" ]]; then
    echo -e "${RED}❌ File not found: $APNS_KEY_PATH${NC}"
    exit 1
fi

# Base64 encode the key
APNS_KEY_BASE64=$(base64 < "$APNS_KEY_PATH" | tr -d '\n')
echo -e "${GREEN}✓${NC} APNs key encoded"

echo ""
echo -e "${YELLOW}🔐 JWT Secret${NC}"
echo ""
read -p "Generate random JWT secret? (Y/n): " GEN_JWT
if [[ "$GEN_JWT" != "n" && "$GEN_JWT" != "N" ]]; then
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    echo -e "${GREEN}✓${NC} JWT secret generated"
else
    read -sp "JWT_SECRET (paste here): " JWT_SECRET
    echo ""
fi

echo ""
echo -e "${BLUE}Setting environment variables...${NC}"

# Set all environment variables
railway variables set PORT=8080
railway variables set NODE_ENV=production
railway variables set LOG_LEVEL=info

railway variables set APNS_KEY_ID="$APNS_KEY_ID"
railway variables set APNS_TEAM_ID="$APNS_TEAM_ID"
railway variables set APNS_BUNDLE_ID="$APNS_BUNDLE_ID"
railway variables set APNS_PRODUCTION="$APNS_PRODUCTION"
railway variables set APNS_KEY_BASE64="$APNS_KEY_BASE64"

railway variables set JWT_SECRET="$JWT_SECRET"

# PostgreSQL and Redis will be auto-configured by Railway

echo -e "${GREEN}✓${NC} Environment variables set"

echo ""
echo -e "${BLUE}Step 6: Deploy${NC}"
railway up

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Deployment complete!                                                     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get deployment URL
RAILWAY_URL=$(railway domain 2>/dev/null || echo "")

if [[ -n "$RAILWAY_URL" ]]; then
    echo -e "${BLUE}🌐 Your Velya relay is live at:${NC}"
    echo "   https://$RAILWAY_URL"
    echo ""
    echo -e "${BLUE}Health check:${NC}"
    echo "   curl https://$RAILWAY_URL/health"
    echo ""
else
    echo -e "${YELLOW}⚠️  No custom domain configured yet.${NC}"
    echo ""
    echo "To add a custom domain:"
    echo "  railway domain"
    echo ""
fi

echo -e "${BLUE}Next steps:${NC}"
echo "  1. Test health endpoint: curl https://<your-url>/health"
echo "  2. Update iOS app with Railway URL"
echo "  3. Create API key for Node-RED (see README.md)"
echo "  4. Test end-to-end alarm delivery"
echo ""

echo -e "${YELLOW}📝 Save these for your records:${NC}"
echo "  - Railway URL: $RAILWAY_URL"
echo "  - APNs Key ID: $APNS_KEY_ID"
echo "  - APNs Team ID: $APNS_TEAM_ID"
echo "  - JWT Secret: $JWT_SECRET"
echo ""
