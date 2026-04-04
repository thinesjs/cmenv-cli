// === Config file types ===

export interface PlainsVariable {
  name: string;
  value?: string;
  file?: string;      // base64-encoded at sync time
  file_raw?: string;  // read as-is
  secure?: boolean;
}

export interface PlainsGroup {
  secure?: boolean;    // default secure flag for all variables in group
  variables: PlainsVariable[];
}

export interface PlainsConfig {
  groups: Record<string, PlainsGroup>;
}

// === Resolved types (after merge + file resolution) ===

export interface ResolvedVariable {
  name: string;
  value: string;
  secure: boolean;
}

export interface ResolvedGroup {
  name: string;
  variables: ResolvedVariable[];
}

// === Codemagic API types ===

export interface RemoteVariable {
  id?: string;
  name: string;
  value?: string;
  secure?: boolean;
}

export interface RemoteGroup {
  id: string;
  name: string;
}

export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  page_size: number;
  current_page: number;
  total_pages: number;
}

// === Credential + config types ===

export interface Credentials {
  apiKey: string;
  teamId: string;
  appId: string;
}

export interface CmConfig {
  api_key?: string;
  team_id?: string;
  app_id?: string;
}

// === CLI option types ===

export interface SyncOptions {
  update: boolean;
  deleteExtra: boolean;
  dryRun: boolean;
  group?: string;
}

export interface CleanOptions {
  group?: string;
  all: boolean;
  deleteGroups: boolean;
  dryRun: boolean;
  yes: boolean;
}

// === Discovery types ===

export interface DiscoveredPaths {
  plainsFile: string;
  secretsFile: string | null;   // null if not found
  configFile: string | null;    // null if not found
  codemagicDir: string | null;  // null if not found
  baseDir: string;              // directory containing plains file
}
