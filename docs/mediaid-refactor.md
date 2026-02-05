# Media ID Refactor - Architecture Change

## Problem Statement

The current storage architecture uses `postId` as the primary key for tracking sessions. This causes critical race conditions and data loss issues because:

1. **Posts are ephemeral**: When a video is generated, Grok creates new post IDs:
   ```
   Image Post (467b) → Video Post 1 (5ab0) → Video Post 2 (4c48) [moderation]
   ```

2. **Race condition**: When the route changes to a new post, our load logic runs BEFORE migration:
   ```
   1. URL changes to new post
   2. useEffect triggers load for new postId
   3. No data exists yet → creates default with isActive: false
   4. Migration finally runs → but load already happened
   ```

3. **Data fragmentation**: Session data gets split across multiple postId keys:
   ```typescript
   sessionByPostId: {
     "467b": { isActive: true, retryCount: 0 },   // Original
     "5ab0": { isActive: false, retryCount: 0 },  // Migrated but inactive
     "4c48": undefined  // ❌ Missing! Race condition
   }
   ```

4. **Result**: Moderation detection fails because `isSessionActive: false`:
   ```
   [LOG] Moderation detected/validated
   [LOG] Ignoring moderation - session not active ❌
   ```

## Solution: Media ID-Based Storage

### Core Concept

Use Grok's `originalMediaId` (the source image ID) as the stable identifier throughout the entire retry session. This matches Grok's own `useMediaStore` architecture.

```
Image Post (467b) → Video Post 1 (5ab0) → Video Post 2 (4c48)
     ↓                    ↓                        ↓
          ALL use sessionByMediaId[originalMediaId]
              ✅ No migration needed!
```

### Benefits

1. **No race conditions**: Same key used throughout session lifecycle
2. **No migration logic**: `originalMediaId` never changes during retries
3. **Simpler code**: Remove complex migration and route-change tracking
4. **Matches Grok**: Aligns with Grok's `useMediaStore` architecture
5. **Better persistence**: Auto-Retry OFF applies to all retries from same image
6. **Automatic continuity**: Session state persists across post changes

## New Storage Structure

### Before (v0):
```typescript
// Old per-post keys in sessionStorage:
// 'grokRetrySession_467b8c23-ece6-4c09-b4bf-25637c755b7e'
// 'grokRetrySession_5ab02fd5-85b7-46d3-92cb-6167505e190d'
// etc.

interface OldSessionData {
  isActive: boolean;
  retryCount: number;
  // ... scattered across multiple keys
}
```

### After (v1):
```typescript
// Single key: 'useGrokRetryVideoSessions_store'
interface StoreState {
  sessionByMediaId: {
    [originalMediaId: string]: SessionData;
  };
  persistentByMediaId: {
    [originalMediaId: string]: PersistentData;
  };
}
```

### Key Changes

1. **Primary Key**: `postId` → `originalMediaId`
2. **No videoGroup array**: Not needed (all attempts share same mediaId)
3. **Track attempts differently**: Use attempt array or counter within single session

## New Load Flow (with Loading States)

### Current Flow (Broken):
```typescript
useEffect(() => {
  // Load by postId
  const session = sessionByPostId[postId] || createDefault(); // ❌ Race condition
  setData(session);
}, [postId]);
```

### New Flow (Fixed):
```typescript
useEffect(() => {
  // 1. SHOW LOADING STATE
  setIsLoading(true);
  // Disable panel inputs, show "Loading..." on Start Session button
  
  // 2. GET POST ID from URL
  const postId = useGrokRetryPostId();
  
  // 3. GET GROK'S STORAGE DATA
  const grokStore = useGrokRetryGrokStorage();
  const videoByMediaId = grokStore.state?.videoByMediaId || {};
  
  // 4. FIND ORIGINAL MEDIA ID
  let originalMediaId = null;
  let attemptData = null;
  
  for (const [mediaId, attempts] of Object.entries(videoByMediaId)) {
    const attempt = attempts.find(a => a.id === postId);
    if (attempt) {
      originalMediaId = mediaId;
      attemptData = attempt;
      break;
    }
  }
  
  if (!originalMediaId) {
    // Not a video post or Grok hasn't loaded yet
    setIsLoading(false);
    return;
  }
  
  // 5. CHECK AUTO-RETRY ENABLED
  const persistent = persistentByMediaId[originalMediaId];
  if (persistent && !persistent.autoRetryEnabled) {
    // User disabled auto-retry for this image
    setIsLoading(false);
    return; // Don't track
  }
  
  // 6. LOAD/CREATE SESSION DATA
  const session = sessionByMediaId[originalMediaId] || createDefault();
  const persistentData = persistent || createDefaultPersistent();
  
  // Update current attempt info from Grok's data
  session.currentPostId = postId;
  session.currentAttempt = attemptData;
  
  setData({ ...session, ...persistentData });
  
  // 7. REMOVE LOADING STATE
  setIsLoading(false);
}, [postId, grokStore]);
```

## Loading State UI

### Panel Components

```typescript
// When isLoading: true
<Panel disabled={isLoading}>
  <MaxRetriesInput disabled={isLoading} />
  <VideoGoalInput disabled={isLoading} />
  <PromptTextarea disabled={isLoading} />
  <StartSessionButton disabled={isLoading}>
    {isLoading ? 'Loading...' : 'Start Session'}
  </StartSessionButton>
</Panel>
```

### Loading Conditions

1. **Initial page load**: Waiting for Grok's store to populate
2. **Route change**: Switching between posts, need to resolve mediaId
3. **Extension startup**: Chrome APIs not ready yet

## Grok Storage Integration

### Structure in Grok's useMediaStore

```typescript
{
  state: {
    videoByMediaId: {
      "0e9b213c-cfcd-4376-9204-e87b1471e59d": [ // ← originalMediaId
        {
          id: "467b8c23-ece6-4c09-b4bf-25637c755b7e", // ← postId (attempt 1)
          status: "completed",
          prompt: "audible deep nose-dipping",
          moderated: false,
          // ... other fields
        },
        {
          id: "5ab02fd5-85b7-46d3-92cb-6167505e190d", // ← postId (attempt 2)
          status: "completed",
          prompt: "audible deep nose-dipping",
          moderated: true, // ← Detected!
          // ... other fields
        }
      ]
    }
  }
}
```

### Finding originalMediaId Algorithm

```typescript
function findOriginalMediaId(
  postId: string, 
  videoByMediaId: Record<string, VideoAttempt[]>
): string | null {
  for (const [mediaId, attempts] of Object.entries(videoByMediaId)) {
    if (attempts.some(a => a.id === postId)) {
      return mediaId;
    }
  }
  return null;
}
```

## Migration Strategy (v0 → v1)

### Migration Function

```typescript
// Migration: v0 → v1
function migrateV0toV1(grokStore: any): V1StoreState {
  const v1Data: V1StoreState = {
    sessionByMediaId: {},
    persistentByMediaId: {}
  };
  
  const videoByMediaId = grokStore?.state?.videoByMediaId || {};
  
  // Scan all old session keys in sessionStorage
  const oldKeyPattern = /^grokRetrySession_(.+)$/;
  
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key || !oldKeyPattern.test(key)) continue;
    
    const postId = key.match(oldKeyPattern)[1];
    const rawData = sessionStorage.getItem(key);
    if (!rawData) continue;
    
    try {
      const oldSessionData = JSON.parse(rawData);
      
      // Find mediaId for this postId
      const mediaId = findOriginalMediaId(postId, videoByMediaId);
      if (!mediaId) continue; // Can't migrate without mediaId
      
      // Consolidate into mediaId-based storage
      if (!v1Data.sessionByMediaId[mediaId]) {
        // First session for this mediaId
        v1Data.sessionByMediaId[mediaId] = {
          ...createDefaultSessionData(),
          ...oldSessionData,
          currentPostId: postId,
          currentAttempt: null,
        };
      } else {
        // Merge with existing session for this mediaId
        const existing = v1Data.sessionByMediaId[mediaId];
        existing.retryCount = Math.max(existing.retryCount, oldSessionData.retryCount || 0);
        existing.logs = [...existing.logs, ...(oldSessionData.logs || [])];
        existing.isActive = existing.isActive || oldSessionData.isActive;
      }
      
      // Create persistent data if doesn't exist
      if (!v1Data.persistentByMediaId[mediaId]) {
        v1Data.persistentByMediaId[mediaId] = {
          maxRetries: oldSessionData.maxRetries ?? 3,
          autoRetryEnabled: oldSessionData.autoRetryEnabled ?? true,
          lastPromptValue: oldSessionData.lastPromptValue || '',
          videoGoal: oldSessionData.videoGoal ?? 1,
        };
      }
    } catch (error) {
      console.error('[Migration] Failed to migrate key:', key, error);
    }
  }
  
  return v1Data;
}
```

### Migration Config

```typescript
const MIGRATION_CONFIG: MigrationConfig<StoreState> = {
  migrations: [
    // v0 → v1: Migrate from per-post keys to mediaId-based HookStore
    (v0Data: any): V1StoreState => {
      // Get Grok store for mediaId lookup
      const grokStoreRaw = sessionStorage.getItem('useMediaStore');
      const grokStore = grokStoreRaw ? JSON.parse(grokStoreRaw) : null;
      
      // If no Grok store, return empty v1 structure
      if (!grokStore) {
        return {
          sessionByMediaId: {},
          persistentByMediaId: {}
        };
      }
      
      return migrateV0toV1(grokStore);
    }
  ],
  oldKeys: [
    // Pattern for old keys (will be removed after migration)
    /^grokRetrySession_.+$/
  ]
};
```

### Version

```typescript
const CURRENT_VERSION = 1;
```

### Old Key Cleanup

After successful migration, clean up all old v0 keys:

```typescript
function cleanupOldKeys() {
  if (!ENABLE_MIGRATION_CLEANUP) return;
  
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && /^grokRetrySession_.+$/.test(key)) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    sessionStorage.removeItem(key);
    console.log('[Migration] Removed old key:', key);
  });
}
```

## Updated Type Definitions

### SessionData

```typescript
interface SessionData {
  isActive: boolean;
  retryCount: number;           // Increments on each moderation retry
  videosGenerated: number;      // Increments on each successful (non-moderated) video
  
  // NEW: Track current attempt info (from Grok)
  currentPostId: string | null;
  currentAttempt: VideoAttempt | null;
  
  // NEW: Track which attempts we've already processed (to avoid double-counting)
  processedAttemptIds: string[];  // Array of postIds we've already counted
  
  // Remove sessionMediaId (redundant - it's the key now)
  // sessionMediaId: string | null; ❌ REMOVE
  
  outcome: SessionOutcome;
  logs: string[];
  lastAttemptTime: number;
  lastFailureTime: number;
  canRetry: boolean;
  attemptProgress: AttemptProgressEntry[];
  creditsUsed: number;
  layer1Failures: number;
  layer2Failures: number;
  layer3Failures: number;
  lastSessionSummary: SessionSummary | null;
}
```

### PersistentData

```typescript
interface PersistentData {
  maxRetries: number;
  autoRetryEnabled: boolean;
  lastPromptValue: string;
  videoGoal: number;
  
  // REMOVE: videoGroup (no longer needed)
  // videoGroup: string[]; ❌ REMOVE
  
  // REMOVE: originalMediaId (it's the key now)
  // originalMediaId: string | null; ❌ REMOVE
}
```

### VideoAttempt (from Grok)

```typescript
interface VideoAttempt {
  id: string;          // postId
  status: string;      // "pending" | "processing" | "completed" | "failed"
  prompt: string;
  moderated: boolean;
  thumbnailUrl?: string;
  videoUrl?: string;
  createTime: string;
  // ... other Grok fields
}
```

## Hook Changes Summary

### useGrokRetryVideoSessions

**Changes:**
1. Remove `migratePost()` function (no longer needed)
2. Remove route-change tracking logic
3. Update load logic to use mediaId lookup
4. Add loading state management
5. Update all CRUD operations to use mediaId keys

**New Signature:**
```typescript
export const useGrokRetryVideoSessions = (
  postId: string | null,
  grokStore: GrokStore | null
) => {
  const [data, setData] = useState<PostData | null>(null);
  const [isLoading, setIsLoading] = useState(true); // NEW
  
  // ... implementation
  
  return {
    data,
    isLoading, // NEW
    updateSession,
    updatePersistent,
    clearSession,
    // migratePost, ❌ REMOVE
  };
};
```

### useGrokRetry

**Changes:**
1. Remove `migratePost` usage
2. Remove `__grok_migrate_state` window property
3. Handle loading state in UI
4. Disable panel when loading

### useGrokRetryPostId

**Changes:**
1. Remove migration trigger logic
2. Simplify route change detection (only for UI updates)
3. Remove `__grok_pending_route_eval` tracking

## Stale Session Detection

### Updated Logic0→v1 Migration
- Add migration function
- Scan old per-post keys
- Consolidate by mediaId
- Keep version at 1
```typescript
function validateSessionAgainstGrokStore(
  mediaId: string,
  sessionData: SessionData,
  grokStore: GrokStore
): boolean {
  // Check if mediaId still exists in Grok's store
  const videoAttempts = grokStore.state?.videoByMediaId?.[mediaId];
  
  if (!videoAttempts) {
    console.warn('[Session Validation] Media ID no longer in Grok store:', mediaId);
    return false; // Stale
  }
  
  // Check if current attempt exists
  if (sessionData.currentPostId) {
    const attemptExists = videoAttempts.some(a => a.id === sessionData.currentPostId);
    if (!attemptExists) {
      console.warn('[Session Validation] Current attempt not found:', sessionData.currentPostId);
      return false; // Stale
    }
  }
  
  return true; // Valid
}
```

## Implementation Phases

### Phase 1: Add Loading States
- Add `isLoading` state to useGrokRetryVideoSessions
- Update UI components to handle loading
- Disable inputs when loading

### Phase 2: Update Type Definitions
- Change interfaces to use mediaId keys
- Remove videoGroup, originalMediaId fields
- Add currentPostId, currentAttempt fields

### Phase 3: Implement v1→v2 Migration
- Add migration function
- Test with existing v1 data
- Bump version to 2

### Phase 4: Refactor Load Logic
- Implement mediaId lookup from Grok store
- Update load flow with new steps
- Remove migration logic

### Phase 5: Update CRUD Operations
- Change all operations to use mediaId
- Remove migratePost function
- Update stale session detection

### Phase 6: Simplify Route Tracking
- Remove complex migration triggers
- Simplify useGrokRetryPostId
- Clean up window properties

### Phase 7: Testing
- Test fresh session start
- Test moderation detection
- Test session persistence across route changes
- Test Auto-Retry OFF functionality
- Test migration from v1 to v2

## Testing Checklist

- [ ] Load page with n0 data (old per-post keys) → migrates to v1 correctly
- [ ] Old keys cleaned up after migration (if cleanup enabled) with loading
- [ ] Load page with v1 data → migrates to v2 correctly
- [ ] Start session → creates sessionByMediaId entry
- [ ] Video generates, route changes → same session continues
- [ ] Moderation detected → retry triggers (isActive stays true)
- [ ] Multiple retries → data persists across all attempts
- [ ] Turn Auto-Retry OFF → applies to all future attempts
- [ ] Page refresh mid-session → detects stale, clears properly
- [ ] Multiple images → each has separate session data
- [ ] Loading states → panel disabled until mediaId resolved

## Rollback Plan

If issues arise:
0 as fallback**: Don't delete old keys immediately (use ENABLE_MIGRATION_CLEANUP flag)
2. **Feature flag**: Add `ENABLE_MEDIAID_STORAGE` flag (default: true)
3. **Dual-write**: Temporarily write to both v0 and v1 formats during transition
4. **Gradual rollout**: Test thoroughly before enabling cleanup
5. **Manual recovery**: Users can manually restore old keysirst
5. **Version check**: Allow downgrade from v2 to v1 if needed

## Session State Management

### Determining if Session is Active

A session is active when ALL of these conditions are true:

```typescript
function isSessionActive(session: SessionData, persistent: PersistentData): boolean {
  // Must have started a session
  if (!session.isActive) return false;
  
  // Must not have reached video goal
  if (session.videosGenerated >= persistent.videoGoal) return false;
  
  // Must not have exceeded max retries
  if (session.retryCount >= persistent.maxRetries) return false;
  
  // Must have a current attempt in progress
  if (!session.currentPostId) return false;
  
  return true;
}
```

### Retry Count Increment Logic

Retry count increments when:
1. **Moderation is detected** on a new attempt
2. **We haven't processed this attempt yet** (not in processedAttemptIds)
3. **Session is still active** (under max retries)

```typescript
function processNewAttempts(
  mediaId: string,
  session: SessionData,
  grokAttempts: VideoAttempt[]
): SessionData {
  const updated = { ...session };
  
  // Find attempts we haven't processed yet
  const newAttempts = grokAttempts.filter(
    attempt => !session.processedAttemptIds.includes(attempt.id)
  );
  
  for (const attempt of newAttempts) {
    // Process based on status
    if (attempt.moderated && attempt.status === 'completed') {
      // MODERATION DETECTED - increment retry count
      updated.retryCount++;
      updated.layer1Failures++; // Assuming moderation is layer 1
      updated.logs.push(
        `${timestamp()} — MODERATION — Video ${attempt.id.slice(0, 8)} was moderated (Retry ${updated.retryCount}/${maxRetries})`
      );
      
      // Check if we should retry
      if (updated.retryCount < maxRetries) {
        // Trigger retry (click "Make video" again)
        triggerRetry(attempt.prompt);
      } else {
        // Max retries reached
        updated.isActive = false;
        updated.outcome = 'max_retries';
        updated.logs.push(
          `${timestamp()} — FAILURE — Max retries (${maxRetries}) reached, giving up`
        );
      }
      
    } else if (!attempt.moderated && attempt.status === 'completed') {
      // SUCCESS - increment videos generated
      updated.videosGenerated++;
      updated.logs.push(
        `${timestamp()} — SUCCESS — Video ${attempt.id.slice(0, 8)} generated successfully (${updated.videosGenerated}/${videoGoal})`
      );
      
      // Check if we've reached the goal
      if (updated.videosGenerated >= videoGoal) {
        // Goal reached!
        updated.isActive = false;
        updated.outcome = 'success';
        updated.logs.push(
          `${timestamp()} — COMPLETE — Video goal (${videoGoal}) reached!`
        );
      } else {
        // Need more videos, trigger next generation
        triggerNextVideo(attempt.prompt);
      }
      
    } else if (attempt.status === 'failed') {
      // FAILURE - technical error
      updated.layer3Failures++;
      updated.logs.push(
        `${timestamp()} — ERROR — Video ${attempt.id.slice(0, 8)} failed to generate`
      );
      
      // Treat as retry attempt
      if (updated.retryCount < maxRetries) {
        updated.retryCount++;
        triggerRetry(attempt.prompt);
      } else {
        updated.isActive = false;
        updated.outcome = 'max_retries';
      }
    }
    
    // Mark this attempt as processed
    updated.processedAttemptIds.push(attempt.id);
    
    // Update current attempt tracking
    updated.currentPostId = attempt.id;
    updated.currentAttempt = attempt;
  }
  
  return updated;
}
```

### Videos Generated Count Logic

Videos generated increments when:
1. **Video completes successfully** (status === 'completed')
2. **Video is NOT moderated** (moderated === false)
3. **We haven't counted this attempt yet** (not in processedAttemptIds)

```typescript
// Examples:
// Attempt 1: moderated=false, completed → videosGenerated = 1
// Attempt 2: moderated=true, completed  → retryCount = 1, videosGenerated still 1
// Attempt 3: moderated=false, completed → videosGenerated = 2
// Attempt 4: moderated=true, completed  → retryCount = 2, videosGenerated still 2
```

### Load Flow with State Synchronization

```typescript
useEffect(() => {
  setIsLoading(true);
  
  // 1. Get postId from URL
  const postId = currentUrlPostId;
  
  // 2. Get Grok's storage
  const grokStore = getGrokStore();
  const videoByMediaId = grokStore?.state?.videoByMediaId || {};
  
  // 3. Find mediaId for this post
  let mediaId = null;
  let grokAttempts = [];
  
  for (const [id, attempts] of Object.entries(videoByMediaId)) {
    if (attempts.some(a => a.id === postId)) {
      mediaId = id;
      grokAttempts = attempts;
      break;
    }
  }
  
  if (!mediaId) {
    setIsLoading(false);
    return; // Not a video post
  }
  
  // 4. Load our session data
  let session = sessionByMediaId[mediaId];
  const persistent = persistentByMediaId[mediaId];
  
  // Check if auto-retry is disabled
  if (persistent && !persistent.autoRetryEnabled) {
    setIsLoading(false);
    return; // Don't track this session
  }
  
  // 5. Create or update session
  if (!session) {
    // New session
    session = createDefaultSessionData();
    session.currentPostId = postId;
    session.processedAttemptIds = [];
  }
  
  // 6. Process any new attempts from Grok
  session = processNewAttempts(mediaId, session, grokAttempts);
  
  // 7. Update storage
  sessionByMediaId[mediaId] = session;
  saveStore();
  
  // 8. Set UI state
  setData({ ...session, ...persistent });
  setIsLoading(false);
  
}, [postId, grokStore]);
```

### Tracking Multiple Attempts

**Scenario**: User starts session, gets 3 moderated videos, then 1 success

```typescript
// Initial state
session = {
  retryCount: 0,
  videosGenerated: 0,
  processedAttemptIds: [],
  isActive: true
}

// Grok's videoByMediaId[mediaId]:
[
  { id: 'post1', moderated: true, status: 'completed' },   // First attempt
  { id: 'post2', moderated: true, status: 'completed' },   // Retry 1
  { id: 'post3', moderated: true, status: 'completed' },   // Retry 2
  { id: 'post4', moderated: false, status: 'completed' },  // Retry 3 - SUCCESS
]

// After processing:
session = {
  retryCount: 3,              // Counted 3 moderated attempts
  videosGenerated: 1,         // Counted 1 successful video
  processedAttemptIds: ['post1', 'post2', 'post3', 'post4'],
  isActive: false,            // videosGenerated >= videoGoal (1 >= 1)
  outcome: 'success'
}
```

### Avoiding Double-Counting

The `processedAttemptIds` array prevents counting the same attempt twice:

```typescript
// Scenario: Page loads while on 'post3', Grok has:
[
  { id: 'post1', moderated: true },
  { id: 'post2', moderated: true },
  { id: 'post3', moderated: false },  // Current page
]

// If processedAttemptIds = ['post1', 'post2']:
const newAttempts = grokAttempts.filter(
  a => !['post1', 'post2'].includes(a.id)
);
// Result: only processes 'post3'

// After processing:
processedAttemptIds = ['post1', 'post2', 'post3'];  // Now all tracked
```

### Session Activation

Session becomes active when user clicks "Start Session":

```typescript
function startSession(mediaId: string, prompt: string) {
  const session = sessionByMediaId[mediaId] || createDefaultSessionData();
  
  // Reset for new session
  session.isActive = true;
  session.retryCount = 0;
  session.videosGenerated = 0;
  session.processedAttemptIds = [];
  session.outcome = 'idle';
  session.logs = [
    `${timestamp()} — START — Session started with prompt: ${prompt.slice(0, 50)}...`
  ];
  session.currentPostId = currentPostId;
  
  // Save and trigger video generation
  sessionByMediaId[mediaId] = session;
  saveStore();
  
  clickMakeVideoButton(prompt);
}
```

### Session Deactivation

Session becomes inactive when:

1. **Goal reached**: `videosGenerated >= videoGoal`
2. **Max retries**: `retryCount >= maxRetries`
3. **User cancels**: Manual cancellation
4. **Stale session**: Page refresh detected

```typescript
function shouldDeactivateSession(
  session: SessionData,
  persistent: PersistentData
): { shouldDeactivate: boolean; reason: string } {
  if (session.videosGenerated >= persistent.videoGoal) {
    return { shouldDeactivate: true, reason: 'goal_reached' };
  }
  
  if (session.retryCount >= persistent.maxRetries) {
    return { shouldDeactivate: true, reason: 'max_retries' };
  }
  
  if (isStaleSession(session)) {
    return { shouldDeactivate: true, reason: 'stale' };
  }
  
  return { shouldDeactivate: false, reason: '' };
}
```

## Future Enhancements

Once stable, the mediaId-based approach enables:

1. **Cross-image analytics**: Track retry success rates per original image
2. **Batch operations**: Apply settings to all attempts from same image
3. **Better history**: Group all attempts by source image
4. **Smarter retries**: Learn which prompts work best for specific images
5. **Cost tracking**: See total credits used per original image

## Conclusion

This refactor solves the fundamental architectural flaw of tracking sessions by ephemeral postIds. By aligning with Grok's mediaId-based storage, we eliminate race conditions, simplify code, and create a more robust retry system.

The key insight: **Posts change, but the original image ID is stable throughout the entire retry session.**
