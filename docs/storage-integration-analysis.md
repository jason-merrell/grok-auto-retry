# Storage Integration Analysis

## Overview

This document analyzes the potential for integrating Grok's native `sessionStorage['useMediaStore']` with our extension's storage system.

## Current Storage Architecture

### Our Extension Storage

**chrome.storage.local** (Persistent, per-post):
```typescript
{
  maxRetries: number;
  autoRetryEnabled: boolean;
  lastPromptValue: string;
  videoGoal: number;
  videoGroup: string[];           // Related post IDs
  originalMediaId: string | null; // Original image ID
}
```

**sessionStorage** (Per-session, per-post):
```typescript
{
  retryCount: number;
  isSessionActive: boolean;
  videosGenerated: number;
  lastAttemptTime: number;
  lastFailureTime: number;
  canRetry: boolean;
  logs: string[];
  attemptProgress: AttemptProgressEntry[];
  creditsUsed: number;
  layer1Failures: number;
  layer2Failures: number;
  layer3Failures: number;
  lastSessionOutcome: SessionOutcome;
  lastSessionSummary: SessionSummary | null;
  sessionMediaId: string | null;
}
```

**Key Pattern:** `grokRetrySession_[postId]` for each video/image post

### Grok's Native Storage

**sessionStorage['useMediaStore']**:
```typescript
{
  state: {
    byId: {},
    favoritesById: {
      [mediaId]: {
        id, prompt, originalPrompt, progress, moderated,
        createTime, mediaType, mediaUrl, width, height,
        images, videos, childPosts, ...
      }
    },
    videoByMediaId: {
      [parentImageId]: [{
        videoId, progress, moderated, mode, videoPrompt,
        parentPostId, videoPostId, createTime, videoDuration,
        mediaUrl, thumbnailImageUrl, width, height, ...
      }]
    },
    imageByMediaId: {
      [imageId]: [{
        id, prompt, originalPrompt, createTime, mediaUrl,
        moderated, images, videos, childPosts, width, height, ...
      }]
    }
  },
  version: 1
}
```

**Key Pattern:** Videos indexed by parent image ID, not video post ID

---

## Integration Opportunities

### 1. **Video Tracking via `videoByMediaId`**

**Current Problem:**
- We track `videoGroup: string[]` (array of video post IDs)
- We track `originalMediaId: string | null` (parent image)
- We manually increment `videosGenerated` counter
- We have no direct link to video metadata

**Grok's Solution:**
- `videoByMediaId[parentImageId]` contains ALL videos for that image
- Each video has: `videoId`, `createTime`, `progress`, `moderated`, `mediaUrl`
- Videos appear automatically after completion (both success/fail)
- No manual tracking needed

**Integration Strategy:**
```typescript
// Instead of tracking videoGroup manually:
videoGroup: string[]

// We could derive it from Grok's storage:
const grokStore = JSON.parse(sessionStorage['useMediaStore']);
const videos = grokStore.state.videoByMediaId[parentImageId] || [];
const videoGroup = videos.map(v => v.videoId);
```

**Benefits:**
- ✅ Single source of truth (Grok maintains it)
- ✅ Automatic updates (no manual tracking)
- ✅ Rich metadata (URLs, timestamps, dimensions)
- ✅ Moderation status included
- ✅ Progress tracking included

**Considerations:**
- ⚠️ Videos appear ONLY after completion (not real-time)
- ⚠️ Grok could change structure in future
- ⚠️ Need to handle missing data gracefully

---

### 2. **Original Prompt via `imageByMediaId`**

**Current Problem:**
- We don't store the original image prompt
- Can only access last video prompt via `lastPromptValue`
- No way to show "original inspiration" in stats

**Grok's Solution:**
- `imageByMediaId[imageId]` contains image metadata
- Has both `prompt` and `originalPrompt` fields
- Available immediately when viewing image

**Integration Strategy:**
```typescript
// Enhance our stats/summary with:
interface SessionSummary {
  // ... existing fields ...
  originalImagePrompt?: string;  // From Grok's imageByMediaId
  parentImageUrl?: string;        // From Grok's imageByMediaId
}

// Derive at session end:
const grokStore = JSON.parse(sessionStorage['useMediaStore']);
const imageData = grokStore.state.imageByMediaId[originalMediaId]?.[0];
if (imageData) {
  summary.originalImagePrompt = imageData.originalPrompt;
  summary.parentImageUrl = imageData.mediaUrl;
}
```

**Benefits:**
- ✅ Richer session summaries
- ✅ Better debugging (know what image started session)
- ✅ Potential UI enhancement (show thumbnail in stats)

---

### 3. **Credits Tracking via Video Completions**

**Current Problem:**
- We track `creditsUsed` manually
- Increment on each moderation detection
- No validation that credit was actually consumed

**Grok's Solution:**
- Each video in `videoByMediaId` represents a completed generation
- Moderated videos have `moderated: true` and empty `mediaUrl`
- Successful videos have `moderated: false` and full `mediaUrl`
- Both consume credits

**Integration Strategy:**
```typescript
// Instead of manual increment:
creditsUsed++

// Derive from Grok's data:
const grokStore = JSON.parse(sessionStorage['useMediaStore']);
const videos = grokStore.state.videoByMediaId[parentImageId] || [];
const creditsUsed = videos.length; // Each video = 1 credit
```

**Benefits:**
- ✅ Accurate count (Grok's authoritative data)
- ✅ Includes successful videos (we currently don't track those)
- ✅ Validation that generation actually happened

**Considerations:**
- ⚠️ Only accurate AFTER completion (not during generation)
- ⚠️ Can't increment in real-time as we do now

---

### 4. **Progress Tracking via `progress` Field**

**Current Problem:**
- We track `attemptProgress: AttemptProgressEntry[]` manually
- Requires UI scraping to get progress percentage
- Complex polling logic

**Grok's Solution:**
- Each video has `progress: 0-100` field
- Updated in real-time (presumably)
- Part of official state

**Integration Strategy:**
```typescript
// Monitor Grok's progress instead of scraping UI:
const grokStore = JSON.parse(sessionStorage['useMediaStore']);
const videos = grokStore.state.videoByMediaId[parentImageId] || [];
const currentVideo = videos.find(v => v.videoId === currentVideoId);

if (currentVideo) {
  // Use official progress instead of UI scraping
  updateProgress(currentVideo.progress);
}
```

**Benefits:**
- ✅ Official progress data
- ✅ No UI scraping needed
- ✅ More reliable

**Considerations:**
- ❌ **CRITICAL:** Testing shows `progress` appears ONLY after completion
- ❌ Not available during generation
- ❌ No advantage over UI scraping

---

### 5. **Session State Synchronization**

**Current Architecture:**
- We key by video post ID: `grokRetrySession_[videoPostId]`
- But Grok keys by parent image ID: `videoByMediaId[imageId]`
- This mismatch causes complexity

**Better Approach:**
```typescript
// Current: Per-video tracking
grokRetrySession_1b08a801-4145-4071-b375-f76ed648cc04 = { ... }
grokRetrySession_9889473f-43b2-4b11-8192-3d723e4fe3ba = { ... }

// Proposed: Per-parent tracking (matches Grok's structure)
grokRetrySession_b1da93e6-3457-4431-b2de-35c78f19c823 = {
  originalImageId: "b1da93e6-3457-4431-b2de-35c78f19c823",
  // ... our retry logic data ...
  
  // Derived from Grok's videoByMediaId[imageId]:
  get videos() {
    const grok = JSON.parse(sessionStorage['useMediaStore']);
    return grok.state.videoByMediaId[this.originalImageId] || [];
  },
  
  get videosGenerated() {
    return this.videos.length;
  },
  
  get moderatedVideos() {
    return this.videos.filter(v => v.moderated);
  },
  
  get successfulVideos() {
    return this.videos.filter(v => !v.moderated && v.mediaUrl);
  }
}
```

**Benefits:**
- ✅ Aligns with Grok's data model
- ✅ Natural grouping (all videos under one parent)
- ✅ Easier to derive counts and states
- ✅ Matches user mental model (retry session is per-image)

---

## Recommended Integration Strategy

### Phase 1: Validation Layer (Low Risk)

Keep our current storage as-is, but add Grok's data for validation:

```typescript
// In useSessionStorage or new hook:
export function useGrokStorageSync(parentImageId: string | null) {
  return useMemo(() => {
    if (!parentImageId) return null;
    
    try {
      const grokStore = JSON.parse(sessionStorage['useMediaStore']);
      const videos = grokStore.state.videoByMediaId[parentImageId] || [];
      const imageData = grokStore.state.imageByMediaId[parentImageId]?.[0];
      
      return {
        videos,
        imageData,
        videosGenerated: videos.length,
        creditsUsed: videos.length,
        moderatedCount: videos.filter(v => v.moderated).length,
        successfulCount: videos.filter(v => !v.moderated && v.mediaUrl).length
      };
    } catch (error) {
      console.error('[Grok Storage Sync] Error:', error);
      return null;
    }
  }, [parentImageId]);
}
```

**Use Cases:**
- Validate our `videosGenerated` count
- Validate our `creditsUsed` count  
- Enhance session summary with image prompt
- Add video thumbnails to UI
- Debug discrepancies

### Phase 2: Gradual Migration (Medium Risk)

Migrate specific fields to derive from Grok:

1. **videosGenerated** - Derive from `videoByMediaId[parent].length`
2. **creditsUsed** - Same as videosGenerated
3. **videoGroup** - Derive from `videoByMediaId[parent].map(v => v.videoId)`
4. **originalMediaId** - Keep as-is (we set this first)

Keep our fields:
- `retryCount`, `isSessionActive`, `canRetry` - Our retry logic
- `lastAttemptTime`, `lastFailureTime` - Our timing
- `logs`, `attemptProgress` - Our debugging data
- `layer1/2/3Failures` - Our moderation layer tracking
- `lastSessionOutcome`, `lastSessionSummary` - Our summaries

### Phase 3: Re-architecture (High Risk, High Reward)

Complete restructuring:

```typescript
// New storage model aligned with Grok
interface VideoRetrySession {
  // Parent context (set once)
  parentImageId: string;
  startedAt: number;
  videoGoal: number;
  maxRetries: number;
  
  // Retry logic state (ours)
  retryCount: number;
  isSessionActive: boolean;
  lastAttemptTime: number;
  canRetry: boolean;
  
  // Derived from Grok's videoByMediaId (getters)
  get videos(): GrokVideo[];
  get videosGenerated(): number;
  get creditsUsed(): number;
  get moderatedVideos(): GrokVideo[];
  get successfulVideos(): GrokVideo[];
  
  // Our analytics (ours)
  logs: string[];
  layer1Failures: number;
  layer2Failures: number;
  layer3Failures: number;
}

// Storage key changes from per-video to per-parent:
// OLD: grokRetrySession_[videoId]
// NEW: grokRetrySession_[parentImageId]
```

---

## Risk Analysis

### Benefits of Integration

✅ **Reduced Redundancy** - Don't duplicate what Grok tracks  
✅ **Accuracy** - Single source of truth (Grok's data)  
✅ **Richer Data** - Access to metadata we don't currently have  
✅ **Simplified Logic** - Less manual counting/tracking  
✅ **Better Alignment** - Our model matches Grok's structure  
✅ **Enhanced Features** - Can show thumbnails, URLs, timestamps  

### Risks

❌ **Breaking Changes** - Grok could change `useMediaStore` structure  
❌ **Timing Issues** - Data appears ONLY after completion (not real-time)  
❌ **Migration Complexity** - Changing storage keys affects existing sessions  
❌ **Fallback Handling** - Need graceful degradation if Grok data unavailable  
❌ **Testing Overhead** - Must validate against Grok's data continuously  

---

## Decision Matrix

| Integration Level | Effort | Risk | Benefit | Recommended? |
|------------------|--------|------|---------|--------------|
| **Phase 1: Validation** | Low (1-2 hours) | Low | Medium | ✅ **YES** - Safe improvement |
| **Phase 2: Selective** | Medium (4-6 hours) | Medium | High | 🟡 **MAYBE** - Consider after Phase 1 |
| **Phase 3: Full Rewrite** | High (12+ hours) | High | High | ❌ **NO** - Not worth risk now |

---

## Recommendation

**Start with Phase 1: Validation Layer**

1. Create `useGrokStorageSync()` hook
2. Use in session summary to show:
   - Original image prompt
   - Thumbnail URLs
   - Validation of our counts
3. Add logging to detect discrepancies
4. Monitor for 1-2 weeks

**If Phase 1 proves stable:**
- Consider Phase 2 for `videosGenerated` and `creditsUsed`
- Keep other fields independent (retry logic, timing, analytics)

**Avoid Phase 3:**
- Too much risk for uncertain reward
- Current system works well
- Can always add validation/enrichment without restructuring
