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
   - Navigate to https://grok.com
   - You should see the Grok Auto Retry panel in the bottom-right corner

## Features

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

- **Dynamic Retry Badge**: Shows current retry count with color-coded progress
  - Green background when 0-49% of max retries used
  - Orange background when 50-79% used
  - Red background when 80%+ used
- **Video Progress Badge**: Shows videos generated with color-coded status
  - Gray (secondary) when no videos generated
  - Orange when in progress (1 to goal-1)
  - Green when goal reached
- **Page Title Status**:
  - 🎬 X/Y = Video progress (when goal > 1)
  - 🔄 = Active retrying
  - ❌ = Max retries reached
  - ⏳ = Rate limited (waiting 60s)

### Settings Persistence

**Per-Post State (Session Storage):**

- Max retries setting
- Video goal setting
- Auto-retry enabled/disabled state
- Current prompt value
- Retry count
- Videos generated count
- State is isolated by post ID from URL (e.g., `/imagine/post/7f831f9c-...`)
- Opening the same post in multiple tabs shares state
- Different posts maintain completely independent state

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
- Extension only appears on `/imagine/post/*` routes (not auth.grok.com)
- Hard refresh the page (Cmd+Shift+R or Ctrl+Shift+F5)

### Auto-retry not working

- Ensure "Enable Auto-Retry" is toggled ON
- Check that you haven't reached max retries
- Verify retry counter shows in the badge
- Make sure you've captured the prompt using "Copy from Site" button
- Check browser console for "[Grok Retry]" logs

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

## Uninstall

1. Go to `chrome://extensions/`
2. Find "Grok Auto Retry"
3. Click "Remove"
4. Confirm removal
