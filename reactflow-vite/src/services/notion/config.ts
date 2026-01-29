// Notion API Configuration
// =========================
// All Notion-related configuration in one place

export const NOTION_CONFIG = {
  // API Secret (will be used server-side via Vercel proxy)
  API_SECRET: 'ntn_Y4956693031esIvt8ydLIJtlx7QozKmnTq7sBV4YO4c2XJ',
  
  // Database IDs from Notion workspace "Unburdened"
  DATABASES: {
    NODES: '2f612771-2227-8080-93f4-d9e5c864b331',
    PATHS: '2f612771-2227-808a-a651-c9b440f491b7',
    NODE_PATH: '2f612771-2227-8035-86e9-e2435e699d10',
    CATEGORIES: '2f712771-2227-8023-b8e9-e42b12c9f4a1',
  },
  
  // API Endpoints
  // In production, use Vercel serverless function to avoid CORS
  // In development, use Vite proxy
  get BASE_URL() {
    // Check if we're in development
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return '/notion-api/v1';
    }
    // Production: Use Vercel serverless function
    return '/api/notion';
  },
  
  // Notion API version
  API_VERSION: '2022-06-28',
  
  // Sync configuration
  SYNC: {
    // Debounce delay for auto-save (ms)
    DEBOUNCE_DELAY: 1000,
    // Retry attempts for failed requests
    MAX_RETRIES: 3,
    // Delay between retries (ms)
    RETRY_DELAY: 1000,
    // Cache duration (ms) - 5 minutes
    CACHE_DURATION: 5 * 60 * 1000,
  },
  
  // Feature flags
  FEATURES: {
    // Enable rich text parsing
    RICH_TEXT_PARSING: true,
    // Enable offline support (queue changes when offline)
    OFFLINE_SUPPORT: true,
    // Enable real-time sync status indicator
    SYNC_STATUS_INDICATOR: true,
  },
} as const;

// Type for data source selection
export type DataSource = 'notion';

// Default data source - can be changed to switch between backends
export const DATA_SOURCE: DataSource = 'notion';
