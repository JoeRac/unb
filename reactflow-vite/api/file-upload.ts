// Vercel Serverless Function - Notion File Upload Proxy
// ======================================================
// This function handles file uploads to Notion's file upload API
// Supports multipart/form-data file uploads

import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOTION_API_SECRET = 'ntn_Y4956693031esIvt8ydLIJtlx7QozKmnTq7sBV4YO4c2XJ';
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';

// Disable body parsing - we need raw form data
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to set CORS headers
function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Parse multipart form data manually
async function parseMultipartFormData(req: VercelRequest): Promise<{ file: Buffer; filename: string; contentType: string } | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundary = contentType.split('boundary=')[1];
        
        if (!boundary) {
          resolve(null);
          return;
        }
        
        const boundaryBuffer = Buffer.from(`--${boundary}`);
        const parts = splitBuffer(buffer, boundaryBuffer);
        
        for (const part of parts) {
          const partStr = part.toString('utf-8', 0, Math.min(part.length, 1000));
          
          // Look for the file part
          if (partStr.includes('name="file"')) {
            // Find the end of headers (double newline)
            let headerEnd = -1;
            for (let i = 0; i < part.length - 3; i++) {
              if (part[i] === 13 && part[i+1] === 10 && part[i+2] === 13 && part[i+3] === 10) {
                headerEnd = i + 4;
                break;
              }
            }
            
            if (headerEnd === -1) continue;
            
            // Extract filename from headers
            const headers = partStr.substring(0, headerEnd);
            const filenameMatch = headers.match(/filename="([^"]+)"/);
            const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
            
            const filename = filenameMatch ? filenameMatch[1] : 'audio.webm';
            const fileContentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'audio/webm';
            
            // Extract file content (remove trailing boundary and newlines)
            let fileEnd = part.length;
            // Remove trailing \r\n if present
            if (part[fileEnd - 2] === 13 && part[fileEnd - 1] === 10) {
              fileEnd -= 2;
            }
            
            const fileContent = part.subarray(headerEnd, fileEnd);
            
            resolve({
              file: Buffer.from(fileContent),
              filename,
              contentType: fileContentType,
            });
            return;
          }
        }
        
        resolve(null);
      } catch (err) {
        reject(err);
      }
    });
    
    req.on('error', reject);
  });
}

// Helper to split buffer by boundary
function splitBuffer(buffer: Buffer, boundary: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  
  for (let i = 0; i <= buffer.length - boundary.length; i++) {
    let match = true;
    for (let j = 0; j < boundary.length; j++) {
      if (buffer[i + j] !== boundary[j]) {
        match = false;
        break;
      }
    }
    
    if (match) {
      if (i > start) {
        parts.push(buffer.subarray(start, i));
      }
      start = i + boundary.length;
      // Skip any following \r\n or --
      while (start < buffer.length && (buffer[start] === 13 || buffer[start] === 10 || buffer[start] === 45)) {
        start++;
      }
      i = start - 1;
    }
  }
  
  return parts;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    const { fileUploadId } = req.query;
    
    if (!fileUploadId || typeof fileUploadId !== 'string') {
      res.status(400).json({ error: 'Missing fileUploadId parameter' });
      return;
    }
    
    console.log('[File Upload] Parsing form data...');
    const parsed = await parseMultipartFormData(req);
    
    if (!parsed) {
      res.status(400).json({ error: 'No file provided or invalid form data' });
      return;
    }
    
    console.log('[File Upload] File received:', {
      name: parsed.filename,
      size: parsed.file.length,
      type: parsed.contentType,
    });
    
    // Create FormData for Notion API using native fetch FormData
    const blob = new Blob([parsed.file], { type: parsed.contentType });
    const formData = new FormData();
    formData.append('file', blob, parsed.filename);
    
    console.log('[File Upload] Sending to Notion...');
    
    const notionResponse = await fetch(
      `${NOTION_API_BASE}/file_uploads/${fileUploadId}/send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_API_SECRET}`,
          'Notion-Version': NOTION_API_VERSION,
        },
        body: formData,
      }
    );
    
    const responseText = await notionResponse.text();
    console.log('[File Upload] Notion response:', notionResponse.status, responseText);
    
    let responseData: unknown;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }
    
    res.status(notionResponse.status).json(responseData);
    
  } catch (error) {
    console.error('[File Upload] Error:', error);
    res.status(500).json({
      error: 'File upload error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
