#!/bin/bash

echo "Fixing admin handler imports..."

# Fix imports in all admin handlers
for file in src/handlers/admin-*.ts; do
  echo "Fixing $file..."
  
  # Replace DynamoDBService import
  sed -i '' 's/import { DynamoDBService } from/import { AdminDynamoDBService } from/g' "$file"
  sed -i '' 's/dynamodb\.service/admin-dynamodb.service/g' "$file"
  
  # Replace error handler import
  sed -i '' 's/import { handleError } from/import { handleError, createSuccessResponse } from/g' "$file"
  sed -i '' 's/error-handler/admin-helpers/g' "$file"
  
  # Replace DynamoDBService instantiation
  sed -i '' 's/new DynamoDBService()/new AdminDynamoDBService()/g' "$file"
done

echo "Done! Now rebuilding..."
npm run build
