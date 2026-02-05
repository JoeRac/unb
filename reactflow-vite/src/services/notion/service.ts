// Notion Service
// ===============
// High-level service for all Notion data operations

import { NOTION_CONFIG } from './config';
import {
  queryAllDatabasePages,
  createPage,
  updatePage,
  archivePage,
  NotionAPIError,
  uploadFile,
} from './client';
import {
  notionPagesToNodes,
  notionPagesToPaths,
  notionPagesToNodePaths,
  notionPagesToCategories,
  pathToNotionProperties,
  nodePathToNotionProperties,
  categoryToNotionProperties,
} from './transformers';
import type {
  NodeRecord,
  PathRecord,
  NodePathRecord,
  CategoryRecord,
  NotionPage,
  AudioNoteData,
} from './types';

// ============================================
// Cache Management
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache: {
  nodes: CacheEntry<NodeRecord[]> | null;
  paths: CacheEntry<PathRecord[]> | null;
  nodePaths: CacheEntry<NodePathRecord[]> | null;
  categories: CacheEntry<CategoryRecord[]> | null;
  pathPageIds: Map<string, string>; // pathId -> notionPageId
  nodePathPageIds: Map<string, string>; // pathId_nodeId -> notionPageId
} = {
  nodes: null,
  paths: null,
  nodePaths: null,
  categories: null,
  pathPageIds: new Map(),
  nodePathPageIds: new Map(),
};

function isCacheValid<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.timestamp < NOTION_CONFIG.SYNC.CACHE_DURATION;
}

function clearCache(): void {
  cache.nodes = null;
  cache.paths = null;
  cache.nodePaths = null;
  cache.categories = null;
}

// ============================================
// Category Operations
// ============================================

/**
 * Fetch all categories from Notion
 */
export async function fetchCategories(forceRefresh = false): Promise<CategoryRecord[]> {
  if (!forceRefresh && isCacheValid(cache.categories)) {
    console.log('Returning cached categories:', cache.categories.data);
    return cache.categories.data;
  }
  
  try {
    console.log('Fetching categories from Notion database:', NOTION_CONFIG.DATABASES.CATEGORIES);
    const pages = await queryAllDatabasePages(NOTION_CONFIG.DATABASES.CATEGORIES);
    console.log('Fetched pages:', pages.length, pages);
    const categories = notionPagesToCategories(pages);
    console.log('Parsed categories:', categories);
    
    cache.categories = {
      data: categories,
      timestamp: Date.now(),
    };
    
    return categories;
  } catch (error) {
    console.error('Error fetching categories from Notion:', error);
    // Return empty array instead of throwing to avoid breaking the UI
    return [];
  }
}

/**
 * Create a new category in Notion
 */
export async function createCategory(name: string, parentId?: string | null): Promise<CategoryRecord> {
  const id = `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const properties = categoryToNotionProperties({ id, name, parentId });
    console.log('Creating category with properties:', properties);
    console.log('Database ID:', NOTION_CONFIG.DATABASES.CATEGORIES);
    const resultPage = await createPage(NOTION_CONFIG.DATABASES.CATEGORIES, properties);
    console.log('Created category page:', resultPage);

    const newCategory: CategoryRecord = {
      id,
      notionPageId: resultPage.id,
      name,
      parentId: parentId || null,
    };

    // Invalidate cache so next fetch gets the new category
    cache.categories = null;

    return newCategory;
  } catch (error) {
    console.error('Error creating category in Notion:', error);
    throw error;
  }
}

/**
 * Delete a category (archive the page in Notion)
 */
export async function deleteCategory(notionPageId: string): Promise<void> {
  try {
    await archivePage(notionPageId);
    // Invalidate cache
    cache.categories = null;
  } catch (error) {
    console.error('Error deleting category in Notion:', error);
    throw error;
  }
}

/**
 * Update a category (name and/or parent)
 */
export async function updateCategory(
  notionPageId: string,
  updates: { name?: string; parentId?: string | null }
): Promise<void> {
  try {
    const properties: Record<string, unknown> = {};
    
    if (updates.name !== undefined) {
      properties.name = {
        title: [{ text: { content: updates.name } }],
      };
    }
    
    // 'parent' is a rich text property storing the notionPageId of the parent folder
    if (updates.parentId !== undefined) {
      properties.parent = {
        rich_text: [{ text: { content: updates.parentId || '' } }],
      };
    }
    
    await updatePage(notionPageId, properties);
    // Invalidate cache
    cache.categories = null;
  } catch (error) {
    console.error('Error updating category in Notion:', error);
    throw error;
  }
}

// ============================================
// Node Operations
// ============================================

/**
 * Fetch all nodes from Notion
 */
export async function fetchNodes(forceRefresh = false): Promise<NodeRecord[]> {
  if (!forceRefresh && isCacheValid(cache.nodes)) {
    return cache.nodes.data;
  }
  
  try {
    const pages = await queryAllDatabasePages(NOTION_CONFIG.DATABASES.NODES);
    const nodes = notionPagesToNodes(pages);
    
    cache.nodes = {
      data: nodes,
      timestamp: Date.now(),
    };
    
    return nodes;
  } catch (error) {
    console.error('Error fetching nodes from Notion:', error);
    throw error;
  }
}

// ============================================
// Path Operations
// ============================================

/**
 * Fetch all paths from Notion
 */
export async function fetchPaths(forceRefresh = false): Promise<PathRecord[]> {
  if (!forceRefresh && isCacheValid(cache.paths)) {
    return cache.paths.data;
  }
  
  try {
    const pages = await queryAllDatabasePages(NOTION_CONFIG.DATABASES.PATHS);
    const paths = notionPagesToPaths(pages);
    
    // Update page ID cache
    pages.forEach((page) => {
      const path = notionPagesToPaths([page])[0];
      if (path?.id) {
        cache.pathPageIds.set(path.id, page.id);
      }
    });
    
    cache.paths = {
      data: paths,
      timestamp: Date.now(),
    };
    
    return paths;
  } catch (error) {
    console.error('Error fetching paths from Notion:', error);
    throw error;
  }
}

/**
 * Find existing path by ID
 */
async function findPathByAppId(appId: string): Promise<NotionPage | null> {
  // Check cache first
  const notionPageId = cache.pathPageIds.get(appId);
  if (notionPageId) {
    // We have the page ID, can use it directly
    return { id: notionPageId } as NotionPage;
  }
  
  // Query for the path
  try {
    const pages = await queryAllDatabasePages(
      NOTION_CONFIG.DATABASES.PATHS,
      {
        property: 'id',
        title: { equals: appId },
      }
    );
    
    if (pages.length > 0) {
      cache.pathPageIds.set(appId, pages[0].id);
      return pages[0];
    }
  } catch (error) {
    console.error('Error finding path:', error);
  }
  
  return null;
}

/**
 * Save a path (create or update)
 */
export async function savePath(path: PathRecord): Promise<PathRecord> {
  const pathWithDate: PathRecord = {
    ...path,
    dateUpdated: path.dateUpdated || new Date().toISOString(),
  };
  const properties = pathToNotionProperties(pathWithDate);
  
  try {
    // Try to find existing path
    const existingPage = await findPathByAppId(path.id);
    
    let resultPage: NotionPage;
    
    if (existingPage) {
      // Update existing
      resultPage = await updatePage(existingPage.id, properties);
    } else {
      // Create new
      resultPage = await createPage(NOTION_CONFIG.DATABASES.PATHS, properties);
      cache.pathPageIds.set(path.id, resultPage.id);
    }
    
    // Invalidate cache
    cache.paths = null;
    
    return {
      ...pathWithDate,
      notionPageId: resultPage.id,
      lastModified: resultPage.last_edited_time,
    };
  } catch (error) {
    console.error('Error saving path to Notion:', error);
    throw error;
  }
}

/**
 * Update path nodes only
 */
export async function updatePathNodes(
  pathId: string,
  pathName: string,
  nodeIds: string[]
): Promise<void> {
  const existingPage = await findPathByAppId(pathId);
  
  if (!existingPage) {
    // Create new path with just the essential info
    await savePath({
      id: pathId,
      name: pathName,
      nodeIds,
    });
    return;
  }
  
  // Update only nodeIds
  const nodeIdsStr = nodeIds.length === 1 ? nodeIds[0] + ',' : nodeIds.join(', ');
  await updatePage(existingPage.id, {
    nodeIds: { rich_text: [{ text: { content: nodeIdsStr } }] },
    date_updated: { date: { start: new Date().toISOString() } },
  });
  
  // Invalidate cache
  cache.paths = null;
}

/**
 * Update path category
 */
export async function updatePathCategory(
  pathId: string,
  category: string,
  subcategory: string,
  subsubcategory: string
): Promise<void> {
  const existingPage = await findPathByAppId(pathId);
  
  if (!existingPage) {
    console.error('Path not found for category update:', pathId);
    return;
  }
  
  await updatePage(existingPage.id, {
    category: { rich_text: [{ text: { content: category || '' } }] },
    subcategory: { rich_text: [{ text: { content: subcategory || '' } }] },
    subsubcategory: { rich_text: [{ text: { content: subsubcategory || '' } }] },
  });
  
  // Invalidate cache
  cache.paths = null;
}

/**
 * Update path priority
 */
export async function updatePathPriority(
  pathId: string,
  priority: number
): Promise<void> {
  const existingPage = await findPathByAppId(pathId);
  
  if (!existingPage) {
    console.error('Path not found for priority update:', pathId);
    return;
  }
  
  await updatePage(existingPage.id, {
    priority: { number: priority },
  });
  
  // Invalidate cache
  cache.paths = null;
}

/**
 * Update path status (e.g., 'archived')
 */
export async function updatePathStatus(
  pathId: string,
  status: string
): Promise<void> {
  const existingPage = await findPathByAppId(pathId);
  
  if (!existingPage) {
    console.error('Path not found for status update:', pathId);
    return;
  }
  
  await updatePage(existingPage.id, {
    status: { rich_text: [{ text: { content: status } }] },
  });
  
  // Invalidate cache
  cache.paths = null;
}

/**
 * Rename a path
 */
export async function renamePath(
  pathId: string,
  newName: string
): Promise<void> {
  const existingPage = await findPathByAppId(pathId);
  
  if (!existingPage) {
    console.error('Path not found for rename:', pathId);
    return;
  }
  
  await updatePage(existingPage.id, {
    name: { rich_text: [{ text: { content: newName } }] },
  });
  
  // Invalidate cache
  cache.paths = null;
}

/**
 * Save path notes
 */
export async function savePathNotes(
  pathId: string,
  notes: string
): Promise<void> {
  const existingPage = await findPathByAppId(pathId);
  
  if (!existingPage) {
    console.error('Path not found for notes update:', pathId);
    return;
  }
  
  await updatePage(existingPage.id, {
    notes: { rich_text: [{ text: { content: notes || '' } }] },
    date_updated: { date: { start: new Date().toISOString() } },
  });
  
  // Invalidate cache
  cache.paths = null;
}

/**
 * Delete a path (moves to Notion trash)
 */
export async function deletePath(pathId: string): Promise<void> {
  const existingPage = await findPathByAppId(pathId);
  
  if (!existingPage) {
    console.warn('Path not found for deletion:', pathId);
    return;
  }

  // Archive the page (moves to Notion trash)
  await archivePage(existingPage.id);
  
  // Remove from cache
  cache.pathPageIds.delete(pathId);
  cache.paths = null;
}

/**
 * Delete all node-path records for a given path (moves to Notion trash)
 */
export async function deleteNodePathsForPath(pathId: string): Promise<void> {
  try {
    // Find all node-path records for this path
    const pages = await queryAllDatabasePages(
      NOTION_CONFIG.DATABASES.NODE_PATH,
      {
        property: 'pathId',
        rich_text: { equals: pathId },
      }
    );
    
    // Archive each one
    for (const page of pages) {
      await archivePage(page.id);
    }
    
    // Invalidate cache
    cache.nodePaths = null;
  } catch (error) {
    console.error('Error deleting node-paths for path:', pathId, error);
  }
}

// ============================================
// Node-Path (User Notes) Operations
// ============================================

/**
 * Fetch all node-path content
 */
export async function fetchNodePaths(forceRefresh = false): Promise<NodePathRecord[]> {
  if (!forceRefresh && isCacheValid(cache.nodePaths)) {
    return cache.nodePaths.data;
  }
  
  try {
    const pages = await queryAllDatabasePages(NOTION_CONFIG.DATABASES.NODE_PATH);
    const nodePaths = notionPagesToNodePaths(pages);
    
    // Update page ID cache
    pages.forEach((page) => {
      const np = notionPagesToNodePaths([page])[0];
      if (np?.id) {
        cache.nodePathPageIds.set(np.id, page.id);
      }
    });
    
    cache.nodePaths = {
      data: nodePaths,
      timestamp: Date.now(),
    };
    
    return nodePaths;
  } catch (error) {
    console.error('Error fetching node-paths from Notion:', error);
    throw error;
  }
}

/**
 * Build node-path map from records
 */
export function buildNodePathMap(nodePaths: NodePathRecord[]): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  
  nodePaths.forEach(np => {
    if (!map[np.pathId]) {
      map[np.pathId] = {};
    }
    map[np.pathId][np.nodeId] = np.content;
  });
  
  return map;
}

/**
 * Build node-path audio notes map from records
 * Returns a map of pathId -> nodeId -> array of audio URLs
 */
export function buildNodePathAudioMap(nodePaths: NodePathRecord[]): Record<string, Record<string, string[]>> {
  const map: Record<string, Record<string, string[]>> = {};
  
  nodePaths.forEach(np => {
    if (np.audioNotes && np.audioNotes.length > 0) {
      if (!map[np.pathId]) {
        map[np.pathId] = {};
      }
      map[np.pathId][np.nodeId] = np.audioNotes
        .filter(note => note.url)
        .map(note => note.url!);
    }
  });
  
  return map;
}

/**
 * Build path audio notes map from records
 * Returns a map of pathId -> array of audio URLs
 */
export function buildPathAudioMap(paths: PathRecord[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  
  paths.forEach(p => {
    if (p.audioNotes && p.audioNotes.length > 0) {
      map[p.id] = p.audioNotes
        .filter(note => note.url)
        .map(note => note.url!);
    }
  });
  
  return map;
}

/**
 * Find existing node-path by ID
 */
async function findNodePathById(id: string): Promise<NotionPage | null> {
  // Check cache first
  const notionPageId = cache.nodePathPageIds.get(id);
  if (notionPageId) {
    return { id: notionPageId } as NotionPage;
  }
  
  // Query for the node-path
  try {
    const pages = await queryAllDatabasePages(
      NOTION_CONFIG.DATABASES.NODE_PATH,
      {
        property: 'id',
        title: { equals: id },
      }
    );
    
    if (pages.length > 0) {
      cache.nodePathPageIds.set(id, pages[0].id);
      return pages[0];
    }
  } catch (error) {
    console.error('Error finding node-path:', error);
  }
  
  return null;
}

/**
 * Save node content for a path
 */
export async function saveNodePath(nodePath: NodePathRecord): Promise<NodePathRecord> {
  const properties = nodePathToNotionProperties(nodePath);
  
  try {
    const existingPage = await findNodePathById(nodePath.id);
    
    let resultPage: NotionPage;
    
    if (existingPage) {
      resultPage = await updatePage(existingPage.id, properties);
    } else {
      resultPage = await createPage(NOTION_CONFIG.DATABASES.NODE_PATH, properties);
      cache.nodePathPageIds.set(nodePath.id, resultPage.id);
    }
    
    // Invalidate cache
    cache.nodePaths = null;

    // Touch parent path's date_updated for latest sorting
    await updatePathDateUpdated(nodePath.pathId);
    
    return {
      ...nodePath,
      notionPageId: resultPage.id,
      lastModified: resultPage.last_edited_time,
    };
  } catch (error) {
    console.error('Error saving node-path to Notion:', error);
    throw error;
  }
}

/**
 * Update a path's date_updated field
 */
async function updatePathDateUpdated(pathId: string): Promise<void> {
  const existingPage = await findPathByAppId(pathId);
  if (!existingPage) return;
  await updatePage(existingPage.id, {
    date_updated: { date: { start: new Date().toISOString() } },
  });
  cache.paths = null;
}

/**
 * Batch save multiple node contents
 */
export async function batchSaveNodePaths(nodePaths: NodePathRecord[]): Promise<void> {
  // Process in parallel with limited concurrency
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < nodePaths.length; i += BATCH_SIZE) {
    const batch = nodePaths.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(np => saveNodePath(np)));
  }
  
  // Invalidate cache
  cache.nodePaths = null;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Force refresh all data
 */
export async function refreshAllData(): Promise<{
  nodes: NodeRecord[];
  paths: PathRecord[];
  nodePaths: NodePathRecord[];
}> {
  clearCache();
  
  const [nodes, paths, nodePaths] = await Promise.all([
    fetchNodes(true),
    fetchPaths(true),
    fetchNodePaths(true),
  ]);
  
  return { nodes, paths, nodePaths };
}

/**
 * Check if Notion is reachable
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await queryAllDatabasePages(NOTION_CONFIG.DATABASES.PATHS);
    return true;
  } catch (error) {
    if (error instanceof NotionAPIError && error.status === 401) {
      console.error('Notion API authentication failed');
    }
    return false;
  }
}

// ============================================
// Audio Note Operations
// ============================================

/**
 * Upload an audio note and return the AudioNoteData
 */
export async function uploadAudioNote(
  audioBlob: Blob,
  filename?: string
): Promise<AudioNoteData> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Determine file extension based on blob type
  let extension = 'wav'; // Default to wav since we convert to wav
  if (audioBlob.type.includes('wav')) {
    extension = 'wav';
  } else if (audioBlob.type.includes('mp3') || audioBlob.type.includes('mpeg')) {
    extension = 'mp3';
  } else if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a')) {
    extension = 'm4a';
  } else if (audioBlob.type.includes('webm')) {
    extension = 'webm';
  }
  
  const finalFilename = filename || `audio_note_${timestamp}.${extension}`;
  
  console.log('[uploadAudioNote] Uploading:', finalFilename, 'type:', audioBlob.type, 'size:', audioBlob.size);
  
  try {
    const fileUploadId = await uploadFile(audioBlob, finalFilename);
    
    return {
      fileUploadId,
      filename: finalFilename,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error uploading audio note:', error);
    throw error;
  }
}

/**
 * Save audio note to a NodePath record (appends to existing audio notes)
 */
export async function saveNodePathAudioNote(
  nodePathId: string,
  pathId: string,
  nodeId: string,
  audioBlob: Blob
): Promise<NodePathRecord> {
  // First upload the audio file
  const newAudioNote = await uploadAudioNote(audioBlob);
  
  // Fetch existing node path to get current audio notes
  const existingNodePaths = await fetchNodePaths();
  const existingNodePath = existingNodePaths.find(np => np.id === nodePathId);
  
  // Combine existing audio notes with new one
  const existingAudioNotes = existingNodePath?.audioNotes || [];
  const allAudioNotes = [...existingAudioNotes, newAudioNote];
  
  // Then save the node path with all audio references
  const nodePath: NodePathRecord = {
    id: nodePathId,
    pathId,
    nodeId,
    content: existingNodePath?.content || '', // Keep existing content
    audioNotes: allAudioNotes,
  };
  
  return saveNodePath(nodePath);
}

/**
 * Save audio note to a Path record (appends to existing audio notes)
 */
export async function savePathAudioNote(
  pathId: string,
  audioBlob: Blob
): Promise<void> {
  // First upload the audio file
  const newAudioNote = await uploadAudioNote(audioBlob);
  
  // Fetch existing path to get current audio notes
  const paths = await fetchPaths();
  const existingPath = paths.find(p => p.id === pathId);
  
  // Find the path's Notion page ID
  const existingPage = await findPathByAppId(pathId);
  
  if (!existingPage) {
    throw new Error(`Path not found: ${pathId}`);
  }
  
  // Combine existing audio notes with new one
  const existingAudioNotes = existingPath?.audioNotes || [];
  const allAudioNotes = [...existingAudioNotes, newAudioNote];
  
  // Build files array with all audio notes
  const filesArray: unknown[] = [];
  
  for (const note of allAudioNotes) {
    // For existing files with rawNotionFile, use the original object
    if (note.rawNotionFile) {
      filesArray.push(note.rawNotionFile);
    }
    // For new uploads, create file_upload reference
    else if (note.fileUploadId) {
      filesArray.push({
        type: 'file_upload',
        file_upload: { id: note.fileUploadId },
        name: note.filename || 'audio_note.wav',
      });
    }
  }
  
  // Update the path with all audio notes
  const properties = {
    audioNote: {
      files: filesArray,
    },
  };
  
  await updatePage(existingPage.id, properties);
  
  // Invalidate cache
  cache.paths = null;
}

// Export everything needed
export {
  clearCache,
  NotionAPIError,
};
