// Vercel Serverless Function - Notion API Proxy
// ==============================================
// This function proxies requests to the Notion API to avoid CORS issues
// The Notion API secret is kept server-side for security

import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOTION_API_SECRET = 'ntn_Y4956693031esIvt8ydLIJtlx7QozKmnTq7sBV4YO4c2XJ';
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).set(corsHeaders).end();
    return;
  }

  // Get the Notion API path from query parameter
  const { path } = req.query;
  
  if (!path || typeof path !== 'string') {
    res.status(400).set(corsHeaders).json({
      error: 'Missing path parameter',
      usage: 'Include ?path=/databases/{id}/query',
    });
    return;
  }

  try {
    const notionUrl = `${NOTION_API_BASE}${path.startsWith('/') ? path : '/' + path}`;
    
    // Determine the actual HTTP method
    // For GET requests, use GET
    // For other requests, the method is sent in the body
    let actualMethod = req.method || 'GET';
    let notionBody: string | undefined;
    
    if (req.method === 'POST' && req.body) {
      // Check if this is a proxied request with method in body
      if (req.body.method && typeof req.body.method === 'string') {
        actualMethod = req.body.method;
        notionBody = req.body.body ? JSON.stringify(req.body.body) : undefined;
      } else {
        // Direct POST request
        notionBody = JSON.stringify(req.body);
      }
    }

    const notionResponse = await fetch(notionUrl, {
      method: actualMethod,
      headers: {
        'Authorization': `Bearer ${NOTION_API_SECRET}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: notionBody,
    });

    const responseText = await notionResponse.text();
    let responseData: unknown;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    // Forward the response with CORS headers
    res
      .status(notionResponse.status)
      .set(corsHeaders)
      .json(responseData);
      
  } catch (error) {
    console.error('Notion API proxy error:', error);
    
    res.status(500).set(corsHeaders).json({
      error: 'Proxy error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
