#!/bin/bash

# Get auth token from the app
TOKEN=$(curl -s http://localhost:3000/api/auth/me -H "Cookie: $(curl -s -I http://localhost:3000 | grep -i set-cookie | head -1 | cut -d' ' -f2-)" | jq -r '.token // empty')

# Test the search API
curl -s "http://localhost:3000/api/help/articles?query=client&vertical=real_estate" \
  -H "Authorization: Bearer $TOKEN" | jq .
