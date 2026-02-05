# Storage Refactoring Plan

## Overview
Refactoring our storage strategy to use a centralized approach similar to Grok's `useMediaStore` pattern.

## Problem
Current storage uses multiple scattered keys across sessionStorage and chrome.storage:
- `grokRetryPost_{postId}` for persistent data
- `grokRetrySession_{sessionKey}` for session data
- Multiple separate values making parsing difficult
- Hard to maintain consistency
- Difficult to debug

## Solution
Single centralized store with nested structure:

```typescript
// sessionStorage['useGrokRetryVideoSessions_store']
{
  sessionByPostId: {
    [postId]: {
      // Ephemeral session data
      isActive: boolean;
      retryCount: number;
      videosGenerated: number;
      // ... other session fields
    }
  },
  persistentByPostId: {
    [postId]: {
      // Data that survives reloads
      maxRetries: number;
      autoRetryEnabled: boolean;
      videoGoal: number;
      // ... other persistent fields
    }
  }
}
```

## Benefits
1. **Single source of truth** - All data in one place
2. **Type safety** - Strong TypeScript types for the entire store
3. **Easier debugging** - Inspect entire state in one key
4. **Consistent API** - Unified access pattern
5. **Better performance** - Single parse operation
6. **Cleaner code** - No scattered key management

## Implementation

### Phase 1: Create New Store ✅
- [x] Create `useGrokRetryVideoSessions.ts` hook
- [x] Define centralized types
- [x] Implement CRUD operations
- [x] Add migration support

### Phase 2: Refactor Main Hook ✅
- [x] Create `useGrokRetryV2.ts` using new store
- [x] Maintain backward-compatible API
- [x] Simplify state management logic

### Phase 3: Update Consumers (TODO)
- [ ] Update `App.tsx` to use `useGrokRetryV2`
- [ ] Remove old `useSessionStorage.ts` dependency
- [ ] Update any other components using old storage

### Phase 4: Migration & Cleanup (TODO)
- [ ] Add migration code to import old data to new format
- [ ] Test thoroughly with existing sessions
- [ ] Remove old `useSessionStorage.ts`
- [ ] Remove old `useGrokRetry.ts`
- [ ] Rename `useGrokRetryV2.ts` to `useGrokRetry.ts`

### Phase 5: Testing (TODO)
- [ ] Test session start/end
- [ ] Test route migrations
- [ ] Test retry logic
- [ ] Test moderation detection
- [ ] Test video goal completion
- [ ] Verify no data loss during migration

## Data Migration Strategy

When users load the extension with old data:
1. Check for old storage keys (`grokRetryPost_*`, `grokRetrySession_*`)
2. Parse and import to new centralized store
3. Delete old keys after successful import
4. Log migration completion

## Rollback Plan
Keep old hooks in codebase temporarily (renamed with `_legacy` suffix) in case we need to revert.

## Timeline
- Phase 1-2: Complete ✅
- Phase 3: In Progress
- Phase 4-5: Ready to start after Phase 3

## Notes
- Inspired by Grok's `useMediaStore` pattern
- Maintains all existing functionality
- No breaking changes to external API
- Improves internal architecture
