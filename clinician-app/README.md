# FirstLine Clinician Web Application

A web-based clinical interface for healthcare workers to conduct AI-powered patient triage sessions.

## Overview

This application provides healthcare professionals with an intuitive interface to:
- Register new patient encounters
- Collect patient demographics, symptoms, and vital signs
- Perform AI-powered triage assessments
- View triage recommendations and danger signs
- Generate referral documents

## Features

### 🏥 Patient Encounter Management
- Create new patient encounters with demographics
- Record vital signs (temperature, pulse, BP, respiratory rate)
- Document chief complaints and symptoms

### 🤖 AI-Powered Triage
- Automated triage level assignment (RED/YELLOW/GREEN)
- Clinical assessment and recommendations
- Danger sign detection
- Evidence-based decision support

### 📋 Clinical Workflow
- Streamlined data entry
- Real-time triage analysis
- Referral generation
- Encounter history (coming soon)

## Getting Started

### Prerequisites
- Node.js 18+ installed
- Access to FirstLine backend API

### Installation

```bash
cd clinician-app
npm install
```

### Configuration

Create a `.env` file:
```
VITE_API_URL=https://<your-backend-url>
```

### Development

```bash
npm run dev
```

The app will be available at http://localhost:3001

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Usage

### Login
Use your healthcare worker credentials:
- Email: test@test.com
- Password: Test123!

Or admin credentials:
- Email: admin@firstline.health
- Password: FirstLine2026!

### Workflow

1. **Start New Encounter**
   - Click "New Patient" button
   - Enter patient demographics (age, sex, location)
   - Document symptoms and chief complaint
   - Optionally record vital signs
   - Click "Start Triage"

2. **Perform Triage**
   - Review patient information
   - Click "Perform AI Triage"
   - Wait for AI analysis (typically 5-10 seconds)
   - Review triage level and recommendations

3. **Complete Encounter**
   - Generate referral if needed
   - Document any additional notes
   - Complete the encounter

## Triage Levels

- 🔴 **RED** - Emergency: Immediate care required, life-threatening
- 🟡 **YELLOW** - Urgent: Care needed within 24 hours
- 🟢 **GREEN** - Routine: Self-care possible, routine follow-up

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Material-UI** - Component library
- **Vite** - Build tool
- **Axios** - API client
- **React Router** - Navigation

## API Integration

The app connects to the FirstLine backend API for:
- Authentication (`/auth/login`)
- Encounter creation (`POST /encounters`)
- Triage analysis (`POST /encounters/:id/triage`)
- Referral generation (`POST /encounters/:id/referral`)

## Security

- JWT-based authentication
- Token stored in localStorage
- Automatic token injection in API requests
- Protected routes requiring authentication

## Deployment

### Option 1: Static Hosting (Recommended)
Build and deploy `dist/` to your preferred static host.

### Option 2: Vercel/Netlify
```bash
npm run build
# Deploy dist/ folder to your hosting provider
```

### Option 3: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "3001"]
```

## Future Enhancements

- [ ] Encounter history with search/filter
- [ ] Follow-up question handling
- [ ] Offline support with sync
- [ ] Print referral documents
- [ ] Multi-language support
- [ ] Voice input for symptoms
- [ ] Photo upload for visual symptoms
- [ ] Integration with EMR systems

## Support

For issues or questions, contact the FirstLine development team.

## License

CC BY 4.0
