# Stale Session Detection

This document explains how the extension detects and handles stale sessions by validating against Grok's internal state.

## Problem

When a user refreshes the page or navigates away and back, several things happen:

1. **Grok clears its media store** - `sessionStorage['useMediaStore']` is reset
2. **Our extension data persists** - `sessionStorage['useGrokRetryVideoSessions_store']` remains
3. **Mismatch occurs** - Our extension thinks a session is active, but Grok has forgotten about it

This causes issues:
- ❌ "Active session" indicator shows when no session exists
- ❌ Extension tries to track videos that don't exist
- ❌ Retry logic references media IDs that Grok doesn't know about
- ❌ Confusion between old and new sessions

## Solution: Validation Against Grok's useMediaStore

The extension validates stored session data against Grok's internal state on every load.

### Validation Logic

```typescript
const validateSessionAgainstGrokStore = (sessionData: SessionData): boolean => {
    // Nothing to validate if no sessionMediaId
    if (!sessionData.sessionMediaId) {
        return true;
    }

    // Inactive sessions don't need validation
    if (!sessionData.isActive) {
        return true;
    }

    // Get Grok's current media store
    const grokStore = JSON.parse(sessionStorage.getItem('useMediaStore'));
    const videoByMediaId = grokStore?.state?.videoByMediaId;

    // Check if our sessionMediaId exists in Grok's store
    const mediaExists = sessionData.sessionMediaId in videoByMediaId;

    return mediaExists;
};
```

### Detection Criteria

A session is considered **STALE** when:
1. `sessionData.sessionMediaId` is set (we're tracking something)
2. `sessionData.isActive === true` (we think session is running)
3. `sessionMediaId` **NOT** in `useMediaStore.state.videoByMediaId` (Grok doesn't know about it)

A session is considered **VALID** when:
- No `sessionMediaId` set (session hasn't started)
- Session is inactive (`isActive === false`)
- `sessionMediaId` exists in Grok's `videoByMediaId`

### Cleaning Stale Sessions

```typescript
const cleanStaleSessionData = (store: StoreState): StoreState => {
    const cleanedSessionByPostId: Record<string, SessionData> = {};
    
    for (const [postId, sessionData] of Object.entries(store.sessionByPostId)) {
        if (validateSessionAgainstGrokStore(sessionData)) {
            // Valid session - keep it
            cleanedSessionByPostId[postId] = sessionData;
        } else {
            // Stale session - reset to defaults
            cleanedSessionByPostId[postId] = createDefaultSessionData();
        }
    }

    return {
        sessionByPostId: cleanedSessionByPostId,
        persistentByPostId: store.persistentByPostId, // Always preserved
    };
};
```

## What Gets Cleared vs Preserved

### Cleared (Session Data)
When a session is detected as stale, the following are reset:

```typescript
{
    isActive: false,           // ← Cleared
    retryCount: 0,             // ← Cleared
    videosGenerated: 0,        // ← Cleared
    sessionMediaId: null,      // ← Cleared
    attemptProgress: [],       // ← Cleared
    creditsUsed: 0,            // ← Cleared
    outcome: 'idle',           // ← Cleared
    logs: [],                  // ← Cleared
    // ... all other session fields reset
}
```

### Preserved (Persistent Data)
User preferences and settings survive stale session cleanup:

```typescript
{
    maxRetries: 3,             // ✓ Preserved
    autoRetryEnabled: true,    // ✓ Preserved
    lastPromptValue: "...",    // ✓ Preserved
    videoGoal: 5,              // ✓ Preserved
    videoGroup: [...],         // ✓ Preserved
    originalMediaId: "...",    // ✓ Preserved
}
```

## When Validation Occurs

Validation runs automatically during:

1. **Extension load** - Every time the extension initializes
2. **Page load** - When user navigates to /imagine/post/{postId}
3. **Store parsing** - Whenever `parseStore()` reads from sessionStorage

```typescript
const parseStore = (): StoreState => {
    const raw = sessionStorage.getItem(STORE_KEY);
    const parsed = JSON.parse(raw);
    let state = extractState(parsed, defaultState);
    
    // Validate and clean on every load
    state = cleanStaleSessionData(state);
    
    return state;
};
```

## Example Scenarios

### Scenario 1: Page Refresh During Active Session

**Before Refresh**:
```typescript
// Our store
{
  sessionByPostId: {
    "post123": {
      isActive: true,
      sessionMediaId: "img_abc",
      retryCount: 2,
      videosGenerated: 3
    }
  }
}

// Grok's store
{
  videoByMediaId: {
    "img_abc": [ /* videos */ ]
  }
}
```

**User refreshes page** → Grok clears `useMediaStore`

**After Refresh**:
```typescript
// Our store (persisted)
{
  sessionByPostId: {
    "post123": {
      isActive: true,        // ← Still thinks active
      sessionMediaId: "img_abc",
      retryCount: 2,
      videosGenerated: 3
    }
  }
}

// Grok's store (cleared!)
{
  videoByMediaId: {}  // ← Empty!
}
```

**Validation Detects Stale Session**:
```
[useGrokRetryVideoSessions] Session is stale - sessionMediaId not in Grok store: img_abc
[useGrokRetryVideoSessions] Clearing stale session for post: post123
[useGrokRetryVideoSessions] Cleaned 1 stale session(s)
```

**Result**:
```typescript
// Our store (cleaned)
{
  sessionByPostId: {
    "post123": {
      isActive: false,      // ← Cleared
      sessionMediaId: null, // ← Cleared
      retryCount: 0,        // ← Reset
      videosGenerated: 0    // ← Reset
    }
  },
  persistentByPostId: {
    "post123": {
      maxRetries: 3,        // ← Preserved
      videoGoal: 5          // ← Preserved
    }
  }
}
```

### Scenario 2: User Navigates Away and Back

**Step 1**: User has active session on `post123`
```typescript
sessionMediaId: "img_abc"
isActive: true
```

**Step 2**: User navigates to `/home` → Grok clears media store

**Step 3**: User navigates back to `/imagine/post/post123`

**Step 4**: Extension loads → Validation runs → Detects stale session → Clears it

**Step 5**: User can start fresh session without confusion

### Scenario 3: Valid Session (No Cleaning)

**Scenario**: User stays on page, extension reloads (dev mode)

**Extension Store**:
```typescript
{
  isActive: true,
  sessionMediaId: "img_abc"
}
```

**Grok's Store**:
```typescript
{
  videoByMediaId: {
    "img_abc": [ /* videos still here */ ]
  }
}
```

**Validation**: ✅ `img_abc` exists in Grok's store → Valid → No cleaning

## Console Logging

### Stale Session Detected
```
[useGrokRetryVideoSessions] Session is stale - sessionMediaId not in Grok store: img_abc
[useGrokRetryVideoSessions] Clearing stale session for post: post123
[useGrokRetryVideoSessions] Cleaned 1 stale session(s)
```

### Grok Store Missing
```
[useGrokRetryVideoSessions] Grok useMediaStore not found, session may be stale
```

### Validation Error
```
[useGrokRetryVideoSessions] Error validating against Grok store: <error>
```

### Valid Sessions (No Logs)
When all sessions are valid, no logs are emitted (silent success).

## Benefits

✅ **Accurate State** - Extension state always matches Grok's reality
✅ **No Ghost Sessions** - Prevents "active" indicator when nothing is running
✅ **Clean Restarts** - Page refreshes don't leave stale data
✅ **User Confidence** - UI accurately reflects session status
✅ **Debug Friendly** - Console logs explain what happened
✅ **Graceful Degradation** - Validation errors default to keeping data (false positives avoided)

## Edge Cases

### Edge Case 1: Grok Store Doesn't Exist Yet

**Situation**: Extension loads before Grok initializes its store

**Behavior**: Validation returns `false` (session marked stale)

**Reason**: If Grok hasn't loaded, any stored session is definitely stale

**Alternative**: Could wait for Grok store, but that delays UI. Better to clear and let user restart.

### Edge Case 2: Validation Error (JSON Parse Fails)

**Situation**: Grok's store contains invalid JSON

**Behavior**: Validation returns `true` (assume valid)

**Reason**: Avoid false positives that clear valid sessions

**Tradeoff**: Might keep a stale session, but safer than clearing good data

### Edge Case 3: Multiple Posts, Mixed Validity

**Situation**: User has sessions for multiple posts, some valid, some stale

**Behavior**: Each post validated independently, only stale ones cleared

**Result**: Valid sessions preserved, stale ones cleared

## Testing

### Manual Testing

1. **Start Session** → Generate videos
2. **Refresh Page** → Check console for "Cleaned N stale session(s)"
3. **Verify UI** → "Active" indicator should be off
4. **Check Storage** → `sessionStorage['useGrokRetryVideoSessions_store']` should have cleared session data

### Test with Console

```javascript
// Simulate stale session
const store = JSON.parse(sessionStorage.getItem('useGrokRetryVideoSessions_store'));
store.state.sessionByPostId['post123'] = {
    isActive: true,
    sessionMediaId: 'fake_id_that_doesnt_exist',
    retryCount: 5
};
sessionStorage.setItem('useGrokRetryVideoSessions_store', JSON.stringify(store));

// Reload page → Should detect stale session and clear it
location.reload();
```

### Expected Behavior

Before validation:
```typescript
isActive: true
sessionMediaId: 'fake_id'
```

After validation:
```typescript
isActive: false
sessionMediaId: null
```

## Implementation Details

### File Location
`/extension/src/hooks/useGrokRetryVideoSessions.ts`

### Key Functions

**`validateSessionAgainstGrokStore(sessionData)`**
- Returns `true` if session is valid
- Returns `false` if session is stale

**`cleanStaleSessionData(store)`**
- Iterates through all sessions
- Validates each one
- Clears stale sessions
- Preserves persistent data
- Returns cleaned store

**`parseStore()`**
- Reads from sessionStorage
- Calls `cleanStaleSessionData()`
- Returns validated state

### Integration Points

1. **Hook initialization** - `useGrokRetryVideoSessions` calls `parseStore()` on mount
2. **Every read** - `parseStore()` validates on every call
3. **No writes needed** - Cleaning happens during read, saves happen naturally

## Future Enhancements

### Potential Improvements

1. **Background validation** - Periodically check for stale sessions (every 30s?)
2. **User notification** - Alert user when stale session detected: "Previous session cleared"
3. **Stale session recovery** - Attempt to preserve some data (retry count, logs)
4. **Validation cache** - Avoid re-validating same session multiple times
5. **Metric tracking** - Count how often stale sessions occur

### Considerations

- **Performance** - Validation is lightweight (JSON parse + object check)
- **Frequency** - Only runs on load, not on every update
- **Error handling** - Defaults to keeping data on errors
- **User experience** - Silent cleanup better than broken UI

## Summary

Stale session detection ensures the extension's state stays synchronized with Grok's internal state by:

1. ✅ Validating stored sessions against Grok's `useMediaStore`
2. ✅ Clearing sessions that reference non-existent media
3. ✅ Preserving user preferences and settings
4. ✅ Running automatically on every load
5. ✅ Logging cleanup actions for debugging

This prevents confusion, ghost sessions, and UI inconsistencies after page refreshes or navigation.
