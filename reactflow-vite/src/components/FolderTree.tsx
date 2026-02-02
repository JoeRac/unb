// FolderTree.tsx
// Modern folder tree component with drag-and-drop support
// Uses glass styling consistent with the app

import React, { useState } from 'react';

// ============================================
// Types
// ============================================

export interface FolderTreeNode {
  id: string;
  notionPageId?: string;
  name: string;
  parentId?: string | null;
  children: FolderTreeNode[];
}

export interface PathItem {
  id: string;
  name: string;
  category?: string;
}

interface FolderTreeProps {
  folders: FolderTreeNode[];
  paths: PathItem[];
  activePath: string | null;
  expandedFolders: Record<string, boolean>;
  highlightedFolderId?: string | null;
  onToggleFolder: (folderId: string) => void;
  onSelectPath: (pathName: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
  onDeleteFolder: (folder: FolderTreeNode) => Promise<void>;
  onRenameFolder: (folder: FolderTreeNode, newName: string) => Promise<void>;
  onMovePathToFolder: (pathName: string, folderId: string | null) => Promise<void>;
  onMoveFolderToFolder: (folderId: string, targetParentId: string | null) => Promise<void>;
  onDeletePath: (pathName: string) => void;
  onRenamePath: (oldName: string, newName: string) => void;
  onShowPathNotes: (pathName: string) => void;
}

// ============================================
// Icons (SVG)
// ============================================

const FolderIcon = ({ isOpen, size = 14 }: { isOpen?: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {isOpen ? (
      <>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <path d="M2 10h20" />
      </>
    ) : (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    )}
  </svg>
);

const FileIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const ChevronIcon = ({ isOpen, size = 12 }: { isOpen: boolean; size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ 
      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.15s ease',
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const PlusIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const EditIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const NotesIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    fontSize: '12px',
    color: '#334155',
  },
  folderRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    gap: '6px',
    marginBottom: '2px',
  },
  folderRowHover: {
    background: 'rgba(59, 130, 246, 0.08)',
  },
  folderRowDragOver: {
    background: 'rgba(59, 130, 246, 0.15)',
    border: '1px dashed rgba(59, 130, 246, 0.5)',
  },
  folderName: {
    flex: 1,
    fontWeight: 500,
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  folderActions: {
    display: 'flex',
    gap: '4px',
    opacity: 0,
    transition: 'opacity 0.15s ease',
  },
  folderActionsVisible: {
    opacity: 1,
  },
  actionButton: {
    padding: '4px',
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  pathRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px 6px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    gap: '6px',
    marginBottom: '2px',
  },
  pathRowActive: {
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
  },
  pathName: {
    flex: 1,
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  children: {
    paddingLeft: '16px',
    borderLeft: '1px solid rgba(203, 213, 225, 0.4)',
    marginLeft: '8px',
  },
  addInput: {
    display: 'flex',
    gap: '4px',
    padding: '4px 8px',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '4px 8px',
    fontSize: '11px',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '6px',
    outline: 'none',
    background: 'white',
  },
  rootActions: {
    display: 'flex',
    gap: '8px',
    padding: '8px 0',
    marginTop: '8px',
    borderTop: '1px solid rgba(203, 213, 225, 0.4)',
  },
  addFolderButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: 500,
    border: '1px dashed rgba(59, 130, 246, 0.4)',
    borderRadius: '8px',
    background: 'transparent',
    color: '#3b82f6',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  uncategorizedSection: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(203, 213, 225, 0.4)',
  },
  sectionLabel: {
    fontSize: '9px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
};

// ============================================
// FolderItem Component
// ============================================

interface FolderItemProps {
  folder: FolderTreeNode;
  paths: PathItem[];
  level: number;
  activePath: string | null;
  isExpanded: boolean;
  highlightedFolderId?: string | null;
  onToggle: () => void;
  onSelectPath: (pathName: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
  onDeleteFolder: (folder: FolderTreeNode) => void;
  onRenameFolder: (folder: FolderTreeNode, newName: string) => void;
  onMovePathToFolder: (pathName: string, folderId: string | null) => void;
  onMoveFolderToFolder: (folderId: string, targetParentId: string | null) => void;
  onDeletePath: (pathName: string) => void;
  onRenamePath: (oldName: string, newName: string) => void;
  onShowPathNotes: (pathName: string) => void;
  allFolders: FolderTreeNode[];
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (folderId: string) => void;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  paths,
  level,
  activePath,
  isExpanded,
  highlightedFolderId,
  onToggle,
  onSelectPath,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onMovePathToFolder,
  onMoveFolderToFolder,
  onDeletePath,
  onRenamePath,
  onShowPathNotes,
  allFolders,
  expandedFolders,
  onToggleFolder,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameValue, setRenameValue] = useState(folder.name);

  // Get paths directly in this folder
  const folderPaths = paths.filter(p => p.category === folder.id);
  const hasChildren = folder.children.length > 0 || folderPaths.length > 0;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const pathName = e.dataTransfer.getData('pathName');
    const draggedFolderId = e.dataTransfer.getData('folderId');

    if (pathName) {
      onMovePathToFolder(pathName, folder.id);
    } else if (draggedFolderId && draggedFolderId !== folder.id) {
      // Don't allow dropping a folder onto itself or its descendants
      onMoveFolderToFolder(draggedFolderId, folder.notionPageId || folder.id);
    }
  };

  const handleFolderDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('folderId', folder.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleAddSubmit = async () => {
    if (newName.trim()) {
      try {
        // Create subfolder under THIS folder (use notionPageId or id as parent)
        await onCreateFolder(newName.trim(), folder.notionPageId || folder.id);
        setNewName('');
        setIsAdding(false);
      } catch (error) {
        console.error('Error creating subfolder:', error);
      }
    }
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== folder.name) {
      // Rename THIS specific folder
      onRenameFolder(folder, renameValue.trim());
    }
    setIsRenaming(false);
  };

  const isHighlighted = highlightedFolderId === (folder.notionPageId || folder.id);

  return (
    <div>
      {/* Folder row */}
      <div
        data-folder-id={folder.notionPageId || folder.id}
        draggable
        onDragStart={handleFolderDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => hasChildren && onToggle()}
        style={{
          ...styles.folderRow,
          ...(isHovered ? styles.folderRowHover : {}),
          ...(isDragOver ? styles.folderRowDragOver : {}),
          ...(isHighlighted ? { 
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            boxShadow: '0 0 8px rgba(245, 158, 11, 0.3)',
          } : {}),
          paddingLeft: `${8 + level * 12}px`,
        }}
      >
        {/* Chevron */}
        <span style={{ width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasChildren ? (
            <ChevronIcon isOpen={isExpanded} />
          ) : (
            <span style={{ width: 12 }} />
          )}
        </span>

        {/* Folder icon */}
        <span style={{ color: '#f59e0b', display: 'flex' }}>
          <FolderIcon isOpen={isExpanded && hasChildren} />
        </span>

        {/* Folder name */}
        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onBlur={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{ ...styles.input, flex: 1 }}
          />
        ) : (
          <span style={styles.folderName}>{folder.name}</span>
        )}

        {/* Actions */}
        <div style={{ ...styles.folderActions, ...(isHovered ? styles.folderActionsVisible : {}) }}>
          <button
            onClick={(e) => { e.stopPropagation(); setIsAdding(true); }}
            style={styles.actionButton}
            title="Add subfolder"
          >
            <PlusIcon />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(folder.name); }}
            style={styles.actionButton}
            title="Rename folder"
          >
            <EditIcon />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder); }}
            style={{ ...styles.actionButton, color: '#ef4444' }}
            title="Delete folder"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Add subfolder input */}
      {isAdding && (
        <div style={{ ...styles.addInput, paddingLeft: `${24 + level * 12}px` }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddSubmit();
              if (e.key === 'Escape') { setIsAdding(false); setNewName(''); }
            }}
            placeholder="Folder name..."
            autoFocus
            style={styles.input}
          />
          <button onClick={handleAddSubmit} style={{ ...styles.actionButton, color: '#3b82f6' }}>✓</button>
          <button onClick={() => { setIsAdding(false); setNewName(''); }} style={styles.actionButton}>✕</button>
        </div>
      )}

      {/* Children (subfolders and paths) */}
      {isExpanded && (
        <div style={level > 0 ? styles.children : { paddingLeft: '8px' }}>
          {/* Subfolders */}
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              paths={paths}
              level={level + 1}
              activePath={activePath}
              isExpanded={expandedFolders[child.id] !== false}
              highlightedFolderId={highlightedFolderId}
              onToggle={() => onToggleFolder(child.id)}
              onSelectPath={onSelectPath}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
              onRenameFolder={onRenameFolder}
              onMovePathToFolder={onMovePathToFolder}
              onMoveFolderToFolder={onMoveFolderToFolder}
              onDeletePath={onDeletePath}
              onRenamePath={onRenamePath}
              onShowPathNotes={onShowPathNotes}
              allFolders={allFolders}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
            />
          ))}

          {/* Paths in this folder */}
          {folderPaths.map((path) => (
            <PathItemRow
              key={path.id}
              path={path}
              level={level + 1}
              isActive={activePath === path.name}
              onSelect={() => onSelectPath(path.name)}
              onDelete={() => onDeletePath(path.name)}
              onRename={(newName) => onRenamePath(path.name, newName)}
              onShowNotes={() => onShowPathNotes(path.name)}
              onDragStart={(e) => {
                e.dataTransfer.setData('pathName', path.name);
                e.dataTransfer.effectAllowed = 'move';
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// PathItemRow Component
// ============================================

interface PathItemRowProps {
  path: PathItem;
  level: number;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  onShowNotes: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

const PathItemRow: React.FC<PathItemRowProps> = ({
  path,
  level,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onShowNotes,
  onDragStart,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(path.name);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(path.name);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== path.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(path.name);
    setIsEditing(false);
  };

  return (
    <div
      draggable={!isEditing}
      onDragStart={isEditing ? undefined : onDragStart}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={isEditing ? undefined : onSelect}
      style={{
        ...styles.pathRow,
        ...(isActive ? styles.pathRowActive : {}),
        ...(isHovered && !isActive ? styles.folderRowHover : {}),
        paddingLeft: `${16 + level * 12}px`,
      }}
    >
      {/* File icon */}
      <span style={{ color: isActive ? '#3b82f6' : '#64748b', display: 'flex' }}>
        <FileIcon />
      </span>

      {/* Path name or edit input */}
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') handleCancelEdit();
          }}
          onBlur={handleSaveEdit}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            padding: '2px 6px',
            fontSize: '12px',
            border: '1px solid #3b82f6',
            borderRadius: '4px',
            outline: 'none',
            background: 'white',
          }}
        />
      ) : (
        <span style={{ ...styles.pathName, fontWeight: isActive ? 600 : 400, color: isActive ? '#1d4ed8' : '#475569' }}>
          {path.name}
        </span>
      )}

      {/* Actions */}
      {!isEditing && (
        <div style={{ ...styles.folderActions, ...(isHovered ? styles.folderActionsVisible : {}) }}>
          <button
            onClick={handleStartEdit}
            style={styles.actionButton}
            title="Edit path"
          >
            <EditIcon />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onShowNotes(); }}
            style={styles.actionButton}
            title="View notes"
          >
            <NotesIcon />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ ...styles.actionButton, color: '#ef4444' }}
            title="Delete path"
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// Main FolderTree Component
// ============================================

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  paths,
  activePath,
  expandedFolders,
  highlightedFolderId,
  onToggleFolder,
  onSelectPath,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onMovePathToFolder,
  onMoveFolderToFolder,
  onDeletePath,
  onRenamePath,
  onShowPathNotes,
}) => {
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);

  // Paths without a folder (uncategorized)
  const uncategorizedPaths = paths.filter(p => !p.category);

  const handleAddRootFolder = async () => {
    if (newFolderName.trim()) {
      try {
        await onCreateFolder(newFolderName.trim(), null);
        setNewFolderName('');
        setIsAddingRoot(false);
      } catch (error) {
        console.error('Error creating root folder:', error);
      }
    }
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverRoot(true);
  };

  const handleRootDragLeave = () => {
    setIsDragOverRoot(false);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverRoot(false);

    const pathName = e.dataTransfer.getData('pathName');
    const folderId = e.dataTransfer.getData('folderId');

    if (pathName) {
      // Move path to uncategorized (no folder)
      onMovePathToFolder(pathName, '');
    } else if (folderId) {
      // Move folder to root
      onMoveFolderToFolder(folderId, null);
    }
  };

  return (
    <div style={styles.container}>
      {/* Folder tree */}
      {folders.map((folder) => (
        <FolderItem
          key={folder.id}
          folder={folder}
          paths={paths}
          level={0}
          activePath={activePath}
          isExpanded={expandedFolders[folder.id] !== false}
          highlightedFolderId={highlightedFolderId}
          onToggle={() => onToggleFolder(folder.id)}
          onSelectPath={onSelectPath}
          onCreateFolder={onCreateFolder}
          onDeleteFolder={onDeleteFolder}
          onRenameFolder={onRenameFolder}
          onMovePathToFolder={(pathName, folderId) => onMovePathToFolder(pathName, folderId)}
          onMoveFolderToFolder={(fId, targetId) => onMoveFolderToFolder(fId, targetId)}
          onDeletePath={onDeletePath}
          onRenamePath={onRenamePath}
          onShowPathNotes={onShowPathNotes}
          allFolders={folders}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
        />
      ))}

      {/* Add root folder button */}
      <div style={styles.rootActions}>
        {isAddingRoot ? (
          <div style={{ ...styles.addInput, padding: 0, flex: 1 }}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddRootFolder();
                if (e.key === 'Escape') { setIsAddingRoot(false); setNewFolderName(''); }
              }}
              placeholder="New folder name..."
              autoFocus
              style={styles.input}
            />
            <button onClick={handleAddRootFolder} style={{ ...styles.actionButton, color: '#3b82f6' }}>✓</button>
            <button onClick={() => { setIsAddingRoot(false); setNewFolderName(''); }} style={styles.actionButton}>✕</button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingRoot(true)}
            style={styles.addFolderButton}
          >
            <FolderIcon />
            <span>New Folder</span>
          </button>
        )}
      </div>

      {/* Uncategorized paths */}
      {uncategorizedPaths.length > 0 && (
        <div
          style={{
            ...styles.uncategorizedSection,
            ...(isDragOverRoot ? { background: 'rgba(59, 130, 246, 0.08)', borderRadius: '8px' } : {}),
          }}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
        >
          <div style={styles.sectionLabel}>📄 Unfiled Paths</div>
          {uncategorizedPaths.map((path) => (
            <PathItemRow
              key={path.id}
              path={path}
              level={0}
              isActive={activePath === path.name}
              onSelect={() => onSelectPath(path.name)}
              onDelete={() => onDeletePath(path.name)}
              onRename={(newName) => onRenamePath(path.name, newName)}
              onShowNotes={() => onShowPathNotes(path.name)}
              onDragStart={(e) => {
                e.dataTransfer.setData('pathName', path.name);
                e.dataTransfer.effectAllowed = 'move';
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FolderTree;
