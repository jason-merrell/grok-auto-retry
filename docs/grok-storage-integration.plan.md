# Grok Storage Integration - Unified Plan

## Executive Summary

**Goal:** Leverage Grok's native `sessionStorage['useMediaStore']` to improve both moderation detection reliability and data accuracy.

**Unified Strategy:** Create a single `useGrokStorage` hook that:
1. Monitors for video completions (moderation + success)
2. Validates our manual counts against Grok's authoritative data
3. Enriches our session data with Grok's metadata
4. Provides fallback detection if UI-based detection fails

**Key Insight:** Both moderation detection and storage validation need the same data source - Grok's sessionStorage. One implementation serves both needs.

---

## Background: Two Separate Discoveries

### Discovery 1: Stream Detection Not Possible

**Problem:** Chrome Manifest V3 content scripts run in ISOLATED world and cannot intercept page-level `window.fetch` calls (MAIN world).

**Solution Found:** Grok stores video metadata in `sessionStorage['useMediaStore']`, which IS accessible to content scripts.

### Discovery 2: Storage Redundancy

**Problem:** We manually track video counts, credits, and video groups, duplicating what Grok already maintains.

**Solution Found:** The same `sessionStorage['useMediaStore']` contains ALL the data we're manually tracking.

### Unified Realization

**Both problems have the same solution:** Monitor Grok's sessionStorage for authoritative video data.

---

## Grok's Storage Structure

```typescript
sessionStorage['useMediaStore'] = {
  state: {
    videoByMediaId: {
      "[parentImageId]": [{
        // Identity
        videoId: string,                    // Video post ID
        parentPostId: string,               // Parent image ID
        
        // Status
        progress: number,                   // 0-100 (appears only after completion)
        moderated: boolean,                 // ✅ Moderation flag
        
        // Content
        mediaUrl: string,                   // Empty when moderated
        videoUrl: string,                   // Video file path
        thumbnailImageUrl: string,          // Thumbnail path
        videoPrompt: string,                // Empty for "normal" mode
        
        // Metadata
        createTime: string,                 // ISO timestamp
        videoDuration: number,              // Seconds
        mode: "normal" | "custom",          // Generation mode
        width: number,
        height: number,
        resolutionName: string,             // "480p", etc.
        
        // Additional
        modelName: string,
        rRated: boolean,
        imageReference: string,
        // ... more fields
      }]
    },
    imageByMediaId: {
      "[imageId]": [{
        id: string,
        prompt: string,                     // ✅ Original image prompt
        originalPrompt: string,
        mediaUrl: string,                   // ✅ Image URL
        createTime: string,
        moderated: boolean,
        width: number,
        height: number,
        videos: any[],                      // Child videos
        childPosts: any[],
        // ... more fields
      }]
    },
    favoritesById: { /* ... */ },
    byId: { /* ... */ }
  },
  version: 1
}
```

**Key Pattern:** Videos indexed by parent image ID, not video post ID.

**Critical Timing:** Videos appear in storage ONLY AFTER completion (both moderated and successful).

---

## Unified Use Cases

### Use Case 1: Moderation Detection + Validation

**Current Approach:**
- Primary: UI-based detection (DOM observers watch for moderation message)
- No validation layer
- No access to video metadata after detection

**With Grok Storage:**
- Primary: UI-based detection (fast, sub-second)
- Secondary: Grok storage validation (confirms moderation, provides metadata)
- Fallback: Grok storage can detect if UI structure changes

**Benefits:**
- ✅ Confirm UI detection with Grok's authoritative flag
- ✅ Extract video ID, timestamp, prompt for logging
- ✅ Detect false positives (UI showed moderation, but Grok says success)
- ✅ Future-proof against UI changes

### Use Case 2: Video Count Validation

**Current Approach:**
- Manually track `videosGenerated` counter
- Manually track `videoGroup: string[]` array
- Manually increment on each generation
- No validation that video actually completed

**With Grok Storage:**
- Derive count from `videoByMediaId[parentId].length`
- Derive IDs from `videoByMediaId[parentId].map(v => v.videoId)`
- Automatic updates when Grok adds videos
- Guaranteed accuracy (Grok's own data)

**Benefits:**
- ✅ Single source of truth
- ✅ Validates our counts
- ✅ Detects missed videos
- ✅ Includes successful videos (we currently miss these)

### Use Case 3: Credits Tracking

**Current Approach:**
- Manually increment `creditsUsed` on moderation detection
- Only counts failed videos
- No tracking of successful video credits

**With Grok Storage:**
- Each video in array = 1 credit consumed
- Count: `videoByMediaId[parentId].length`
- Includes both moderated and successful videos

**Benefits:**
- ✅ Accurate total credits (not just failures)
- ✅ Validates our tracking
- ✅ Can show credit breakdown (X moderated, Y successful)

### Use Case 4: Session Summary Enhancement

**Current Approach:**
- Summary only has our tracked data
- No original image context
- No video thumbnails or URLs
- No success video tracking

**With Grok Storage:**
- Add original image prompt from `imageByMediaId[parentId]`
- Add image URL for thumbnail display
- Add success video metadata
- Add video URLs and thumbnails

**Benefits:**
- ✅ Richer session summaries
- ✅ Better debugging (see what image started session)
- ✅ UI enhancement opportunity (show thumbnails)
- ✅ Track successful completions for stats

---

## Implementation Plan

### Phase 1: Core Hook (Unified Foundation)

Create `extension/src/hooks/useGrokStorage.ts`:

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';

// Grok's video structure (subset of fields we need)
export interface GrokVideo {
  videoId: string;
  parentPostId: string;
  progress: number;
  moderated: boolean;
  mediaUrl: string;
  videoUrl: string;
  thumbnailImageUrl: string;
  videoPrompt: string;
  createTime: string;
  videoDuration: number;
  mode: string;
  width: number;
  height: number;
}

// Grok's image structure (subset)
export interface GrokImage {
  id: string;
  prompt: string;
  originalPrompt: string;
  mediaUrl: string;
  createTime: string;
  moderated: boolean;
  width: number;
  height: number;
}

// Combined data we expose
export interface GrokStorageData {
  videos: GrokVideo[];
  imageData: GrokImage | null;
  
  // Derived counts
  videosGenerated: number;
  creditsUsed: number;
  moderatedCount: number;
  successfulCount: number;
  
  // Video groups
  videoIds: string[];
  moderatedVideoIds: string[];
  successfulVideoIds: string[];
}

interface UseGrokStorageOptions {
  onVideoDetected?: (video: GrokVideo) => void;
  onModerationDetected?: (video: GrokVideo) => void;
  pollInterval?: number; // Default 250ms
}

export function useGrokStorage(
  parentImageId: string | null,
  options: UseGrokStorageOptions = {}
): GrokStorageData | null {
  const {
    onVideoDetected,
    onModerationDetected,
    pollInterval = 250
  } = options;

  const [data, setData] = useState<GrokStorageData | null>(null);
  const seenVideoIds = useRef(new Set<string>());

  const parseGrokStorage = useCallback((): GrokStorageData | null => {
    if (!parentImageId) return null;

    try {
      const storeData = sessionStorage.getItem('useMediaStore');
      if (!storeData) return null;

      const store = JSON.parse(storeData);
      const videos: GrokVideo[] = (store.state?.videoByMediaId?.[parentImageId] || [])
        .filter((v: any) => v && v.videoId); // Filter out nulls

      const imageData: GrokImage | null = 
        store.state?.imageByMediaId?.[parentImageId]?.[0] || null;

      const moderatedVideos = videos.filter(v => v.moderated);
      const successfulVideos = videos.filter(v => !v.moderated && v.mediaUrl);

      return {
        videos,
        imageData,
        videosGenerated: videos.length,
        creditsUsed: videos.length,
        moderatedCount: moderatedVideos.length,
        successfulCount: successfulVideos.length,
        videoIds: videos.map(v => v.videoId),
        moderatedVideoIds: moderatedVideos.map(v => v.videoId),
        successfulVideoIds: successfulVideos.map(v => v.videoId)
      };
    } catch (error) {
      console.error('[Grok Storage] Parse error:', error);
      return null;
    }
  }, [parentImageId]);

  useEffect(() => {
    if (!parentImageId) {
      setData(null);
      return;
    }

    const checkInterval = setInterval(() => {
      const newData = parseGrokStorage();
      
      if (newData) {
        // Notify about new videos
        if (onVideoDetected || onModerationDetected) {
          newData.videos.forEach(video => {
            if (!seenVideoIds.current.has(video.videoId)) {
              seenVideoIds.current.add(video.videoId);
              
              onVideoDetected?.(video);
              
              if (video.moderated) {
                onModerationDetected?.(video);
              }
            }
          });
        }

        setData(newData);
      }
    }, pollInterval);

    return () => clearInterval(checkInterval);
  }, [parentImageId, pollInterval, parseGrokStorage, onVideoDetected, onModerationDetected]);

  // Clear seen videos when parent changes
  useEffect(() => {
    seenVideoIds.current.clear();
  }, [parentImageId]);

  return data;
}
```

### Phase 2: Integration Points

#### A. Moderation Detection Enhancement

**Update: `extension/src/content/App.tsx`**

```typescript
import { useGrokStorage } from '../hooks/useGrokStorage';

function App() {
  // ... existing code ...

  // Keep existing UI-based detection (primary, fast)
  useModerationDetector(currentPostId, handleModerationDetected, true);

  // Add Grok storage monitoring (validation + fallback)
  const grokData = useGrokStorage(currentPostId, {
    onModerationDetected: (video) => {
      console.log('[Grok Storage] Moderation validated:', {
        videoId: video.videoId,
        createTime: video.createTime,
        prompt: video.videoPrompt
      });
      
      // Validate or trigger moderation handling
      handleModerationDetected({ 
        videoId: video.videoId,
        source: 'grok-storage',
        metadata: {
          createTime: video.createTime,
          prompt: video.videoPrompt,
          thumbnailUrl: video.thumbnailImageUrl
        }
      });
    }
  });

  // ... rest of component ...
}
```

#### B. Storage Validation Layer

**Update: `extension/src/hooks/useSessionStorage.ts`**

Add validation function:

```typescript
import { useGrokStorage } from './useGrokStorage';

export function useSessionStorage(postId: string | null) {
  // ... existing implementation ...
  
  // Add Grok validation
  const grokData = useGrokStorage(data?.originalMediaId, {
    pollInterval: 500 // Less frequent for validation only
  });

  // Validate counts (log warnings if mismatch)
  useEffect(() => {
    if (!grokData || !data) return;

    // Validate videos generated
    if (data.videosGenerated !== grokData.videosGenerated) {
      console.warn('[Storage Validation] Video count mismatch:', {
        ours: data.videosGenerated,
        grok: grokData.videosGenerated,
        difference: grokData.videosGenerated - data.videosGenerated
      });
    }

    // Validate credits used
    if (data.creditsUsed !== grokData.creditsUsed) {
      console.warn('[Storage Validation] Credits count mismatch:', {
        ours: data.creditsUsed,
        grok: grokData.creditsUsed,
        difference: grokData.creditsUsed - data.creditsUsed
      });
    }

    // Validate video group
    const ourVideoSet = new Set(data.videoGroup);
    const grokVideoSet = new Set(grokData.videoIds);
    const missing = grokData.videoIds.filter(id => !ourVideoSet.has(id));
    
    if (missing.length > 0) {
      console.warn('[Storage Validation] Missing videos in our tracking:', missing);
    }
  }, [grokData, data]);

  // ... rest of implementation ...
}
```

#### C. Session Summary Enhancement

**Update: `extension/src/hooks/useSessionStorage.ts`**

Enhance session summary:

```typescript
interface SessionSummary {
  // ... existing fields ...
  
  // Enhanced with Grok data
  originalImagePrompt?: string;
  originalImageUrl?: string;
  successfulVideos?: number;
  videoThumbnails?: string[];
}

// In createSessionSummary or similar function:
const enhanceWithGrokData = (
  summary: SessionSummary,
  grokData: GrokStorageData | null
): SessionSummary => {
  if (!grokData) return summary;

  return {
    ...summary,
    originalImagePrompt: grokData.imageData?.originalPrompt,
    originalImageUrl: grokData.imageData?.mediaUrl,
    successfulVideos: grokData.successfulCount,
    videoThumbnails: grokData.videos
      .map(v => v.thumbnailImageUrl)
      .filter(Boolean)
  };
};
```

### Phase 3: Selective Migration (Optional)

After Phase 1-2 prove stable (1-2 weeks monitoring), consider deriving these values from Grok instead of manual tracking:

**Candidate Fields:**
```typescript
// Current: Manual tracking
videosGenerated: number;     // → Derive from grokData.videosGenerated
creditsUsed: number;         // → Derive from grokData.creditsUsed
videoGroup: string[];        // → Derive from grokData.videoIds

// Keep: Our retry logic
retryCount: number;          // Ours
isSessionActive: boolean;    // Ours
canRetry: boolean;           // Ours
lastAttemptTime: number;     // Ours
layer1/2/3Failures: number;  // Ours (moderation layer tracking)
```

**Implementation:**
```typescript
// Make certain fields computed properties:
interface SessionData {
  // ... other fields ...
  
  // Remove these from storage, make them getters:
  // videosGenerated: number;
  // creditsUsed: number;
  // videoGroup: string[];
}

// Add getters in useSessionStorage:
const computedData = useMemo(() => ({
  ...data,
  videosGenerated: grokData?.videosGenerated ?? data.videosGenerated ?? 0,
  creditsUsed: grokData?.creditsUsed ?? data.creditsUsed ?? 0,
  videoGroup: grokData?.videoIds ?? data.videoGroup ?? []
}), [data, grokData]);
```

---

## Testing Plan

### Phase 1: Core Hook Testing

- [ ] Create `useGrokStorage.ts` hook
- [ ] Test parsing Grok's storage structure
- [ ] Test with no data (empty storage)
- [ ] Test with malformed JSON (error handling)
- [ ] Test new video detection (deduplication)
- [ ] Test moderation detection callback
- [ ] Test parent ID changes (cleanup)
- [ ] Verify 250ms polling has no performance impact

### Phase 2: Integration Testing

- [ ] Integrate with moderation detection in App.tsx
- [ ] Test moderation validation (UI + Grok agree)
- [ ] Test moderation fallback (UI misses, Grok detects)
- [ ] Add validation logging in useSessionStorage
- [ ] Test with successful videos (no moderation)
- [ ] Test with moderated videos
- [ ] Test with multiple concurrent videos
- [ ] Verify counts match between our tracking and Grok's

### Phase 3: Enhancement Testing

- [ ] Test enhanced session summaries (image prompt, thumbnails)
- [ ] Test successful video tracking
- [ ] Test credits validation
- [ ] Monitor logs for 1-2 weeks
- [ ] Analyze discrepancy patterns

### Phase 4: Migration Testing (If Proceeding)

- [ ] Test derived videosGenerated
- [ ] Test derived creditsUsed
- [ ] Test derived videoGroup
- [ ] Test fallback when Grok data unavailable
- [ ] Test with existing sessions (backwards compatibility)

---

## Implementation Checklist

### Immediate (Phase 1 + 2)

- [ ] Create `extension/src/hooks/useGrokStorage.ts`
- [ ] Add TypeScript interfaces for Grok structures
- [ ] Implement polling logic with deduplication
- [ ] Add video detection callbacks
- [ ] Integrate with App.tsx for moderation validation
- [ ] Add validation logging to useSessionStorage
- [ ] Test with both moderated and successful videos
- [ ] Document behavior in code comments

### Short-term (After 1-2 weeks)

- [ ] Analyze validation logs for discrepancies
- [ ] Enhance session summaries with Grok metadata
- [ ] Add UI for showing successful videos (optional)
- [ ] Consider adding thumbnails to stats display

### Medium-term (If stable)

- [ ] Migrate videosGenerated to derived value
- [ ] Migrate creditsUsed to derived value
- [ ] Migrate videoGroup to derived value
- [ ] Update storage migration logic
- [ ] Comprehensive testing of migration

### Not Recommended

- ❌ Full storage restructure (per-parent instead of per-video keys)
- ❌ Remove manual tracking entirely (lose retry logic)
- ❌ Migrate all fields to Grok-derived values

---

## Risk Mitigation

### Risk: Grok Changes Storage Structure

**Mitigation:**
- Version checking: `if (store.version !== 1) { /* fallback */ }`
- Graceful degradation: All Grok integrations are optional enhancements
- Keep manual tracking: Our core functionality doesn't depend on Grok data
- Validation logging: Detect structure changes via parse errors

### Risk: Timing Issues

**Known:** Videos appear ONLY after completion (not during generation)

**Mitigation:**
- Use for post-completion validation only (not real-time detection)
- Keep UI-based detection as primary (faster)
- Document timing behavior clearly in code

### Risk: Performance Impact

**Concern:** 250ms polling could impact performance

**Mitigation:**
- Test with performance profiler
- Increase interval if needed (500ms still acceptable)
- Only parse when parent ID exists
- Cache parsed data, only update on changes
- Consider stopping polling when tab inactive

### Risk: Data Discrepancies

**Concern:** Our counts vs Grok's counts might not match

**Mitigation:**
- Extensive logging of discrepancies
- Validation warnings (not errors)
- Keep both values accessible for debugging
- Analyze patterns over 1-2 weeks before trusting Grok data

---

## Success Metrics

### Phase 1 Success Criteria

- ✅ Hook successfully parses Grok storage
- ✅ Video detection callbacks fire correctly
- ✅ No console errors from parsing
- ✅ Deduplication prevents duplicate callbacks
- ✅ No measurable performance impact

### Phase 2 Success Criteria

- ✅ Moderation validation confirms UI detection
- ✅ Validation logging shows counts match (or patterns make sense)
- ✅ Enhanced summaries include image prompts
- ✅ Successful videos tracked (new capability)
- ✅ No false positives or missed detections

### Phase 3 Success Criteria (If Proceeding)

- ✅ Derived counts match manual tracking 99%+ of time
- ✅ Discrepancies have clear patterns/explanations
- ✅ Storage size reduced (removed redundant fields)
- ✅ Backwards compatibility maintained
- ✅ All tests pass

---

## Status & Timeline

**Current Status:** 🟡 Ready to Implement

**Phase 1 (Core Hook):**
- Effort: 2-3 hours
- Timeline: Complete in 1 session
- Priority: High
- Risk: Low

**Phase 2 (Integration):**
- Effort: 3-4 hours
- Timeline: Complete within 1 week
- Priority: High
- Risk: Low

**Phase 3 (Migration):**
- Effort: 4-6 hours
- Timeline: After 1-2 weeks validation
- Priority: Medium
- Risk: Medium
- Decision Point: Evaluate based on Phase 2 results

---

## Conclusion

By unifying the moderation detection and storage validation efforts into a single `useGrokStorage` hook, we:

1. **Eliminate duplication** - One implementation serves both needs
2. **Improve reliability** - Validation layer catches discrepancies
3. **Enhance data richness** - Access to metadata we don't currently track
4. **Future-proof** - Fallback if UI structure changes
5. **Maintain independence** - Our core logic doesn't depend on Grok data

**Recommended Next Step:** Implement Phase 1 + 2 (core hook + integration) as a low-risk, high-value improvement.
