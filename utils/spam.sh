#!/bin/bash

# --- Configuration ---
URL="http://localhost:8080"
EMAIL="test@example.com"
PASSWORD="password123"
ITERATIONS=10  # How many requests to send

echo "============================================="
echo "   🚀 RIDE STREAM - LOAD BALANCER TESTER"
echo "============================================="

# 1. Login to get JWT Token
echo ""
echo "[1] Logging in as $EMAIL..."
LOGIN_RESPONSE=$(curl -s -X POST "$URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

# Extract Token (using sed to avoid needing 'jq' installed)
TOKEN=$(echo $LOGIN_RESPONSE | sed 's/.*"token":"\([^"]*\)".*/\1/')

if [[ "$TOKEN" == *"message"* ]] || [[ -z "$TOKEN" ]]; then
    echo "❌ Login Failed! Response: $LOGIN_RESPONSE"
    echo "   (Make sure you have registered this user first via the UI)"
    exit 1
fi

echo "✅ Login Successful!"
echo "   Token: ${TOKEN:0:15}..."

# 2. Spam Requests
echo ""
echo "[2] Sending $ITERATIONS ride requests..."
echo "---------------------------------------------"

for ((i=1; i<=ITERATIONS; i++)); do
    RESPONSE=$(curl -s -X POST "$URL/api/ride/request" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"pickup\": \"Spam Loc $i\", \"destination\": \"Spam Dest $i\"}")
    
    # Print the clean response
    echo "Request #$i: $RESPONSE"
done

echo "---------------------------------------------"
echo "✅ Done! Check your 'docker-compose logs' to see the load balancing."