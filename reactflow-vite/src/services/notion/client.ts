// Notion API Client
// ==================
// Low-level API client with error handling, retries, and request queue

import { NOTION_CONFIG } from './config';
import type { 
  NotionQueryResponse, 
  NotionPage, 
  SyncStatus 
} from './types';

// ============================================
// Types
// ============================================

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  retries?: number;
}

interface QueuedRequest {
  id: string;
  options: RequestOptions;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

// ============================================
// Sync Status Management
// ============================================

type SyncStatusListener = (status: SyncStatus, message?: string) => void;

const statusListeners = new Set<SyncStatusListener>();
let currentStatus: SyncStatus = 'idle';
let currentMessage: string | undefined;

export function addSyncStatusListener(listener: SyncStatusListener): () => void {
  statusListeners.add(listener);
  // Immediately notify with current status
  listener(currentStatus, currentMessage);
  return () => statusListeners.delete(listener);
}

function updateSyncStatus(status: SyncStatus, message?: string): void {
  currentStatus = status;
  currentMessage = message;
  statusListeners.forEach(listener => listener(status, message));
}

export function getSyncStatus(): { status: SyncStatus; message?: string } {
  return { status: currentStatus, message: currentMessage };
}

// ============================================
// Network Status Detection
// ============================================

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    updateSyncStatus('idle');
    processQueue(); // Process any queued requests
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncStatus('offline', 'You are offline. Changes will sync when connection is restored.');
  });
}

export function getIsOnline(): boolean {
  return isOnline;
}

// ============================================
// Request Queue for Offline Support
// ============================================

const requestQueue: QueuedRequest[] = [];
let isProcessingQueue = false;

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function processQueue(): Promise<void> {
  if (isProcessingQueue || !isOnline || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  updateSyncStatus('syncing', `Syncing ${requestQueue.length} pending changes...`);
  
  while (requestQueue.length > 0 && isOnline) {
    const request = requestQueue[0];
    try {
      const result = await executeRequest(request.options);
      request.resolve(result);
      requestQueue.shift();
    } catch (error) {
      // If it's a network error and we're offline, stop processing
      if (!isOnline) break;
      // Otherwise, reject and remove from queue
      request.reject(error instanceof Error ? error : new Error(String(error)));
      requestQueue.shift();
    }
  }
  
  isProcessingQueue = false;
  
  if (requestQueue.length === 0) {
    updateSyncStatus('success', 'All changes saved');
    // Reset to idle after a short delay
    setTimeout(() => {
      if (currentStatus === 'success') {
        updateSyncStatus('idle');
      }
    }, 2000);
  }
}

// ============================================
// Core Request Execution
// ============================================

function isDevelopment(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost';
}

async function executeRequest<T>(options: RequestOptions): Promise<T> {
  const { method, path, body, retries = NOTION_CONFIG.SYNC.MAX_RETRIES } = options;
  
  let url: string;
  let fetchOptions: RequestInit;
  
  const isDev = isDevelopment();
  console.log(`[Notion API] ${method} ${path} (${isDev ? 'development' : 'production'})`);
  
  if (isDev) {
    // Development: Direct Notion API calls via Vite proxy
    // Vite proxy at /notion-api -> https://api.notion.com, handles auth headers
    url = `/notion-api/v1${path}`;
    fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    };
  } else {
    // Production: Use Vercel serverless proxy
    url = `/api/notion?path=${encodeURIComponent(path)}`;
    
    // Always use POST for the proxy, sending method and body in the request body
    fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method,
        body: body || {},
      }),
    };
  }
  
  console.log(`[Notion API] Fetching: ${url}`);
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      
      console.log(`[Notion API] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Notion API] Error response:`, errorText);
        let errorMessage: string;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || `HTTP ${response.status}`;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}`;
        }
        
        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new NotionAPIError(errorMessage, response.status);
        }
        
        throw new NotionAPIError(errorMessage, response.status);
      }
      
      const data = await response.json();
      return data as T;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry
      if (attempt < retries) {
        // Exponential backoff
        const delay = NOTION_CONFIG.SYNC.RETRY_DELAY * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Request failed');
}

// ============================================
// Custom Error Class
// ============================================

export class NotionAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'NotionAPIError';
  }
}

// ============================================
// Public API Methods
// ============================================

/**
 * Make a request to the Notion API
 * Handles offline queueing, retries, and error handling
 */
export async function notionRequest<T>(options: RequestOptions): Promise<T> {
  // If offline and it's a write operation, queue it
  if (!isOnline && options.method !== 'GET') {
    if (NOTION_CONFIG.FEATURES.OFFLINE_SUPPORT) {
      return new Promise<T>((resolve, reject) => {
        requestQueue.push({
          id: generateRequestId(),
          options,
          resolve: resolve as (value: unknown) => void,
          reject,
          timestamp: Date.now(),
        });
        updateSyncStatus('offline', `${requestQueue.length} changes pending`);
      });
    } else {
      throw new NotionAPIError('You are offline', 0, 'OFFLINE');
    }
  }
  
  // If online, update status and execute
  if (options.method !== 'GET') {
    updateSyncStatus('syncing');
  }
  
  try {
    const result = await executeRequest<T>(options);
    
    if (options.method !== 'GET') {
      updateSyncStatus('success');
      setTimeout(() => {
        if (currentStatus === 'success') {
          updateSyncStatus('idle');
        }
      }, 2000);
    }
    
    return result;
  } catch (error) {
    updateSyncStatus('error', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// ============================================
// Database Operations
// ============================================

/**
 * Query a Notion database with optional filters
 */
export async function queryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>,
  startCursor?: string
): Promise<NotionQueryResponse> {
  const body: Record<string, unknown> = {};
  
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;
  if (startCursor) body.start_cursor = startCursor;
  
  return notionRequest<NotionQueryResponse>({
    method: 'POST',
    path: `/databases/${databaseId}/query`,
    body,
  });
}

/**
 * Query all pages from a database (handles pagination)
 */
export async function queryAllDatabasePages(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>
): Promise<NotionPage[]> {
  const allPages: NotionPage[] = [];
  let startCursor: string | undefined;
  
  do {
    const response = await queryDatabase(databaseId, filter, sorts, startCursor);
    allPages.push(...response.results);
    startCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (startCursor);
  
  return allPages;
}

/**
 * Get a single page by ID
 */
export async function getPage(pageId: string): Promise<NotionPage> {
  return notionRequest<NotionPage>({
    method: 'GET',
    path: `/pages/${pageId}`,
  });
}

/**
 * Create a new page in a database
 */
export async function createPage(
  databaseId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  return notionRequest<NotionPage>({
    method: 'POST',
    path: '/pages',
    body: {
      parent: { database_id: databaseId },
      properties,
    },
  });
}

/**
 * Update an existing page
 */
export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  return notionRequest<NotionPage>({
    method: 'PATCH',
    path: `/pages/${pageId}`,
    body: { properties },
  });
}

/**
 * Archive (soft delete) a page
 */
export async function archivePage(pageId: string): Promise<NotionPage> {
  return notionRequest<NotionPage>({
    method: 'PATCH',
    path: `/pages/${pageId}`,
    body: { archived: true },
  });
}

/**
 * Get page content (blocks)
 */
export async function getPageBlocks(pageId: string): Promise<NotionQueryResponse> {
  return notionRequest<NotionQueryResponse>({
    method: 'GET',
    path: `/blocks/${pageId}/children`,
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get the number of pending changes
 */
export function getPendingChangesCount(): number {
  return requestQueue.length;
}

/**
 * Force process the queue (useful for manual sync)
 */
export function forceSyncQueue(): Promise<void> {
  return processQueue();
}

/**
 * Clear all pending changes (use with caution)
 */
export function clearPendingChanges(): void {
  requestQueue.forEach(req => {
    req.reject(new Error('Queue cleared'));
  });
  requestQueue.length = 0;
  updateSyncStatus('idle');
}

// ============================================
// File Upload Operations
// ============================================

interface FileUploadObject {
  object: 'file_upload';
  id: string;
  created_time: string;
  last_edited_time: string;
  expiry_time: string;
  upload_url: string;
  archived: boolean;
  status: 'pending' | 'uploaded';
  filename: string | null;
  content_type: string | null;
  content_length: string | null;
}

/**
 * Create a file upload object
 * Step 1 of the file upload process
 */
export async function createFileUpload(): Promise<FileUploadObject> {
  return notionRequest<FileUploadObject>({
    method: 'POST',
    path: '/file_uploads',
    body: {},
  });
}

/**
 * Send file contents to Notion
 * Step 2 of the file upload process
 * This requires special handling with multipart/form-data
 */
export async function sendFileUpload(
  fileUploadId: string,
  file: Blob,
  filename: string
): Promise<FileUploadObject> {
  const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  
  console.log('[sendFileUpload] Uploading file:', {
    fileUploadId,
    filename,
    type: file.type,
    size: file.size,
    isDev,
  });
  
  const formData = new FormData();
  formData.append('file', file, filename);
  
  let url: string;
  
  if (isDev) {
    // Development: Use Vite proxy
    url = `/notion-api/v1/file_uploads/${fileUploadId}/send`;
  } else {
    // Production: Use Vercel serverless function
    url = `/api/file-upload?fileUploadId=${encodeURIComponent(fileUploadId)}`;
  }
  
  console.log('[sendFileUpload] URL:', url);
  updateSyncStatus('syncing', 'Uploading audio...');
  
  const response = await fetch(url, {
    method: 'POST',
    // Don't set Content-Type for FormData - browser will set it with boundary
    body: formData,
  });
  
  console.log('[sendFileUpload] Response status:', response.status);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[sendFileUpload] Error response:', errorData);
    throw new NotionAPIError(
      errorData.message || `File upload failed: ${response.status}`,
      response.status,
      errorData.code
    );
  }
  
  const result = await response.json();
  console.log('[sendFileUpload] Success:', result);
  updateSyncStatus('success', 'Audio uploaded');
  
  return result as FileUploadObject;
}

/**
 * Upload a file to Notion and get the file upload ID
 * Combines steps 1 and 2
 */
export async function uploadFile(file: Blob, filename: string): Promise<string> {
  // Step 1: Create file upload object
  const fileUpload = await createFileUpload();
  
  // Step 2: Send the file
  const uploadedFile = await sendFileUpload(fileUpload.id, file, filename);
  
  if (uploadedFile.status !== 'uploaded') {
    throw new NotionAPIError('File upload did not complete', 500, 'UPLOAD_INCOMPLETE');
  }
  
  return uploadedFile.id;
}

/**
 * Create a files property value for Notion page update
 * Use this when attaching an uploaded file to a page property
 */
export function createFilesPropertyValue(
  fileUploadId: string,
  filename: string
): { type: 'files'; files: Array<{ type: 'file_upload'; file_upload: { id: string }; name: string }> } {
  return {
    type: 'files',
    files: [
      {
        type: 'file_upload',
        file_upload: { id: fileUploadId },
        name: filename,
      },
    ],
  };
}
