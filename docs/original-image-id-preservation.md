# Original Image ID Preservation

## Overview

This document explains how the extension ensures that all video generation attempts within a session reference the **same source image**, even when generating multiple videos (videoGoal > 1) that cause page navigation.

## The Problem

When generating multiple videos from a single image:

1. User starts on `/imagine/post/{postId1}` with an image (mediaId: `abc123`)
2. First video is generated successfully
3. Grok's UI navigates to `/imagine/post/{postId2}` (new post for the video)
4. Session continues to generate video #2
5. **Issue**: `findPrimaryMediaId()` now detects a different image in the DOM
6. Subsequent videos might be generated from wrong image or fail

## The Solution

### 1. Capture Original Image ID

When a session starts in `useGrokRetry.startSession()`:

```typescript
// Store the original mediaId to ensure all video attempts reference the same source image
const originalMediaIdToStore = mediaId ?? postData.originalMediaId ?? null;

saveAll({
  // ... other session data
  originalMediaId: originalMediaIdToStore,
});
```

**Logic:**
- Use current `mediaId` if available (from URL detection)
- Fall back to stored `postData.originalMediaId` if resuming a session
- Store as `null` if no image ID is available

### 2. Persist Across Sessions

The `originalMediaId` is stored in **Chrome Storage (chrome.storage.local)**, making it:
- Persistent across browser sessions
- Synchronized with other persistent data (maxRetries, videoGoal, etc.)
- Available for state migration during route changes

**Data Structure:**
```typescript
interface PersistentData {
  maxRetries: number;
  autoRetryEnabled: boolean;
  lastPromptValue: string;
  videoGoal: number;
  videoGroup: string[];
  originalMediaId: string | null; // NEW: Original image ID
}
```

### 3. Preserve During Route Changes

When the page navigates during an active session (`usePostId.tsx`):

```typescript
// Update session tracking to use new post ID, but keep original media ID
w.__grok_session_post_id = urlPostId;

// Preserve sessionMediaId (original image ID) rather than replacing with nextMediaId
if (!w.__grok_session_media_id && sessionMediaId) {
  w.__grok_session_media_id = sessionMediaId;
}
```

**Key Points:**
- `__grok_session_post_id` updates to the new post (for route tracking)
- `__grok_session_media_id` is **preserved** from the original session
- Prevents the newly detected `nextMediaId` from overwriting the original

### 4. Expose for Debugging

The original media ID is exposed in multiple places for debugging:

```typescript
// In window.__grok_retryState
window.__grok_retryState = {
  isSessionActive: true,
  retryCount: 1,
  canRetry: false,
  originalMediaId: 'abc123', // NEW
};

// In window.__grok_session_media_id
window.__grok_session_media_id = 'abc123';

// In hook return value
const { originalMediaId } = useGrokRetry({ postId, mediaId });
```

### 5. Clear on Session End

When the session ends:

```typescript
saveAll({
  isSessionActive: false,
  // ... reset counters
  originalMediaId: null, // Clear original image ID
});

// Clear ALL video attempts that share this originalMediaId
if (originalMediaId) {
  clearVideoAttemptsByMediaId(originalMediaId, outcome);
}
```

**Comprehensive Cleanup:**

When a session ends (for any reason: success, failure, cancellation, timeout), the extension performs a comprehensive cleanup of all video generation attempts that share the same `originalMediaId`:

1. **grokStream State** - Removes video attempts from the in-memory stream tracker
   - Finds all `VideoAttemptState` records where `imageReference === originalMediaId`
   - Removes them from the videos collection
   - Updates parent sessions to remove references to these attempts

2. **Chrome Storage** - Ends active sessions in persistent storage
   - Scans all stored post data (`grokRetryPost_*` keys)
   - Finds posts where `originalMediaId` matches and `isSessionActive === true`
   - Marks them as inactive and resets their session state

3. **Session Storage** - Clears temporary session data
   - Scans all session storage entries (`grokRetrySession_*` keys)
   - Marks active sessions as inactive
   - Prevents zombie sessions from persisting after page refresh

This ensures:
- No orphaned video generation attempts remain active
- All related sessions are properly terminated together
- Clean state for future video generation sessions
- Proper cleanup regardless of how the session ended

## Implementation Details

### Files Modified

1. **`useSessionStorage.ts`**
   - Added `originalMediaId` to `PersistentData` interface
   - Updated default values to include `originalMediaId: null`

2. **`useGrokRetry.ts`**
   - Capture and store `originalMediaId` in `startSession()`
   - Clear `originalMediaId` in `endSession()`
   - Export `originalMediaId` from hook return value
   - Expose in `window.__grok_retryState` for debugging

3. **`usePostId.ts`**
   - Preserve `sessionMediaId` during route migrations
   - Prevent overwriting with newly detected `nextMediaId`

### Behavior Flow

```
Session Start (post1, image: abc123)
  ↓
Store originalMediaId: 'abc123'
Set __grok_session_media_id: 'abc123'
  ↓
Video #1 Generated Successfully
  ↓
Route Change: post1 → post2
  ↓
Detect route change during active session
  ↓
Migrate state: post1 → post2
Preserve __grok_session_media_id: 'abc123' ✓
  ↓
Video #2 Attempt (still uses image: abc123)
  ↓
... continues until videoGoal reached
  ↓
Session End
  ↓
Clear originalMediaId: null
Clear __grok_session_media_id
```

## Benefits

1. **Consistency**: All videos in a session are generated from the same source image
2. **Reliability**: Prevents failures due to missing/wrong image references
3. **User Experience**: Users can confidently generate multiple video variations
4. **Comprehensive Cleanup**: All related video attempts are properly terminated when session ends
5. **No Orphaned State**: Prevents zombie sessions across storage layers
6. **Debugging**: Easy to verify which image a session is using

## Testing Scenarios

### Scenario 1: Multi-Video Generation (videoGoal = 3)

```
1. User on /imagine/post/post1 with image abc123
2. Click "Generate Video" with videoGoal = 3
3. Session starts, stores originalMediaId = 'abc123'
4. Video #1 generated → navigate to /imagine/post/post2
5. Session continues, __grok_session_media_id still 'abc123' ✓
6. Video #2 generated → navigate to /imagine/post/post3
7. Session continues, __grok_session_media_id still 'abc123' ✓
8. Video #3 generated → navigate to /imagine/post/post4
9. Session ends, originalMediaId cleared
10. All attempts for 'abc123' terminated ✓
```

**Expected**: All 3 videos use image `abc123`, all attempts properly cleaned up

### Scenario 2: Session Cancelled Mid-Generation

```
1. User starts session with image abc123, videoGoal = 3
2. Video #1 generated → navigate to /imagine/post/post2
3. Video #2 in progress on /imagine/post/post3
4. User clicks "Cancel Session"
5. Session ends with outcome = 'cancelled'
6. All attempts for 'abc123' terminated immediately ✓
7. Active sessions across all storage layers cleared ✓
```

**Expected**: Immediate cleanup of all related attempts

### Scenario 3: Multiple Concurrent Sessions (Different Images)

```
1. Tab 1: Session with image abc123, generating videos
2. Tab 2: Session with image def456, generating videos
3. Tab 1 session ends (success)
4. Only attempts for 'abc123' are cleared ✓
5. Tab 2 session continues unaffected ✓
```

**Expected**: Each session only clears its own image's attempts

### Scenario 2: Session Interrupted and Resumed

```
1. User starts session with image abc123
2. Video #1 generated, videoGoal = 3
3. User refreshes page (session ends)
4. All attempts for 'abc123' terminated ✓
5. originalMediaId is cleared from active state
6. User clicks "Generate Video" again
7. New session starts with fresh originalMediaId = 'abc123'
```

**Expected**: Fresh start, previous attempts properly cleaned

### Scenario 3: No Image Present

```
1. User on /imagine/post/post1 (text-only post, no image)
2. mediaId = null
3. Session starts, originalMediaId = null
4. Video generation may use different logic (text-to-video)
5. Session ends, no media-specific cleanup needed
```

**Expected**: No errors, gracefully handles null image ID

## Future Enhancements

1. **Image Reference Validation**: Verify the image still exists before each attempt
2. **Explicit Image Selection**: Allow users to select which image to use for videos
3. **Multi-Image Sessions**: Support generating videos from different images in sequence
4. **Image Metadata**: Store additional image info (dimensions, URL) for reference

## Debugging

To check if the original image ID is being preserved:

```javascript
// Check current session state
console.log(window.__grok_retryState.originalMediaId);

// Check session media ID
console.log(window.__grok_session_media_id);

// Check stored persistent data
chrome.storage.local.get(['grokRetryPost_{postId}'], (result) => {
  console.log(result.grokRetryPost_{postId}.originalMediaId);
});

// Verify all attempts for an image were cleared
chrome.storage.local.get(null, (allData) => {
  const activeSessions = Object.entries(allData)
    .filter(([key]) => key.startsWith('grokRetryPost_'))
    .filter(([_, data]) => data.originalMediaId === 'abc123' && data.isSessionActive);
  console.log('Active sessions for abc123:', activeSessions.length);
  // Should be 0 after session ends
});
```

Expected output during an active session:
```javascript
window.__grok_retryState.originalMediaId  // 'abc123'
window.__grok_session_media_id            // 'abc123'
```

After session ends:
```javascript
window.__grok_retryState.originalMediaId  // null
window.__grok_session_media_id            // undefined
// All related attempts cleared from storage
```

## Cleanup Architecture

The cleanup system operates across three storage layers to ensure complete termination:

### Layer 1: grokStream (In-Memory)

**Purpose**: Real-time video attempt tracking via GraphQL stream interception

**Cleanup Function**: `clearVideoAttemptsByImageReference(imageReference)`

```typescript
export function clearVideoAttemptsByImageReference(imageReference: string | null) {
  // Find all VideoAttemptState records with matching imageReference
  // Remove from videos collection
  // Update parent sessions to remove attempt references
  // Notify all listeners of state change
}
```

**Data Cleared**:
- `VideoAttemptState` entries where `imageReference === originalMediaId`
- Parent session references to cleared attempts
- Stream event history related to those attempts

### Layer 2: Chrome Storage (Persistent)

**Purpose**: Long-term persistence across browser sessions

**Cleanup Process**: Scans all `grokRetryPost_*` keys

```typescript
chrome.storage.local.get(null, (allData) => {
  for (const [key, postData] of Object.entries(allData)) {
    if (postData.originalMediaId === targetMediaId && postData.isSessionActive) {
      // Mark as inactive and reset session state
      chrome.storage.local.set({
        [key]: {
          ...postData,
          isSessionActive: false,
          retryCount: 0,
          videosGenerated: 0,
          canRetry: false,
          lastSessionOutcome: outcome,
        }
      });
    }
  }
});
```

**Data Cleared**:
- Sets `isSessionActive = false` for matching posts
- Resets session counters
- Records final outcome
- Preserves settings for future use

### Layer 3: Session Storage (Temporary)

**Purpose**: Per-page-load session data, cleared on refresh

**Cleanup Process**: Scans all `grokRetrySession_*` keys

```typescript
for (const key of sessionKeys) {
  const parsed = JSON.parse(sessionStorage.getItem(key));
  if (parsed.isSessionActive) {
    sessionStorage.setItem(key, JSON.stringify({
      ...parsed,
      isSessionActive: false,
      canRetry: false,
      retryCount: 0,
      videosGenerated: 0,
      lastSessionOutcome: outcome,
    }));
  }
}
```

**Data Cleared**:
- Marks all active sessions as inactive
- Prevents stale session resumption after navigation
- Clears retry permissions

### Cleanup Sequence

When `endSession(outcome)` is called:

```
1. resetProgressTracking()
   └─ Stop MutationObserver
   └─ Clear progress records

2. Clear window globals
   └─ delete __grok_session_post_id
   └─ delete __grok_session_media_id
   └─ delete route change flags

3. clearVideoAttemptsByMediaId(originalMediaId, outcome)
   └─ Layer 1: clearVideoAttemptsByImageReference()
   │   ├─ Remove VideoAttemptState entries
   │   └─ Update parent sessions
   └─ Layer 2: Scan chrome.storage.local
   │   └─ Mark matching posts inactive
   └─ Layer 3: Scan sessionStorage
       └─ Mark matching sessions inactive

4. clearVideoGroupChain(outcome)
   └─ Clear videoGroup arrays in related posts

5. Create SessionSummary
   └─ Record final statistics

6. saveAll() to update current post state
   └─ isSessionActive = false
   └─ originalMediaId = null
```

### Why Three Layers?

1. **grokStream**: Fast in-memory tracking, survives navigation within same page load
2. **Chrome Storage**: Persists across refreshes and browser restarts, syncs across tabs
3. **Session Storage**: Page-specific state, automatically cleared on full navigation

This multi-layer approach ensures:
- **Immediate cleanup** in active memory
- **Persistent cleanup** for future page loads
- **Complete cleanup** even if browser crashes or tabs are duplicated

## Related Documentation

- [Video Generation Lifecycle](./video-generation-lifecycle.md) - Complete session lifecycle
- [Session Storage](../extension/src/hooks/useSessionStorage.ts) - Data persistence implementation
- [Post ID Hook](../extension/src/hooks/usePostId.ts) - Route change detection
