// Notion Service Index
// =====================
// Re-export all Notion service components

// Configuration
export { NOTION_CONFIG, DATA_SOURCE } from './config';
export type { DataSource } from './config';

// Types
export type {
  // Notion API types
  NotionRichText,
  NotionPage,
  NotionProperty,
  NotionQueryResponse,
  NotionError,
  
  // Application data types
  NodeRecord,
  PathRecord,
  NodePathRecord,
  CategoryRecord,
  ExternalLink,
  ImageData,
  VideoData,
  AudioNoteData,
  
  // Sync types
  SyncStatus,
  SyncState,
  PendingChange,
  
  // Rich text types
  ParsedRichText,
  RichTextSegment,
} from './types';

// Client
export {
  notionRequest,
  queryDatabase,
  queryAllDatabasePages,
  getPage,
  createPage,
  updatePage,
  archivePage,
  getPageBlocks,
  addSyncStatusListener,
  getSyncStatus,
  getIsOnline,
  getPendingChangesCount,
  forceSyncQueue,
  clearPendingChanges,
  NotionAPIError,
  // File upload functions
  createFileUpload,
  sendFileUpload,
  uploadFile,
  createFilesPropertyValue,
} from './client';

// Transformers
export {
  extractPlainText,
  notionPageToNode,
  notionPageToPath,
  notionPageToNodePath,
  nodeToNotionProperties,
  pathToNotionProperties,
  nodePathToNotionProperties,
  categoryToNotionProperties,
  notionPagesToNodes,
  notionPagesToPaths,
  notionPagesToNodePaths,
} from './transformers';

// Rich Text Parser
export {
  parseRichText,
  renderRichText,
  renderNotionRichText,
  parseYouTubeUrl,
  parseVimeoUrl,
  parseMediaUrl,
  parseMarkdownLikeText,
} from './richTextParser';

// Service (high-level operations)
export {
  fetchNodes,
  fetchPaths,
  fetchNodePaths,
  fetchCategories,
  createCategory,
  deleteCategory,
  updateCategory,
  buildNodePathMap,
  buildNodePathAudioMap,
  buildPathAudioMap,
  savePath,
  updatePathNodes,
  updatePathCategory,
  updatePathPriority,
  renamePath,
  savePathNotes,
  deletePath,
  deleteNodePathsForPath,
  saveNodePath,
  batchSaveNodePaths,
  refreshAllData,
  checkConnection,
  clearCache,
  // Audio note operations
  uploadAudioNote,
  saveNodePathAudioNote,
  savePathAudioNote,
} from './service';

// Create a default service instance for easy importing
import * as notionService from './service';
export { notionService };
