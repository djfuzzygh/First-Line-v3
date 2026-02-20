#!/bin/bash

echo "🏥 FirstLine Clinician Web App - Quick Start"
echo "==========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Navigate to clinician app directory
cd clinician-app

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file..."
    echo "VITE_API_URL=https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1" > .env
    echo "✅ .env file created"
    echo ""
fi

echo "🚀 Starting development server..."
echo ""
echo "📱 Clinician App will be available at: http://localhost:3001"
echo ""
echo "🔑 Test Credentials:"
echo "   Healthcare Worker:"
echo "   - Email: test@test.com"
echo "   - Password: Test123!"
echo ""
echo "   Admin:"
echo "   - Email: admin@firstline.health"
echo "   - Password: FirstLine2026!"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
