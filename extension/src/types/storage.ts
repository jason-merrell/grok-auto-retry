/**
 * Feature flag to enable/disable deletion of old storage keys during migration.
 * 
 * When true: Old keys are deleted after successful migration (production mode)
 * When false: Old keys are preserved alongside new keys (testing mode)
 * 
 * Set to false during initial rollout to ensure data safety.
 * Set to true once migration is proven stable.
 * 
 * @default false - Safe mode, preserves old data
 */
export const ENABLE_MIGRATION_CLEANUP = false;

/**
 * Standardized storage structure for all hooks.
 * 
 * All hooks that persist data should wrap their state in this interface
 * to ensure consistent versioning and future migration support.
 * 
 * @template T - The type of state being stored
 * 
 * @property state - The actual hook state/data
 * @property version - Schema version for migration support (increment when structure changes)
 * 
 * @example
 * ```typescript
 * interface MyHookState {
 *   count: number;
 *   enabled: boolean;
 * }
 * 
 * type MyHookStore = HookStore<MyHookState>;
 * 
 * // Storage value:
 * {
 *   state: { count: 0, enabled: true },
 *   version: 1
 * }
 * ```
 */
export interface HookStore<T> {
    state: T;
    version: number;
}

/**
 * Helper to create a new store with initial state.
 */
export const createStore = <T>(state: T, version: number = 1): HookStore<T> => ({
    state,
    version,
});

/**
 * Helper to extract state from store, with fallback.
 */
export const extractState = <T>(
    store: HookStore<T> | null | undefined,
    defaultState: T
): T => {
    return store?.state ?? defaultState;
};

/**
 * Helper to check if migration is needed.
 */
export const needsMigration = <T>(
    store: HookStore<T> | null | undefined,
    currentVersion: number
): boolean => {
    if (!store) return false;
    return store.version < currentVersion;
};

/**
 * Check if a value is a HookStore (has version property).
 * Used to detect if data is in old format (no version) vs new format (with version).
 */
export const isHookStore = <T>(value: any): value is HookStore<T> => {
    return value !== null &&
        typeof value === 'object' &&
        'version' in value &&
        'state' in value &&
        typeof value.version === 'number';
};

/**
 * Single migration step function that transforms data from version N to version N+1.
 * 
 * @template T - The final state type after all migrations
 * @param data - The data at version N (input)
 * @returns The data at version N+1 (output)
 * 
 * @example
 * ```typescript
 * // Migration from v1 to v2
 * const migrateV1toV2: Migration<MyState> = (v1Data) => {
 *   return {
 *     ...v1Data,
 *     newField: 'default value', // Add new field
 *   };
 * };
 * ```
 */
export type Migration<T> = (data: any) => T;

/**
 * Configuration for a hook's migration chain.
 * 
 * @template T - The final state type after all migrations
 * 
 * @property migrations - Array of migration functions where index N represents migration from version N to N+1
 *                        - Index 0: v0 -> v1 (from pre-HookStore to HookStore)
 *                        - Index 1: v1 -> v2
 *                        - Index 2: v2 -> v3, etc.
 * @property oldKeys - Optional array of old storage keys to clean up after migration (for v0 -> v1 only)
 * 
 * @example
 * ```typescript
 * const myMigrationConfig: MigrationConfig<MyState> = {
 *   migrations: [
 *     // v0 -> v1: Wrap in HookStore
 *     (v0Data) => ({ ...DEFAULT_STATE, ...v0Data }),
 *     // v1 -> v2: Add new field
 *     (v1Data) => ({ ...v1Data, newField: 'default' }),
 *     // v2 -> v3: Rename field
 *     (v2Data) => {
 *       const { oldName, ...rest } = v2Data;
 *       return { ...rest, newName: oldName };
 *     }
 *   ],
 *   oldKeys: ['old_storage_key'] // For v0 only
 * };
 * ```
 */
export interface MigrationConfig<T> {
    migrations: Migration<T>[];
    oldKeys?: string[]; // Optional old keys to remove (v0 -> v1 migration)
}

/**
 * Apply a chain of migrations to transform data from one version to another.
 * Migrations are applied sequentially in chronological order.
 * 
 * @template T - The final state type after all migrations
 * @param rawData - The raw data at the current version
 * @param currentVersion - The version of the raw data (0 = pre-HookStore format)
 * @param targetVersion - The desired version to migrate to
 * @param config - Migration configuration with migration functions
 * @returns The migrated state at the target version
 * 
 * @example
 * ```typescript
 * // Migrate from v0 to v3 (applies v0->v1, v1->v2, v2->v3)
 * const migratedState = applyMigrations(
 *   oldData,
 *   0,  // current version
 *   3,  // target version
 *   migrationConfig
 * );
 * ```
 */
export const applyMigrations = <T>(
    rawData: any,
    currentVersion: number,
    targetVersion: number,
    config: MigrationConfig<T>
): T => {
    let state = rawData;

    // Apply each migration in sequence from current to target version
    for (let version = currentVersion; version < targetVersion; version++) {
        const migrationIndex = version; // Migration from version N to N+1 is at index N
        const migration = config.migrations[migrationIndex];

        if (!migration) {
            console.warn(`[Storage Migration] No migration defined for v${version} -> v${version + 1}`);
            continue;
        }

        console.log(`[Storage Migration] Applying migration v${version} -> v${version + 1}`);
        state = migration(state);
    }

    return state;
};

/**
 * @deprecated Use Migration<T> and MigrationConfig<T> instead
 * 
 * Legacy migration function type. New code should use the migration chain approach
 * with Migration<T> functions organized in a MigrationConfig.
 */
export type MigrationFunction<T> = (
    oldData: any,
    fromVersion: number,
    toVersion: number
) => T;
