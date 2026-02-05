# Migration Example: Adding v1 → v2 Migration

This document provides a complete example of adding a new migration to a hook that's already using the migration chain system.

## Scenario

We want to update `useGrokRetrySettings` to add a new feature in version 2:
- Add a new field: `theme: 'light' | 'dark' | 'auto'`
- Rename field: `startMinimized` → `defaultMinimized`
- Remove deprecated field: `lastExportDate`

## Step-by-Step Implementation

### 1. Update the State Interface

```typescript
// Before (v1)
export interface GlobalSettings {
    defaultMaxRetries: number;
    startMinimized: boolean;
    lastExportDate?: string;
    // ... other fields
}

// After (v2)
export interface GlobalSettings {
    defaultMaxRetries: number;
    defaultMinimized: boolean;  // Renamed from startMinimized
    theme: 'light' | 'dark' | 'auto';  // New in v2
    // lastExportDate removed
    // ... other fields
}
```

### 2. Update the Version Constant

```typescript
const CURRENT_VERSION = 2; // Changed from 1
```

### 3. Update Default Values

```typescript
const DEFAULT_SETTINGS: GlobalSettings = {
    defaultMaxRetries: 3,
    defaultMinimized: false,  // Renamed
    theme: 'auto',  // New default
    // ... other defaults
};
```

### 4. Add Migration to the Chain

```typescript
const MIGRATION_CONFIG: MigrationConfig<GlobalSettings> = {
    migrations: [
        // v0 -> v1 (existing, unchanged)
        (v0Data: any): GlobalSettings => {
            console.log('[useGrokRetrySettings] Applying migration v0 -> v1');
            return { ...DEFAULT_SETTINGS, ...v0Data };
        },
        
        // v1 -> v2 (NEW MIGRATION)
        (v1Data: any): GlobalSettings => {
            console.log('[useGrokRetrySettings] Applying migration v1 -> v2');
            
            // Extract and transform v1 data
            const {
                startMinimized,  // Old field name
                lastExportDate,  // Field to remove
                ...rest
            } = v1Data;
            
            return {
                ...rest,
                defaultMinimized: startMinimized ?? false,  // Renamed field
                theme: 'auto',  // New field with default
            };
        },
    ],
    oldKeys: ['grokRetry_globalSettings'] // Only for v0->v1
};
```

### 5. Test All Migration Paths

The system automatically handles all upgrade paths:

**Users on v0 → v2**: System applies v0→v1, then v1→v2
```
Old data (v0) → Migration 0 → v1 data → Migration 1 → v2 data
```

**Users on v1 → v2**: System applies only v1→v2
```
v1 data → Migration 1 → v2 data
```

**Users on v2**: No migration needed
```
v2 data → (no changes)
```

## Console Output Examples

### Upgrading from v0 to v2

```
[Storage Migration] Applying migration v0 -> v1
[useGrokRetrySettings] Applying migration v0 -> v1
[Storage Migration] Applying migration v1 -> v2
[useGrokRetrySettings] Applying migration v1 -> v2
[useGrokRetrySettings] Migrating from v0 to v2
[useGrokRetrySettings] Migration complete (cleanup disabled, old keys preserved): ['grokRetry_globalSettings']
```

### Upgrading from v1 to v2

```
[Storage Migration] Applying migration v1 -> v2
[useGrokRetrySettings] Applying migration v1 -> v2
[useGrokRetrySettings] Migrating from v1 to v2
[useGrokRetrySettings] Migration complete
```

### Already on v2

```
(no migration logs - loads directly)
```

## Testing Strategy

### 1. Create Test Data

```javascript
// Test v0 data
chrome.storage.sync.set({
    'grokRetry_globalSettings': {
        defaultMaxRetries: 5,
        startMinimized: true,
        lastExportDate: '2025-01-01'
    }
});

// Test v1 data
chrome.storage.sync.set({
    'useGrokRetrySettings_store': {
        version: 1,
        state: {
            defaultMaxRetries: 5,
            startMinimized: true,
            lastExportDate: '2025-01-01',
            // ... other v1 fields
        }
    }
});

// Test v2 data (should not migrate)
chrome.storage.sync.set({
    'useGrokRetrySettings_store': {
        version: 2,
        state: {
            defaultMaxRetries: 5,
            defaultMinimized: true,
            theme: 'dark',
            // ... other v2 fields
        }
    }
});
```

### 2. Verify Migrations

**For v0 → v2:**
- ✅ Old key preserved (if `ENABLE_MIGRATION_CLEANUP` is false)
- ✅ New key created with version 2
- ✅ `startMinimized` becomes `defaultMinimized`
- ✅ `theme` field added with default 'auto'
- ✅ `lastExportDate` field removed
- ✅ All other fields preserved

**For v1 → v2:**
- ✅ Same key, version updated to 2
- ✅ Field transformations applied
- ✅ No old key cleanup (not v0)

**For v2:**
- ✅ No migration triggered
- ✅ Data loaded as-is

### 3. Check Console

Look for migration logs indicating which migrations were applied and verify the path taken.

## Common Patterns

### Adding a New Field

```typescript
(v1Data: any): MyStateV2 => {
    return {
        ...v1Data,
        newField: 'default value',
    };
}
```

### Renaming a Field

```typescript
(v1Data: any): MyStateV2 => {
    const { oldFieldName, ...rest } = v1Data;
    return {
        ...rest,
        newFieldName: oldFieldName,
    };
}
```

### Removing a Field

```typescript
(v1Data: any): MyStateV2 => {
    const { fieldToRemove, ...rest } = v1Data;
    return rest;
}
```

### Transforming Field Values

```typescript
(v1Data: any): MyStateV2 => {
    return {
        ...v1Data,
        // Convert array to object
        items: v1Data.itemsArray.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
        }, {}),
    };
}
```

### Nested Object Changes

```typescript
(v1Data: any): MyStateV2 => {
    return {
        ...v1Data,
        settings: {
            ...v1Data.settings,
            newNestedField: 'default',
            renamedField: v1Data.settings.oldName,
        },
    };
}
```

## Best Practices

1. **Keep migrations pure**: Each migration function should be side-effect free
2. **Add logging**: Include console.log in each migration for debugging
3. **Document changes**: Add comments explaining what each migration does
4. **Test thoroughly**: Test all upgrade paths (v0→vN, v1→vN, v2→vN, etc.)
5. **Preserve data**: Never delete data unless absolutely necessary
6. **Use defaults**: Always provide sensible defaults for new fields
7. **Version bump**: Always increment CURRENT_VERSION when adding migrations
8. **Type safety**: Use TypeScript types to ensure data integrity
9. **Backwards compatible**: Consider what happens if someone downgrades (rare but possible in dev)
10. **Migration cleanup**: Only use `oldKeys` for v0→v1 migrations (key changes)

## Troubleshooting

### Migration doesn't trigger

**Check:**
- Is `CURRENT_VERSION` incremented?
- Is the new migration function added to the array at the correct index?
- Does the stored version number match what you expect?

**Debug:**
```typescript
console.log('Current stored version:', rawData?.version);
console.log('Target version:', CURRENT_VERSION);
console.log('Migrations available:', MIGRATION_CONFIG.migrations.length);
```

### Data is lost after migration

**Check:**
- Does the migration preserve all necessary fields?
- Are field names spelled correctly?
- Are defaults provided for new fields?

**Fix:**
Add explicit field preservation:
```typescript
(v1Data: any): MyStateV2 => {
    // Explicitly list all fields to preserve
    return {
        existingField1: v1Data.existingField1,
        existingField2: v1Data.existingField2,
        // ... all existing fields
        newField: 'default',
    };
}
```

### Migration runs multiple times

**Check:**
- Is the version being saved correctly?
- Is the migration conditional logic correct?

**Fix:**
Ensure version is saved after migration:
```typescript
if (currentVersion < CURRENT_VERSION) {
    state = applyMigrations(...);
    const store = createStore(state, CURRENT_VERSION); // Save with new version
    chrome.storage.sync.set({ [STORAGE_KEY]: store });
}
```

### Users skip a version

This is handled automatically! If a user goes from v0 → v3 (skipping v1 and v2), the migration system applies all intermediate migrations in sequence:

```
v0 data → migration[0] → v1 data → migration[1] → v2 data → migration[2] → v3 data
```

No special handling needed.

## Summary

The migration chain system makes it easy to add new versions:

1. Update state interface
2. Increment `CURRENT_VERSION`
3. Add migration function to array
4. Test all upgrade paths
5. Deploy!

The system handles everything else automatically, including:
- Detecting current version
- Applying migrations in sequence
- Handling version gaps
- Logging migration steps
- Saving migrated data

This keeps your codebase clean and maintainable as your schema evolves.
