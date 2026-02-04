// Notion API Type Definitions
// ============================
// Complete type definitions for Notion API and application data

// ============================================
// Notion API Response Types
// ============================================

export interface NotionRichText {
  type: 'text';
  text: {
    content: string;
    link?: { url: string } | null;
  };
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
  plain_text: string;
  href?: string | null;
}

export interface NotionTitle {
  type: 'title';
  title: NotionRichText[];
}

export interface NotionRichTextProperty {
  type: 'rich_text';
  rich_text: NotionRichText[];
}

export interface NotionCheckbox {
  type: 'checkbox';
  checkbox: boolean;
}

export interface NotionUrl {
  type: 'url';
  url: string | null;
}

export interface NotionSelect {
  type: 'select';
  select: { name: string; color?: string } | null;
}

export interface NotionMultiSelect {
  type: 'multi_select';
  multi_select: Array<{ name: string; color?: string }>;
}

export interface NotionNumber {
  type: 'number';
  number: number | null;
}

export interface NotionDate {
  type: 'date';
  date: { start: string; end?: string | null } | null;
}

export interface NotionRelation {
  type: 'relation';
  relation: Array<{ id: string }>;
}

export interface NotionPage {
  object: 'page';
  id: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  properties: Record<string, NotionProperty>;
}

export type NotionProperty = 
  | NotionTitle 
  | NotionRichTextProperty 
  | NotionCheckbox 
  | NotionUrl
  | NotionSelect
  | NotionMultiSelect
  | NotionNumber
  | NotionDate
  | NotionRelation
  | { type: string; [key: string]: unknown };

export interface NotionQueryResponse {
  object: 'list';
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotionError {
  object: 'error';
  status: number;
  code: string;
  message: string;
}

// ============================================
// Application Data Types
// ============================================

// Node data from Notion
export interface NodeRecord {
  id: string;
  notionPageId?: string;
  parentIds: string[];
  label: string;
  category: string;
  color: string;
  wikiUrl: string;
  description: string;
  details: string;
  longDescription: string;
  externalLinks: ExternalLink[];
  images: ImageData[];
  video?: VideoData;
  hidden_by_default: boolean;
  grouping?: string; // Group name for visual grouping (e.g., "group1", "group2")
  lastModified?: string;
}

export interface ExternalLink {
  label: string;
  url: string;
}

export interface ImageData {
  src: string;
  alt?: string;
}

export interface VideoData {
  type: 'youtube' | 'vimeo' | 'html5';
  url: string;
}

// Path data from Notion
export interface PathRecord {
  id: string;
  notionPageId?: string;
  name: string;
  nodeIds: string[];
  category?: string;  // Now stores category ID
  subcategory?: string;
  subsubcategory?: string;
  notes?: string;
  audioNotes?: AudioNoteData[]; // Multiple audio recordings for voice notes
  status?: string;
  dateUpdated?: string;
  lastModified?: string;
  priority?: number; // 0-100, higher = more important (red), lower = less important (blue)
}

// Audio note data
export interface AudioNoteData {
  fileUploadId?: string; // Notion file upload ID (for new uploads)
  url?: string; // Temporary download URL (expires after 1 hour)
  filename?: string;
  duration?: number; // Duration in seconds
  createdAt?: string;
  // Raw Notion file object - preserved for re-saving existing files
  rawNotionFile?: {
    type?: string;
    name?: string;
    file?: { url: string; expiry_time?: string };
    file_upload?: { id: string };
    external?: { url: string };
  };
}

// Category data from Notion
export interface CategoryRecord {
  id: string;
  notionPageId?: string;
  name: string;
  parentId?: string | null; // Notion page ID of parent category, or null for root
}

// Node-Path content (user notes)
export interface NodePathRecord {
  id: string;  // Combined: pathId_nodeId
  notionPageId?: string;
  pathId: string;
  nodeId: string;
  content: string;
  audioNotes?: AudioNoteData[]; // Multiple audio recordings for voice notes
  lastModified?: string;
}

// ============================================
// Sync Types
// ============================================

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSync: Date | null;
  pendingChanges: number;
  error: string | null;
}

export interface PendingChange {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'node' | 'path' | 'nodePath';
  data: unknown;
  timestamp: Date;
  retries: number;
}

// ============================================
// API Request/Response Types
// ============================================

export interface NotionProxyRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
}

export interface NotionProxyResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

// ============================================
// Rich Text Types for Parsing
// ============================================

export interface RichTextSegment {
  text: string;
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
  href?: string | null;
}

export interface ParsedRichText {
  plainText: string;
  segments: RichTextSegment[];
  hasFormatting: boolean;
}

// ============================================
// Block Types for Content
// ============================================

export interface NotionBlock {
  object: 'block';
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionParagraphBlock extends NotionBlock {
  type: 'paragraph';
  paragraph: {
    rich_text: NotionRichText[];
  };
}

export interface NotionHeadingBlock extends NotionBlock {
  type: 'heading_1' | 'heading_2' | 'heading_3';
  heading_1?: { rich_text: NotionRichText[] };
  heading_2?: { rich_text: NotionRichText[] };
  heading_3?: { rich_text: NotionRichText[] };
}

export interface NotionBulletedListBlock extends NotionBlock {
  type: 'bulleted_list_item';
  bulleted_list_item: {
    rich_text: NotionRichText[];
  };
}

export interface NotionNumberedListBlock extends NotionBlock {
  type: 'numbered_list_item';
  numbered_list_item: {
    rich_text: NotionRichText[];
  };
}

export interface NotionImageBlock extends NotionBlock {
  type: 'image';
  image: {
    type: 'external' | 'file';
    external?: { url: string };
    file?: { url: string; expiry_time: string };
    caption: NotionRichText[];
  };
}

export interface NotionVideoBlock extends NotionBlock {
  type: 'video';
  video: {
    type: 'external' | 'file';
    external?: { url: string };
    file?: { url: string; expiry_time: string };
  };
}

export type ContentBlock = 
  | NotionParagraphBlock 
  | NotionHeadingBlock 
  | NotionBulletedListBlock 
  | NotionNumberedListBlock
  | NotionImageBlock
  | NotionVideoBlock
  | NotionBlock;
