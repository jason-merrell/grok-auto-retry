# Migration System Quick Reference

## Core Concepts

### Migration Chain
Each hook defines an ordered array of migration functions. Each function transforms data from version N to N+1.

```typescript
migrations: [
    (v0Data) => v1Data,  // Index 0: v0 → v1
    (v1Data) => v2Data,  // Index 1: v1 → v2
    (v2Data) => v3Data,  // Index 2: v2 → v3
]
```

### Automatic Sequencing
The system automatically applies all necessary migrations in order:
- User on v0, target v3: Applies migrations[0], migrations[1], migrations[2]
- User on v1, target v3: Applies migrations[1], migrations[2]
- User on v2, target v3: Applies migrations[2]

## Implementation Template

```typescript
import { 
    HookStore, 
    createStore, 
    isHookStore, 
    MigrationConfig,
    applyMigrations,
    ENABLE_MIGRATION_CLEANUP
} from '@/types/storage';

// 1. Define types
interface MyState {
    field1: string;
    field2: number;
}

type MyStore = HookStore<MyState>;

// 2. Define constants
const STORAGE_KEY = 'myHook_store';
const OLD_STORAGE_KEY = 'myHook_old'; // Optional, for v0 only
const CURRENT_VERSION = 1;

const DEFAULT_STATE: MyState = {
    field1: 'default',
    field2: 0,
};

// 3. Define migration chain
const MIGRATION_CONFIG: MigrationConfig<MyState> = {
    migrations: [
        // v0 -> v1
        (v0Data: any): MyState => {
            return { ...DEFAULT_STATE, ...v0Data };
        },
        // v1 -> v2 (future)
        // (v1Data: any): MyState => {
        //     return { ...v1Data, newField: 'default' };
        // },
    ],
    oldKeys: [OLD_STORAGE_KEY], // Optional, for v0 cleanup
};

// 4. Load and migrate
useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY, OLD_STORAGE_KEY], (result) => {
        let state: MyState;
        let currentVersion = 0;
        const keysToRemove: string[] = [];

        // Determine current version
        if (result[OLD_STORAGE_KEY]) {
            // v0: Old key exists
            state = result[OLD_STORAGE_KEY];
            currentVersion = 0;
            keysToRemove.push(...(MIGRATION_CONFIG.oldKeys || []));
        } else if (result[STORAGE_KEY] && isHookStore<MyState>(result[STORAGE_KEY])) {
            // HookStore format
            const store = result[STORAGE_KEY] as MyStore;
            state = store.state;
            currentVersion = store.version;
        } else if (result[STORAGE_KEY]) {
            // Raw data without HookStore
            state = result[STORAGE_KEY];
            currentVersion = 0;
        } else {
            // No data
            state = DEFAULT_STATE;
            currentVersion = CURRENT_VERSION;
        }

        // Apply migrations if needed
        if (currentVersion < CURRENT_VERSION) {
            console.log(`[MyHook] Migrating from v${currentVersion} to v${CURRENT_VERSION}`);
            state = applyMigrations(
                state,
                currentVersion,
                CURRENT_VERSION,
                MIGRATION_CONFIG
            );

            // Save migrated data
            const store = createStore(state, CURRENT_VERSION);
            chrome.storage.local.set({ [STORAGE_KEY]: store });

            // Clean up old keys
            if (ENABLE_MIGRATION_CLEANUP && keysToRemove.length > 0) {
                chrome.storage.local.remove(keysToRemove);
                console.log('[MyHook] Migration complete, removed old keys:', keysToRemove);
            } else if (keysToRemove.length > 0) {
                console.log('[MyHook] Migration complete (cleanup disabled, old keys preserved):', keysToRemove);
            } else {
                console.log('[MyHook] Migration complete');
            }
        }

        setState(state);
        setIsLoading(false);
    });
}, []);
```

## Adding a New Version

### 1. Increment Version
```typescript
const CURRENT_VERSION = 2; // Was 1
```

### 2. Add Migration Function
```typescript
const MIGRATION_CONFIG: MigrationConfig<MyState> = {
    migrations: [
        // v0 -> v1 (existing)
        (v0Data) => ({ ...DEFAULT_STATE, ...v0Data }),
        
        // v1 -> v2 (NEW)
        (v1Data: any): MyState => {
            const { oldField, ...rest } = v1Data;
            return {
                ...rest,
                newField: oldField ?? 'default',
            };
        },
    ],
};
```

### 3. Update Types
```typescript
interface MyState {
    // oldField: string; // Removed
    newField: string;    // Added
}
```

## Migration Patterns

### Add Field
```typescript
(prevData) => ({
    ...prevData,
    newField: 'default',
})
```

### Rename Field
```typescript
(prevData) => {
    const { oldName, ...rest } = prevData;
    return { ...rest, newName: oldName };
}
```

### Remove Field
```typescript
(prevData) => {
    const { removedField, ...rest } = prevData;
    return rest;
}
```

### Transform Field
```typescript
(prevData) => ({
    ...prevData,
    field: transformValue(prevData.field),
})
```

### Nested Changes
```typescript
(prevData) => ({
    ...prevData,
    nested: {
        ...prevData.nested,
        newField: 'default',
    },
})
```

## Key Files

- **[/extension/src/types/storage.ts](file:///Users/jasonmerrell/github/grok-retry-script/extension/src/types/storage.ts)** - Core migration types and helpers
- **[/extension/src/hooks/useGrokRetrySettings.ts](file:///Users/jasonmerrell/github/grok-retry-script/extension/src/hooks/useGrokRetrySettings.ts)** - Example implementation
- **[/docs/storage-migration-strategies.md](file:///Users/jasonmerrell/github/grok-retry-script/docs/storage-migration-strategies.md)** - Detailed documentation
- **[/docs/migration-example-v1-to-v2.md](file:///Users/jasonmerrell/github/grok-retry-script/docs/migration-example-v1-to-v2.md)** - Complete example

## Console Output

```
[Storage Migration] Applying migration v0 -> v1
[MyHook] Applying migration v0 -> v1
[Storage Migration] Applying migration v1 -> v2
[MyHook] Applying migration v1 -> v2
[MyHook] Migrating from v0 to v2
[MyHook] Migration complete (cleanup disabled, old keys preserved): ['old_key']
```

## Testing Checklist

- [ ] Create test data for each version (v0, v1, v2, ...)
- [ ] Test upgrade from each version to latest
- [ ] Verify all fields transform correctly
- [ ] Check console logs for migration steps
- [ ] Inspect storage to verify new format
- [ ] Test with `ENABLE_MIGRATION_CLEANUP` true and false
- [ ] Verify old keys are handled correctly

## Benefits

✅ **Extensible** - Add new versions easily
✅ **Maintainable** - Each migration is isolated and testable
✅ **Automatic** - System handles all upgrade paths
✅ **Safe** - Can preserve old data during rollout
✅ **Clear** - Chronological migration order is explicit
✅ **Flexible** - Works with any storage API (chrome.storage, localStorage, sessionStorage)
