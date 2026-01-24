# Prompt Queue Feature

## Overview
The prompt queue feature allows users to create a queue of different prompts that will be used sequentially when generating multiple videos (videoGoal > 1). Instead of using the same prompt for all videos, each successful video generation will advance to the next prompt in the queue.

## How It Works

### Basic Flow
1. User sets video goal to > 1 (e.g., 3 videos)
2. User adds multiple prompts to the queue (e.g., 3 different prompts)
3. User starts session
4. System uses prompt #1 and retries until success
5. When video #1 succeeds, system moves to prompt #2 and resets retry count
6. Process continues until all videos are generated or session ends

### Key Behaviors
- **Current Prompt**: The prompt used for the current video attempt is determined by `getCurrentPrompt()`, which returns the prompt at `currentPromptIndex` from the queue, or falls back to `lastPromptValue` if the queue is empty
- **Retry Count Reset**: When advancing to the next prompt, the retry count is reset to 0, giving each prompt a full allocation of retries
- **Queue Management**: Queue can be edited before session starts but is locked during an active session
- **Prompt Partials**: Users can use preset text snippets (Style, Lighting, Mood, etc.) when building prompts for the queue

## UI Components

### PromptQueue Component
Located in: `extension/src/components/PromptQueue.tsx`

Features:
- **Add Prompts**: Textarea + "Add to Queue" button
- **Edit Prompts**: Click grip icon to edit, with Save/Cancel buttons
- **Remove Prompts**: Click X icon to remove from queue
- **Reorder Prompts**: Arrow up/down buttons to move prompts
- **Current Indicator**: "Current" badge shows which prompt is active
- **Prompt Partials Integration**: Full access to preset text snippets when creating/editing prompts

### Visual Indicators
- Queue shows total count: "3 prompts"
- Current prompt highlighted with primary border during active session
- Current badge displayed on active prompt
- Disabled state during session (no editing allowed)

## Storage Structure

### Persistent Data (chrome.storage.local)
```typescript
promptQueue: string[]  // Array of complete prompts
```

### Session Data (sessionStorage)
```typescript
currentPromptIndex: number  // Index of current prompt (0-based)
```

## API Methods (useGrokRetry)

### Queue Management
- `setPromptQueue(queue: string[])` - Replace entire queue
- `addToPromptQueue(prompt: string)` - Append prompt to queue
- `removeFromPromptQueue(index: number)` - Remove prompt at index
- `updatePromptInQueue(index: number, prompt: string)` - Update prompt at index
- `movePromptInQueue(fromIndex: number, toIndex: number)` - Reorder prompts
- `getCurrentPrompt(): string` - Get the current prompt to use

### Integration Points
1. **startSession()**: Resets currentPromptIndex to 0
2. **incrementVideosGenerated()**: 
   - Increments videosGenerated
   - If queue is not empty and more videos remain, advances currentPromptIndex
   - Resets retryCount to 0 for the new prompt
3. **handleSuccess()** in App.tsx: Uses `getCurrentPrompt()` for next video generation

## Example Usage

### Scenario: Generate 3 Videos with Different Prompts
```
Video Goal: 3
Prompt Queue:
  1. "A sunny day at the beach with waves"
  2. "A mountain landscape with snow peaks"
  3. "A forest path in autumn colors"

Session Flow:
- Start: Use prompt #1, retries 0/10
- Moderation: retry with prompt #1, retries 1/10
- Success: Video 1 complete, advance to prompt #2, retries 0/10
- Success: Video 2 complete, advance to prompt #3, retries 0/10
- Moderation: retry with prompt #3, retries 1/10
- Success: Video 3 complete, session ends
```

## Testing
Tests are located in: `extension/tests/unit/promptQueue.spec.ts`

Coverage includes:
- Queue initialization
- Adding prompts to queue
- Tracking current prompt index
- Persistence to chrome storage
- Index reset on session start

## Future Enhancements (Not Implemented)
- Import/export queue from file
- Save/load named queue presets
- Shuffle queue order
- Auto-populate queue from prompt history
- Validation for minimum queue size based on video goal
