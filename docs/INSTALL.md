# Chrome Extension Installation Guide

## Install Unpacked Extension

1. **Build the extension:**
   ```bash
   cd extension
   npm run build
   ```

2. **Open Chrome Extensions page:**
   - Navigate to `chrome://extensions/`
   - Or click the puzzle icon → "Manage Extensions"

3. **Enable Developer Mode:**
   - Toggle "Developer mode" switch in top-right corner

4. **Load the extension:**
   - Click "Load unpacked"
   - Select the `extension/dist` folder
   - The extension should now appear in your extensions list

5. **Verify installation:**
   - Navigate to <https://grok.com/imagine> or <https://grok.com/imagine/post/*>
   - You should see the control panel in the bottom-right corner

## Features

### Route-Specific Panels

The extension provides different functionality based on the current route:

**Image Generation Panel** (`/imagine` route):

- Lightweight prompt editor with saved prompts and partials
- "Generate Images" button copies prompt to site and clicks submit
- Prompt persists across page reloads
- No auto-retry or session management (single generation workflow)
- ProseMirror contenteditable support for site integration

**Video Generation Panel** (`/imagine/post/*` routes):

- Full auto-retry workflow with session management
- Video goal system for batch generation
- Real-time progress tracking and debug logs
- Per-post state isolation
- Textarea-based prompt capture

### Saved Prompts

- **Global Storage**: Saved prompts work across all routes and posts
- **Save Button**: Save current prompt with a custom name
- **Load Dropdown**: Alphabetically sorted list of saved prompts (click to load)
- **Management**: Rename or delete saved prompts via dialog
- **Form-based UI**: 480px wide dialog with improved textarea font size
- **Real-time Sync**: Changes automatically sync across all tabs
- **Persistent Storage**: Saved to Chrome storage, survives browser restarts

### Global Settings

Access via the gear icon in panel header. Opens a settings sheet with four tabs:

**Defaults Tab:**

- Default max retries (1-50, default: 3)
- Default video goal (1-50, default: 1)
- Enable auto-retry by default (toggle)
- Settings automatically apply to new video generation sessions

**Timing Tab:**

- Retry click cooldown (1-60 seconds, default: 8s)
- Video generation delay between successful videos (1-60 seconds, default: 8s)
- Rate limit wait time (30-300 seconds, default: 60s)
- Rapid failure threshold for warnings (1-30 seconds, default: 6s)

**UI Tab:**

- Default panel width (260-800px, default: 320px)
- Default panel height (100-800px, default: 400px)
- Start panel minimized (toggle)

**Advanced Tab:**

- Show rapid failure warning (toggle)
- Auto-switch to debug panel on session start (toggle)
- Custom CSS selectors for language/selector changes (advanced users)
  - Override selectors for: notification section, make video button, video element, prompt textarea
  - Requires page reload to apply changes
- Import/Export settings as JSON for backup/restore
- Reset all settings to defaults

**Features:**

- Number fields save on blur to prevent input wonkiness
- Live badges show current values
- Real-time save feedback with 2-second status messages
- All settings sync across your devices via Chrome sync storage

### Auto-Retry System

- Automatically detects "Content Moderated" messages and retries
- Detects "Rate limit reached" messages and waits 60 seconds before retrying
- Retries the request with your saved prompt
- 8-second cooldown between retry attempts
- Configurable max retries (1-50, default: 3)

### Video Goal System

- Set a goal for number of videos to generate (1-50)
- Automatically generates multiple videos with 8-second delays between successes
- Resets retry count for each new video
- Stops when goal is reached or max retries exceeded
- Progress shown in page title: 🎬 X/Y | 🔄 retries

### UI Controls

- **Enable/Disable**: Toggle auto-retry on/off
- **Session Indicator**: Green "ACTIVE" badge appears next to title when session is running
- **Debug Panel**: Toggle between normal controls and real-time session logs with severity colors
- **Minimize**: Collapse to draggable floating button (bottom-right corner)
- **Maximize**: Expand panel to fullscreen mode
- **Resize**: Drag top-left corner to resize panel (260-520px width, 100-800px height)
- **Reset**: Clear retry counter (shows when count > 0)
- **Copy from Site**: Capture the current prompt from the site's textarea
- **Prompt Partials**: Quick-add button to insert categorized prompt modifiers

### Prompt Partials

- Pre-configured prompt snippets organized by category:
  - **Style**: Cinematic, Photorealistic, Illustrated, Neon
  - **Lighting**: Golden Hour, Dramatic, Soft, High Contrast, Neon
  - **Mood**: Dramatic, Whimsical, Mysterious, Uplifting
  - **Framing**: Close-up, Wide Angle, Overhead
  - **Motion**: Slow Motion, Fast-paced, Smooth Panning
  - **Atmosphere**: Foggy/Misty, Clear Skies
- Each partial has a description tooltip explaining what it does
- Can belong to multiple categories (e.g., Neon in both Lighting and Style)
- Single-column layout, alphabetically sorted
- Appends to existing prompt without duplicates

### Prompt Management

- Use "Copy from Site" button to capture prompt before starting retries
- Edit prompt directly in extension panel
- Prompt is automatically restored to site's textarea before each retry
- Each post maintains its own independent prompt and retry state (isolated by post ID)

### Visual Indicators

- **Session Active Badge**: Green pulsing "ACTIVE" badge next to panel title during sessions
- **Dynamic Retry Badge**: Shows current retry count with color-coded progress
  - Green background when 0-49% of max retries used
  - Orange background when 50-79% used
  - Red background when 80%+ used
- **Video Progress Badge**: Shows videos generated with color-coded status
  - Gray (secondary) when no videos generated
  - Orange when in progress (1 to goal-1)
  - Green when goal reached
- **Rapid Failure Warning**: Alert icon appears when moderation occurs within 6 seconds
  - Indicates immediate moderation (likely automated content check on prompt or image)
  - Automatically clears when you edit the prompt
  - Suggests trying a different prompt, image, or approach
- **Page Title Status**:
  - ✅ X/Y Complete = Video goal reached successfully
  - 🎬 X/Y = Video progress (when goal > 1)
  - 🔄 = Active retrying
  - ❌ = Max retries reached
  - ⏳ = Rate limited (waiting 60s)

### Debug Logging

- **Automatic Panel Switching**: Debug panel automatically activates when sessions start, returns to normal view when sessions end
- **Real-time Session Logs**: Live updates of all session activity with timestamps
- **Color-coded Severity Levels**:
  - **INFO** (gray): General information (button clicks, prompt restoration)
  - **WARN** (yellow): Warnings (moderation detection, rapid failures)
  - **ERROR** (red): Errors and failures
  - **SUCCESS** (green): Successful video generation and completions
- **Fullscreen Debug Mode**: In fullscreen + debug view, shows color-coded retry/video badges beside session logs
- **Copy Logs**: Export all session logs to clipboard for analysis
- **Manual Toggle**: Debug button (bug icon) allows manual switching between views
- **Smart Deduplication**: Prevents duplicate moderation logs from DOM re-renders

### Settings Persistence

**Per-Post State (Hybrid Storage):**

Persistent Data (survives tab closure):

- Max retries setting
- Video goal setting
- Auto-retry enabled/disabled state
- Current prompt value

Session Data (resets when tab closes):

- Retry count
- Videos generated count
- Active session status
- Last attempt timestamp
- Session logs with real-time updates

Storage Details:

- State is isolated by post ID from URL (e.g., `/imagine/post/7f831f9c-...`)
- Persistent preferences are saved to Chrome storage
- Session state uses browser sessionStorage (cleared on tab close)
- Opening the same post in multiple tabs shares both persistent and session state
- Different posts maintain completely independent state
- Reopening a closed tab restores your preferences and prompt, but starts fresh session counters
- **Interrupted Session Handling**: If you refresh the page during an active session, it will automatically cancel the interrupted session to prevent stuck states. You can click "Start Session" to start a new session.

**Global UI Preferences (Chrome Storage):**

- Panel size and position
- Minimize state
- Maximize state
- Preferences shared across all tabs and posts

## Development

### Watch mode for live changes

```bash
npm run dev
```

### After making changes

1. Run `npm run build`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Grok Auto Retry extension
4. Reload <https://grok.com>

## Troubleshooting

### Extension not appearing on grok.com

- Check that extension is enabled in `chrome://extensions/`
- Verify the match pattern in `manifest.json` includes grok.com
- Extension appears on `/imagine` (image generation) and `/imagine/post/*` (video generation) routes
- Not available on auth.grok.com or other routes
- Hard refresh the page (Cmd+Shift+R or Ctrl+Shift+F5)

### Auto-retry not working

- Ensure "Enable Auto-Retry" is toggled ON
- Check that you haven't reached max retries
- Verify retry counter shows in the badge
- Make sure you've captured the prompt using "Copy from Site" button
- Check browser console for "[Grok Retry]" logs

### Rapid failure warning appearing

- Warning appears when moderation occurs within 6 seconds of generation attempt
- Indicates immediate automated content check (could be prompt text, image OCR, or both)
- Try rephrasing your prompt, using a different image, or changing your approach
- Warning automatically clears when you edit the prompt
- Rapid failures are unlikely to succeed with continued retries on the same content

### Video goal not working

- Ensure auto-retry is enabled
- Video goal only activates when > 1
- After each successful video, system waits 8 seconds before next generation
- Retry count resets for each new video in the goal
- Session ends when goal reached or max retries exceeded

### Prompt not restoring between retries

- Use the "Copy from Site" button to capture your prompt before submitting
- The prompt must be captured to prevent the site from reverting to the last successful prompt
- Check that your prompt appears in the extension's textarea
- Auto-capture is disabled to prevent conflicts with site updates

### Panel won't resize/drag

- Make sure you're dragging the top-left corner grip handle for resize
- Resize handle hidden when panel is maximized
- Mini toggle can be dragged anywhere on screen (5px movement threshold to distinguish from clicks)
- Position and size save automatically to Chrome storage

### Maximize not working

- Click the maximize button in panel header (next to minimize)
- Panel will expand to fullscreen (100vw × 100vh)
- Click restore button (same position) to return to normal size
- Maximize state persists across page loads

### Debug logs not showing

- Debug panel automatically activates when sessions start
- Click the bug icon in panel header to manually toggle debug view
- Logs appear in real-time during active sessions
- Session logs are cleared when new sessions start for the same post
- Check that you're on the correct post (logs are isolated per post ID)
- In fullscreen debug mode, retry/video progress badges appear beside "Session Logs" header
- **Note**: Debug toggle only appears on video generation routes (`/imagine/post/*`)

### Saved prompts not loading

- Click directly on the prompt name in the Load dropdown
- Prompts are sorted alphabetically for easy finding
- If prompt flashes then disappears, try reloading the extension
- Check Chrome storage quota (unlikely but possible if many prompts saved)
- Saved prompts sync in real-time across all tabs

### Image generation panel not working

- Ensure you're on the `/imagine` route (not `/imagine/post/*`)
- "Generate Images" button copies prompt to ProseMirror editor then clicks submit
- Prompt automatically saves to storage every 300ms while typing
- Prompt persists across page reloads
- Panel does not include retry functionality (single generation workflow)

### Font sizes too small/large

- Base font sizes scale 20% larger when panel is maximized (minimum 14px)
- Textarea font changes from text-xs to text-sm when maximized
- Saved prompts dialog uses larger textarea font (text-sm) and wider form (480px)
- Return to normal size mode if text is too large

## Uninstall

1. Go to `chrome://extensions/`
2. Find "Grok Auto Retry"
3. Click "Remove"
4. Confirm removal
