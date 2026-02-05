# Stream-Based Detection - Research & Implementation Plan

## Executive Summary

**Goal:** Improve moderation detection reliability by adding sessionStorage monitoring as a validation layer.

**Finding:** Chrome Manifest V3 content scripts cannot intercept page-level `window.fetch` calls due to world isolation. Stream-based detection is not possible without complex script injection. However, Grok stores video metadata in `sessionStorage`, which is accessible to content scripts.

**Recommendation:** Hybrid approach - Keep fast UI-based detection as primary, add sessionStorage monitoring as secondary validation layer.

---

## Problem: Stream Detection Not Possible

Chrome Manifest V3 extensions run content scripts in an **ISOLATED world** that cannot intercept the page's `window.fetch` calls (which run in the **MAIN world**). The `grokStream.ts` fetch interceptor is non-functional for this reason.

**Alternative approaches investigated:**
- ❌ chrome.webRequest API - No response body access in Manifest V3
- ❌ Dual-world architecture - Requires script injection, too complex
- ✅ sessionStorage monitoring - Simple, accessible, reliable

---

## Solution: sessionStorage Monitoring

### Discovery

Grok stores all video generation state in `sessionStorage['useMediaStore']`:

```javascript
sessionStorage['useMediaStore'] = {
  state: {
    videoByMediaId: {
      "[parentImageId]": [{
        videoId: "1b08a801-4145-4071-b375-f76ed648cc04",
        progress: 100,
        moderated: false,  // ← Moderation flag
        mode: "normal",
        mediaUrl: "https://...",  // Empty when moderated
        createTime: "2026-02-05T15:51:22Z",
        parentPostId: "[parentImageId]",
        videoDuration: 6,
        videoPrompt: ""
      }]
    }
  }
}
```

### Testing Results (Feb 5, 2026)

Controlled test on fresh image `b1da93e6-3457-4431-b2de-35c78f19c823`:

| Timeline | sessionStorage State | UI State |
|----------|---------------------|----------|
| **Baseline** | Parent key doesn't exist | No generation |
| **During (0-24s)** | Parent array exists but EMPTY `[]` | Progress: 3% → 37% |
| **After completion** | Video object appears with full metadata | ✅ Complete |

**Key Finding:** Videos appear in sessionStorage **ONLY AFTER completion**, not during generation. This applies to both moderated and successful videos.

### Implications

❌ **No speed advantage** - sessionStorage updates at same time as UI  
❌ **Cannot detect during generation** - Storage empty while generating  
⚠️ **May be slower** - DOM observers can detect moderation UI instantly  
✅ **Rich metadata** - Full video details (ID, URL, timestamps)  
✅ **Reliable validation** - Grok's own authoritative data  
✅ **Simple implementation** - Just poll sessionStorage, no build changes

---

## Recommended Implementation: Hybrid Approach

### Strategy

1. **Primary: UI-based detection** ✅ Already working
   - Fast: Sub-second detection of moderation UI elements
   - Proven: Currently in production
   - Reliable: Directly observes user-visible state

2. **Secondary: sessionStorage monitoring** 🆕 To be added
   - Validation: Confirm UI detection with Grok's data
   - Metadata: Extract videoId, timestamps, URLs
   - Fallback: Detect if UI structure changes

3. **Benefits**
   - ✅ Speed of UI detection
   - ✅ Reliability of official data
   - ✅ Rich metadata for debugging
   - ✅ Future-proof against UI changes

### Implementation Code

**Create: `extension/src/hooks/useSessionStorageMonitor.ts`**

```typescript
import { useEffect, useRef } from 'react';

interface VideoMetadata {
  videoId: string;
  moderated: boolean;
  progress: number;
  mediaUrl: string;
  createTime: string;
}

export function useSessionStorageMonitor(
  currentParentId: string | null,
  onVideoDetected: (video: VideoMetadata) => void
) {
  const seenVideoIds = useRef(new Set<string>());

  useEffect(() => {
    if (!currentParentId) return;

    const checkInterval = setInterval(() => {
      try {
        const storeData = sessionStorage.getItem('useMediaStore');
        if (!storeData) return;

        const store = JSON.parse(storeData);
        const videos = store.state?.videoByMediaId?.[currentParentId] || [];

        videos.forEach(video => {
          // Skip null/undefined entries
          if (!video?.videoId) return;
          
          // Skip already-seen videos
          if (seenVideoIds.current.has(video.videoId)) return;
          
          seenVideoIds.current.add(video.videoId);
          onVideoDetected({
            videoId: video.videoId,
            moderated: video.moderated,
            progress: video.progress,
            mediaUrl: video.mediaUrl || '',
            createTime: video.createTime
          });
        });
      } catch (error) {
        console.error('[SessionStorage Monitor] Error:', error);
      }
    }, 250); // Poll every 250ms

    return () => clearInterval(checkInterval);
  }, [currentParentId, onVideoDetected]);

  // Clear seen videos when parent changes
  useEffect(() => {
    seenVideoIds.current.clear();
  }, [currentParentId]);
}
```

**Update: `extension/src/content/App.tsx`**

```typescript
import { useSessionStorageMonitor } from '../hooks/useSessionStorageMonitor';

function App() {
  // ... existing code ...

  // Keep existing UI-based detection (primary, fast)
  useModerationDetector(currentPostId, handleModerationDetected, true);

  // Add sessionStorage monitor (secondary, validation)
  useSessionStorageMonitor(currentPostId, (video) => {
    console.log('[SessionStorage] Video detected:', video);
    
    if (video.moderated) {
      // Validate moderation detection or trigger if UI missed it
      handleModerationDetected({ 
        videoId: video.videoId,
        source: 'sessionStorage' 
      });
    }
    
    // Could also track successful completions for stats
  });

  // ... rest of component ...
}
```

### Testing Checklist

- [ ] Create `useSessionStorageMonitor.ts` hook
- [ ] Integrate with `App.tsx` alongside existing detection
- [ ] Test with successful video (verify metadata extraction)
- [ ] Test with moderated video (verify validation)
- [ ] Test with multiple concurrent videos
- [ ] Verify deduplication works (no duplicate callbacks)
- [ ] Test error handling for malformed JSON
- [ ] Verify no performance impact from 250ms polling
- [ ] Test parent ID transitions (verify cleanup)

---

## Status & Next Steps

**Research:** ✅ Complete  
**Documentation:** ✅ Complete  
**Implementation:** 🟡 Ready to start  
**Priority:** Medium (improves reliability, not urgent)  
**Estimated Effort:** 2-3 hours

**Next Steps:**
1. Create `useSessionStorageMonitor.ts` hook
2. Integrate with `App.tsx`
3. Test with both moderated and successful videos
4. Optionally: Remove non-functional `grokStream.ts` code

**Alternative Decision:**
If current UI-based detection is sufficient, could skip sessionStorage monitoring entirely. The validation layer is nice-to-have, not critical.
