const fs = require('fs');
const path = require('path');

const handlersDir = './src/handlers';
const adminHandlers = [
  'admin-ai-handler.ts',
  'admin-deployment-handler.ts',
  'admin-edge-handler.ts',
  'admin-monitoring-handler.ts',
  'admin-protocol-handler.ts',
  'admin-telecom-handler.ts',
  'admin-user-handler.ts',
  'admin-voice-handler.ts',
];

adminHandlers.forEach(filename => {
  const filepath = path.join(handlersDir, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`Skipping ${filename} - not found`);
    return;
  }
  
  let content = fs.readFileSync(filepath, 'utf8');
  
  // Fix imports
  content = content.replace(
    /import { DynamoDBService } from '\.\.\/services\/dynamodb\.service';/g,
    "import { AdminDynamoDBService } from '../services/admin-dynamodb.service';"
  );
  
  content = content.replace(
    /import { handleError } from '\.\.\/utils\/error-handler';/g,
    "import { handleError, createSuccessResponse } from '../utils/admin-helpers';"
  );
  
  // Fix instantiation
  content = content.replace(
    /const dynamoDb = new DynamoDBService\(\);/g,
    'const dynamoDb = new AdminDynamoDBService();'
  );
  
  // Fix getItem calls
  content = content.replace(
    /dynamoDb\.getItem\(\{\s*TableName: CONFIG_TABLE,\s*Key: \{ PK: '([^']+)', SK: '([^']+)' \},?\s*\}\)/g,
    "dynamoDb.getItem({ PK: '$1', SK: '$2' })"
  );
  
  // Fix putItem calls - simple version
  content = content.replace(
    /dynamoDb\.putItem\(\{\s*TableName: CONFIG_TABLE,\s*Item: \{/g,
    'dynamoDb.putItem({'
  );
  
  // Fix deleteItem calls
  content = content.replace(
    /dynamoDb\.deleteItem\(\{\s*TableName: CONFIG_TABLE,\s*Key: \{ PK: '([^']+)', SK: '([^']+)' \},?\s*\}\)/g,
    "dynamoDb.deleteItem({ PK: '$1', SK: '$2' })"
  );
  
  // Fix result.Item references
  content = content.replace(/result\.Item\?/g, 'result?');
  content = content.replace(/result\.Item \|\|/g, 'result ||');
  content = content.replace(/result\.Item\./g, 'result.');
  
  fs.writeFileSync(filepath, content);
  console.log(`Fixed ${filename}`);
});

console.log('Done!');
