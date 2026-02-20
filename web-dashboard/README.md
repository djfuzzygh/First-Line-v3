# FirstLine Web Dashboard

React-based web dashboard for administrators to monitor and analyze healthcare triage operations.

## Features

- **Real-time Dashboard**: View key metrics and statistics
- **Triage Analytics**: Visualize triage level distribution
- **Channel Insights**: Track encounters across different channels (app, voice, SMS, USSD)
- **Symptom Trends**: Identify common symptoms and patterns
- **Performance Monitoring**: Track AI latency and system health
- **Responsive Design**: Works on desktop, tablet, and mobile

## Prerequisites

- Node.js 18+ and npm

## Installation

```bash
cd web-dashboard
npm install
```

## Configuration

Create a `.env` file in the web-dashboard directory:

```env
VITE_API_URL=https://your-api-gateway-url.amazonaws.com/v1
```

## Running the Dashboard

### Development Mode

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### Production Build

```bash
npm run build
npm run preview
```

## Deployment

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Deploy to S3 + CloudFront

```bash
# Build the app
npm run build

# Upload to S3
aws s3 sync dist/ s3://your-dashboard-bucket/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### Deploy to Netlify

```bash
npm run build
netlify deploy --prod --dir=dist
```

### Deploy to Vercel

```bash
npm run build
vercel --prod
```

## Project Structure

```
web-dashboard/
├── src/
│   ├── components/       # Reusable components
│   │   └── Layout.tsx
│   ├── pages/           # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Encounters.tsx
│   │   ├── Analytics.tsx
│   │   └── Settings.tsx
│   ├── services/        # API services
│   │   └── api.ts
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
├── index.html
├── vite.config.ts
└── package.json
```

## Dashboard Pages

### Dashboard (/)
- Total encounters count
- Danger signs detected
- Referrals generated
- Average AI latency
- Triage level distribution (pie chart)
- Channel distribution (bar chart)
- Top symptoms (bar chart)

### Encounters (/encounters)
- List of all encounters
- Search and filter
- View encounter details
- (To be implemented)

### Analytics (/analytics)
- Advanced reporting
- Time-series analysis
- Export capabilities
- (To be implemented)

### Settings (/settings)
- System configuration
- User management
- API key management
- (To be implemented)

## Technologies Used

- **React 18**: UI framework
- **TypeScript**: Type safety
- **Material-UI**: Component library
- **Recharts**: Data visualization
- **React Router**: Navigation
- **Axios**: HTTP client
- **Vite**: Build tool

## API Integration

The dashboard connects to the FirstLine backend API:

```typescript
// Example API call
import { dashboardApi } from './services/api';

const stats = await dashboardApi.getStats();
```

## Authentication

Add authentication token to localStorage:

```javascript
localStorage.setItem('authToken', 'your-jwt-token');
```

The API service automatically includes the token in all requests.

## Customization

### Theme

Edit `src/main.tsx` to customize the Material-UI theme:

```typescript
const theme = createTheme({
  palette: {
    primary: { main: '#2196F3' },
    secondary: { main: '#4CAF50' },
  },
});
```

### Charts

Modify chart colors in `src/pages/Dashboard.tsx`:

```typescript
const COLORS = {
  RED: '#F44336',
  YELLOW: '#FF9800',
  GREEN: '#4CAF50',
};
```

## Testing

```bash
npm test
```

## Troubleshooting

### Port Already in Use

Change the port in `vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    port: 3001,
  },
});
```

### API Connection Issues

Check your `.env` file and ensure the API URL is correct.

## License

MIT
