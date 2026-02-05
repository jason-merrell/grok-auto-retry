# Storage Migration Strategies

This document details the migration system for storage hooks, including the extensible migration chain architecture that supports sequential version upgrades.

## 🔧 Migration Architecture

### Migration Chain System

Each hook defines a **migration chain** - an ordered array of migration functions where each function transforms data from version N to version N+1.

```typescript
const MIGRATION_CONFIG: MigrationConfig<MyState> = {
    migrations: [
        // Index 0: v0 -> v1
        (v0Data) => ({ ...DEFAULT_STATE, ...v0Data }),
        // Index 1: v1 -> v2
        (v1Data) => ({ ...v1Data, newField: 'default' }),
        // Index 2: v2 -> v3
        (v2Data) => transformToV3(v2Data),
    ],
    oldKeys: ['old_key_name'] // Optional cleanup for v0->v1
};
```

**Benefits:**
- ✅ **Extensible**: Add new migrations by appending to the array
- ✅ **Chronological**: Migrations apply in sequential order
- ✅ **Testable**: Each migration is a pure function
- ✅ **Automatic**: System handles version gaps (e.g., v0 → v3 applies v0→v1, v1→v2, v2→v3)
- ✅ **Clear**: Migration index = source version

### Migration Workflow

```typescript
// 1. Determine current version
const currentVersion = isHookStore(rawData) ? rawData.version : 0;

// 2. Apply migration chain if needed
if (currentVersion < CURRENT_VERSION) {
    state = applyMigrations(
        currentVersion === 0 ? rawData : rawData.state,
        currentVersion,
        CURRENT_VERSION,
        MIGRATION_CONFIG
    );
}

// 3. Save in new format
const store = createStore(state, CURRENT_VERSION);
chrome.storage.local.set({ [STORAGE_KEY]: store });

// 4. Clean up old keys (v0 only, if enabled)
if (ENABLE_MIGRATION_CLEANUP && oldKeys.length > 0) {
    chrome.storage.local.remove(oldKeys);
}
```

## ⚠️ Migration Safety Feature

**Feature Flag**: `ENABLE_MIGRATION_CLEANUP` in `/extension/src/types/storage.ts`

```typescript
export const ENABLE_MIGRATION_CLEANUP = false; // Default: disabled for safety
```

- **When `false` (default)**: Old storage keys are preserved alongside new keys during migration
  - Safer for initial rollout
  - Allows rollback if issues are discovered
  - Users can manually inspect both old and new data
  - Console logs show: "Migration complete (cleanup disabled, old keys preserved)"

- **When `true`**: Old storage keys are deleted after successful migration
  - Production mode after migration is proven stable
  - Cleans up storage space
  - Prevents confusion from duplicate data
  - Console logs show: "Migration complete, removed old keys"

**Recommendation**: Keep disabled (`false`) for at least one release cycle to ensure migration stability, then enable (`true`) in a subsequent release.

## Adding New Migrations

When you need to change a hook's state structure in a future version:

### Step 1: Update the Version Constant

```typescript
const CURRENT_VERSION = 2; // Increment from 1 to 2
```

### Step 2: Add Migration Function to Array

```typescript
const MIGRATION_CONFIG: MigrationConfig<MyState> = {
    migrations: [
        // v0 -> v1 (existing)
        (v0Data) => ({ ...DEFAULT_STATE, ...v0Data }),
        
        // v1 -> v2 (NEW)
        (v1Data: MyStateV1): MyStateV2 => {
            return {
                ...v1Data,
                newRequiredField: 'default value',
                renamedField: v1Data.oldFieldName,
            };
        },
    ],
    oldKeys: ['old_key_name'] // Only for v0->v1, not needed for v1->v2
};
```

### Step 3: Update Type Definitions

```typescript
// Update your state interface to match v2
interface MyState {
    existingField: string;
    newRequiredField: string; // New in v2
    renamedField: string;     // Renamed in v2
    // oldFieldName is removed
}
```

### Step 4: Test Migration

The migration system will automatically:
1. Detect users on v0 and apply v0→v1, then v1→v2
2. Detect users on v1 and apply only v1→v2
3. Skip migration for users already on v2

No additional code needed - migrations apply in sequence automatically!

## Migration Overview

**Version 0 (Legacy)**: Various storage patterns without version tracking
**Version 1 (HookStore)**: Standardized `HookStore<T>` wrapper with version property

All migrations follow this pattern:
1. Check if data exists in old location/format
2. Detect format using `isHookStore()` type guard
3. If old format detected, migrate to new structure
4. Save in new HookStore format
5. Remove old keys from storage (if key changed)

## Hook-Specific Migrations

### 1. useGrokRetryUI

**Status**: ✅ Complete

**Storage**: `chrome.storage.local`

**Migration Type**: In-place structure change (same key)

**Old Format** (Version 0):
```typescript
// Key: 'useGrokRetryUI_store'
{
  panelWidth: 320,
  panelHeight: 400,
  miniTogglePosition: { x: 100, y: 100 },
  // ... other UI state properties
}
```

**New Format** (Version 1):
```typescript
// Key: 'useGrokRetryUI_store'
{
  state: {
    panelWidth: 320,
    panelHeight: 400,
    miniTogglePosition: { x: 100, y: 100 },
    // ... other UI state properties
  },
  version: 1
}
```

**Migration Logic**:
- Detects flat object structure
- Wraps in HookStore with version 1
- Saves back to same key
- No old key removal needed

---

### 2. useGrokRetrySettings

**Status**: ✅ Complete (Using migration chain system)

**Storage**: `chrome.storage.sync`

**Migration Type**: Key change + structure change + cleanup

**Current Version**: 1

**Migration Chain**:
```typescript
const MIGRATION_CONFIG: MigrationConfig<GlobalSettings> = {
    migrations: [
        // v0 -> v1: Migrate from old key to HookStore
        (v0Data: any): GlobalSettings => {
            return { ...DEFAULT_SETTINGS, ...v0Data };
        },
        // v1 -> v2: Future migrations go here
    ],
    oldKeys: ['grokRetry_globalSettings']
};
```

**Old Format** (Version 0):
```typescript
// Key: 'grokRetry_globalSettings'
{
  defaultMaxRetries: 3,
  defaultAutoRetryEnabled: true,
  shortcuts: { ... },
  // ... other settings
}
```

**New Format** (Version 1):
```typescript
// Key: 'useGrokRetrySettings_store'
{
  state: {
    defaultMaxRetries: 3,
    defaultAutoRetryEnabled: true,
    shortcuts: { ... },
    // ... other settings
  },
  version: 1
}
```

**Migration Logic**:
- Uses `applyMigrations()` with migration chain
- Detects current version (0 from old key, or N from HookStore)
- Applies all necessary migrations in sequence (v0→v1, v1→v2, etc.)
- Saves in new format with current version
- **Conditionally removes old key** (only if `ENABLE_MIGRATION_CLEANUP` is `true`)
- Logs each migration step

**Console Output**:
- Migration steps: `"Applying migration v0 -> v1"`, `"Applying migration v1 -> v2"`, etc.
- Summary: `"Migrating from v0 to v2"` (or whatever versions)
- Cleanup enabled: `"Migration complete, removed old keys: ['grokRetry_globalSettings']"`
- Cleanup disabled: `"Migration complete (cleanup disabled, old keys preserved): ['grokRetry_globalSettings']"`

---

### 3. useGrokRetryVideoSessions

**Status**: ✅ Complete

**Storage**: `sessionStorage`

**Migration Type**: Multi-key consolidation + structure change + cleanup + validation

**Current Version**: 1

**Old Format** (Version 0):
```typescript
// Multiple keys with pattern: 'grokRetrySession_{key}'
// Example: 'grokRetrySession_abc123'
{
  // Various session data scattered across keys
}
```

**New Format** (Version 1):
```typescript
// Single key: 'useGrokRetryVideoSessions_store'
{
  state: {
    sessionByPostId: {
      [postId]: {
        isActive: boolean,
        retryCount: number,
        sessionMediaId: string | null,
        // ... other session data
      }
    },
    persistentByPostId: {
      [postId]: {
        maxRetries: number,
        autoRetryEnabled: boolean,
        // ... other persistent data
      }
    }
  },
  version: 1
}
```

**Migration Logic**:
- Scans all keys in sessionStorage
- Identifies keys matching `grokRetrySession_*` pattern
- Consolidates into single centralized structure
- Saves in new format with HookStore wrapper
- **Conditionally removes all old keys** (only if `ENABLE_MIGRATION_CLEANUP` is `true`)
- Logs migration with count of removed keys

**Validation Against Grok's useMediaStore**:

This hook implements **stale session detection** by validating stored session data against Grok's internal `useMediaStore`:

```typescript
const validateSessionAgainstGrokStore = (sessionData: SessionData): boolean => {
    // If session has sessionMediaId and isActive
    if (sessionData.sessionMediaId && sessionData.isActive) {
        // Check if that mediaId still exists in Grok's videoByMediaId
        const grokStore = JSON.parse(sessionStorage.getItem('useMediaStore'));
        const exists = sessionData.sessionMediaId in grokStore.state.videoByMediaId;
        
        if (!exists) {
            // Stale session - media cleared by Grok
            return false;
        }
    }
    return true;
};
```

**When sessions are considered stale**:
- `sessionMediaId` is set (we're tracking a media)
- Session is marked `isActive: true`
- BUT that `sessionMediaId` no longer exists in Grok's `useMediaStore.state.videoByMediaId`

**What happens to stale sessions**:
- Session data is reset to defaults (cleared)
- Persistent data is preserved (maxRetries, autoRetryEnabled, etc.)
- Logged for debugging: `"Clearing stale session for post: {postId}"`

**Why this matters**:
- Prevents resuming sessions after page refresh (Grok clears its media store)
- Avoids tracking videos that no longer exist
- Keeps UI state in sync with Grok's internal state
- Prevents false "active session" indicators

**Console Output**:
- Migration steps: `"Migrating from version 0 to version 1"`
- Cleanup enabled: `"Removed old session keys: ['grokRetrySession_abc', 'grokRetrySession_xyz']"`
- Cleanup disabled: `"Migration complete (cleanup disabled, old keys preserved): ['grokRetrySession_abc', ...]"`
- Validation: `"Clearing stale session for post: {postId}"`, `"Cleaned N stale session(s)"`

**Note**: Old session data is temporary and not preserved during migration. Only the new structure is created with empty state. Validation runs on every load to ensure sessions remain valid.
      [postId]: {
        isActive: boolean,
        retryCount: number,
        // ... other session data
      }
    },
    persistentByPostId: {
      [postId]: {
        maxRetries: number,
        autoRetryEnabled: boolean,
        // ... other persistent data
      }
    }
  },
  version: 1
}
```

**Migration Logic**:
- Scans all keys in sessionStorage
- Identifies keys matching `grokRetrySession_*` pattern
- Consolidates into single centralized structure
- Saves in new format with HookStore wrapper
- **Conditionally removes all old keys** (only if `ENABLE_MIGRATION_CLEANUP` is `true`)
- Logs migration with count of removed keys

**Console Output**:
- Cleanup enabled: `"Removed old session keys: ['grokRetrySession_abc', 'grokRetrySession_xyz']"`
- Cleanup disabled: `"Migration complete (cleanup disabled, old keys preserved): ['grokRetrySession_abc', ...]"`

**Note**: Old session data is temporary and not preserved during migration. Only the new structure is created with empty state.

---

### 4. useGrokRetryCustomPartials

**Status**: ✅ Complete

**Storage**: `chrome.storage.local`

**Migration Type**: In-place structure change (same key)

**Old Format** (Version 0):
```typescript
// Key: 'useGrokRetryCustomPartials_store'
[
  {
    id: 'custom_123',
    name: 'Style',
    value: 'cinematic, 4k',
    category: 'visual'
  },
  // ... more partials
]
```

**New Format** (Version 1):
```typescript
// Key: 'useGrokRetryCustomPartials_store'
{
  state: [
    {
      id: 'custom_123',
      name: 'Style',
      value: 'cinematic, 4k',
      category: 'visual'
    },
    // ... more partials
  ],
  version: 1
}
```

**Migration Logic**:
- Detects flat array structure
- Validates array type
- Wraps in HookStore with version 1
- Saves back to same key
- No old key removal needed
- Logs migration success

---

### 5. useGrokRetrySavedPrompts

**Status**: ✅ Complete

**Storage**: `chrome.storage.local`

**Migration Type**: In-place structure change (same key)

**Old Format** (Version 0):
```typescript
// Key: 'useGrokRetrySavedPrompts_store'
{
  'Favorite 1': 'A cinematic shot of...',
  'Favorite 2': 'An epic scene with...',
  // ... more saved prompts
}
```

**New Format** (Version 1):
```typescript
// Key: 'useGrokRetrySavedPrompts_store'
{
  state: {
    'Favorite 1': 'A cinematic shot of...',
    'Favorite 2': 'An epic scene with...',
    // ... more saved prompts
  },
  version: 1
}
```

**Migration Logic**:
- Detects flat object structure
- Validates object type
- Wraps in HookStore with version 1
- Saves back to same key
- No old key removal needed
- Logs migration success

---

## Testing Migrations

### Feature Flag Testing

**Before enabling cleanup** (`ENABLE_MIGRATION_CLEANUP = false`):
1. Install extension with old data
2. Verify migration logs show "cleanup disabled, old keys preserved"
3. Check storage inspector - both old and new keys should exist
4. Verify extension functions correctly with new data
5. Optionally verify old data is still intact
6. Test rollback by temporarily disabling new code

**After enabling cleanup** (`ENABLE_MIGRATION_CLEANUP = true`):
1. Install extension with old data
2. Verify migration logs show "removed old keys"
3. Check storage inspector - only new keys should exist
4. Verify extension functions correctly
5. Confirm old keys are gone

### Manual Testing Steps

1. **Install old version** (before HookStore migration)
2. **Use features** to populate storage with old format data
3. **Update to new version** with HookStore format
4. **Load extension** and verify:
   - Console shows migration logs
   - Data is preserved correctly
   - Old keys are removed (where applicable)
   - New HookStore format is used

### Testing with Fresh Install

1. Install new version without existing data
2. Verify no migration errors
3. Use features normally
4. Check that data is stored in HookStore format from the start

### Simulating Old Data

Create test data in old format using browser console:

```javascript
// useGrokRetryUI - old format
chrome.storage.local.set({
  'useGrokRetryUI_store': {
    panelWidth: 320,
    panelHeight: 400
  }
});

// useGrokRetrySettings - old format
chrome.storage.sync.set({
  'grokRetry_globalSettings': {
    defaultMaxRetries: 5,
    defaultAutoRetryEnabled: false
  }
});

// useGrokRetryVideoSessions - old format
sessionStorage.setItem('grokRetrySession_test123', JSON.stringify({
  someOldData: 'value'
}));

// useGrokRetryCustomPartials - old format
chrome.storage.local.set({
  'useGrokRetryCustomPartials_store': [
    { id: 'custom_1', name: 'Test', value: 'test value', category: 'test' }
  ]
});

// useGrokRetrySavedPrompts - old format
chrome.storage.local.set({
  'useGrokRetrySavedPrompts_store': {
    'Test Prompt': 'This is a test prompt'
  }
});
```

Then reload the extension and check console logs for migration messages.

---

## Future Migrations (v1 → v2, etc.)

When adding new features that require schema changes:

1. **Increment version** in hook constant: `const CURRENT_VERSION = 2;`
2. **Check version number** in migration logic
3. **Transform data** according to version
4. **Keep data in same key** (no removal needed for version upgrades)
5. **Update docstring** with migration notes

Example:
```typescript
if (store.version === 1) {
  // Transform from v1 to v2
  const newState = transformV1ToV2(store.state);
  saveStore(newState);
}
```

---

## Migration Helper Functions

Located in `/extension/src/types/storage.ts`:

### `isHookStore<T>(value: any): value is HookStore<T>`
Type guard to detect if data is in HookStore format.

```typescript
if (isHookStore<MyState>(rawData)) {
  // Already migrated
  state = extractState(rawData, defaultState);
} else {
  // Old format, needs migration
  state = migrateOldFormat(rawData);
  needsMigration = true;
}
```

### `createStore<T>(state: T, version: number): HookStore<T>`
Wraps state in HookStore wrapper.

```typescript
const store = createStore(migratedState, CURRENT_VERSION);
chrome.storage.local.set({ [STORAGE_KEY]: store });
```

### `extractState<T>(store: HookStore<T> | undefined, defaultState: T): T`
Unwraps state from HookStore with fallback.

```typescript
const state = extractState(store, DEFAULT_STATE);
```

---

## Console Logging

All migrations log to console for debugging:

```typescript
// Migration detected
console.log('[useGrokRetrySettings] Migrating from version 0 to version 1');

// Migration complete
console.log('[useGrokRetrySettings] Migration complete, removed old keys:', keysToRemove);

// No migration needed
// (no log - silent success)
```

Check browser console (F12) when loading extension to see migration status.

---

## Troubleshooting

### Migration doesn't trigger
- Check that old data exists in storage
- Verify storage key names match old patterns
- Check console for errors
- Ensure `isHookStore()` type guard is imported

### Data loss after migration
- Check migration logic preserves all fields
- Verify default values are correct
- Test with simulated old data first
- Use browser storage inspector to examine before/after

### Old keys remain in storage
- Ensure `keysToRemove` array includes all old keys
- Check that removal happens after successful save
- Verify correct storage API (local vs sync vs sessionStorage)

### Migration runs multiple times
- Check that `needsMigration` flag is set correctly
- Ensure migration only runs when old format detected
- Verify `isHookStore()` correctly identifies new format

---

## Summary

All 5 storage hooks now support automatic migration from version 0 (legacy) to version 1 (HookStore):

✅ **useGrokRetryUI** - In-place structure migration
✅ **useGrokRetrySettings** - Key change + conditional cleanup
✅ **useGrokRetryVideoSessions** - Multi-key consolidation + conditional cleanup
✅ **useGrokRetryCustomPartials** - In-place structure migration
✅ **useGrokRetrySavedPrompts** - In-place structure migration

Migrations are:
- **Automatic** - Trigger on first load with old data
- **Non-destructive** - Old data is preserved during migration
- **Logged** - Console messages for debugging
- **Safe** - Old keys preserved by default (controlled by `ENABLE_MIGRATION_CLEANUP` flag)
- **Forward-compatible** - Version tracking enables future migrations

### Rollout Strategy

**Phase 1** (Current - v1.0):
- `ENABLE_MIGRATION_CLEANUP = false`
- Old keys preserved alongside new keys
- Monitor for issues
- Gather user feedback

**Phase 2** (Future - v1.1+):
- `ENABLE_MIGRATION_CLEANUP = true`
- Old keys cleaned up automatically
- Full migration complete
- Storage optimized
