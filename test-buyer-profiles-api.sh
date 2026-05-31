#!/bin/bash

# Test script for buyer profiles API endpoints
# This verifies the CRUD operations work correctly

API_BASE="http://localhost:3000/api"

echo "=== Buyer Profiles API Test Suite ==="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

test_count=0
pass_count=0

# Helper function to make requests
test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_status=$4
  local description=$5

  test_count=$((test_count + 1))

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_BASE$endpoint" \
      -H "Content-Type: application/json")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_BASE$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi

  status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$status" = "$expected_status" ]; then
    echo -e "${GREEN}✓ Test $test_count: $description${NC}"
    echo "  Status: $status"
    pass_count=$((pass_count + 1))
  else
    echo -e "${RED}✗ Test $test_count: $description${NC}"
    echo "  Expected: $expected_status"
    echo "  Got: $status"
    echo "  Body: $body"
  fi
  echo ""

  echo "$body"
}

# Test 1: Create valid buyer profile
echo "1. Testing POST /api/buyer-profiles with valid data"
test_endpoint "POST" "/buyer-profiles" \
  '{
    "buyer_name": "John Smith",
    "bedrooms_min": 2,
    "bedrooms_max": 4,
    "bathrooms_min": 1.5,
    "bathrooms_max": 3,
    "price_min": 500000,
    "price_max": 1000000,
    "location": "West Pasadena",
    "property_type": "single_family",
    "hoa_allowed": true
  }' \
  "201" \
  "Create buyer profile"

# Test 2: Create with invalid range (bedrooms_min > bedrooms_max)
echo "2. Testing POST with invalid range (min > max)"
test_endpoint "POST" "/buyer-profiles" \
  '{
    "buyer_name": "Test Buyer",
    "bedrooms_min": 5,
    "bedrooms_max": 2
  }' \
  "400" \
  "Reject invalid bedrooms range"

# Test 3: Create with missing required field
echo "3. Testing POST with missing required field"
test_endpoint "POST" "/buyer-profiles" \
  '{
    "bedrooms_min": 2,
    "bedrooms_max": 4
  }' \
  "400" \
  "Reject missing buyer_name"

# Test 4: Fetch all buyer profiles
echo "4. Testing GET /api/buyer-profiles"
test_endpoint "GET" "/buyer-profiles" \
  "" \
  "200" \
  "Fetch all buyer profiles"

# Test 5: Test pagination
echo "5. Testing pagination parameters"
test_endpoint "GET" "/buyer-profiles?limit=5&offset=0" \
  "" \
  "200" \
  "Fetch with pagination"

# Test 6: Invalid pagination parameters
echo "6. Testing invalid pagination"
test_endpoint "GET" "/buyer-profiles?limit=abc&offset=xyz" \
  "" \
  "400" \
  "Reject invalid pagination"

echo ""
echo "=== Test Summary ==="
echo "Passed: $pass_count / $test_count"

if [ $pass_count -eq $test_count ]; then
  exit 0
else
  exit 1
fi
