# Testing the Prompt Queue Feature

## Build Instructions

### Prerequisites
- Node.js v18+ installed
- npm installed
- Chrome browser

### Step 1: Clone and Navigate to Extension Directory
```bash
cd /path/to/grok-auto-retry/extension
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Build the Extension
```bash
npm run build
```

This will:
1. Run TypeScript compiler (`tsc`)
2. Run Vite build in content mode
3. Generate the `dist/` folder with all necessary files

**Note:** You may see 3 TypeScript errors related to `NodeJS.Timeout` namespace - these are pre-existing issues in the codebase and do not affect the build. The build will still complete successfully and generate the dist folder.

### Step 4: Load Unpacked Extension in Chrome

1. Open Chrome and navigate to: `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Navigate to and select: `/path/to/grok-auto-retry/extension/dist`
5. The extension should now appear in your extensions list

### Step 5: Test the Prompt Queue Feature

1. Navigate to: `https://grok.com/imagine/post/[any-post-id]`
2. The control panel should appear on the right side
3. Look for the new **"Prompt Queue"** section below "Prompt Partials"

## Testing the Feature

### Basic Queue Operations

**Add Prompts to Queue:**
1. In the "Prompt Queue" section, type a prompt in the textarea
2. (Optional) Click on Prompt Partials buttons to add preset text snippets
3. Click "Add to Queue" button
4. Repeat to add multiple prompts (e.g., 3 prompts for 3 videos)

**Edit a Prompt:**
1. Click the grip icon (≡) on any queued prompt
2. Modify the prompt text in the textarea
3. (Optional) Use Prompt Partials to add snippets
4. Click "Save" to confirm or "Cancel" to discard

**Remove a Prompt:**
1. Click the X icon on any queued prompt

**Reorder Prompts:**
1. Use ↑ and ↓ arrow buttons to move prompts up or down in the queue

### Test Sequential Video Generation

**Setup:**
1. Set "Video goal" to 3 (or match your queue size)
2. Add 3 different prompts to the queue
3. Enable "Auto-retry"
4. Set "Max retries" as desired

**Run:**
1. Click "Start Session"
2. System will use prompt #1 from the queue
3. When video #1 succeeds:
   - Progress shows "1/3 videos"
   - System automatically advances to prompt #2
   - Retry count resets to 0
   - "Current" badge moves to prompt #2
4. Process continues until all 3 videos are generated

**Expected Behavior:**
- Each prompt is marked with "Current" badge when active
- Retry count resets when moving to next prompt
- Queue is locked (disabled) during active session
- Session completes when videoGoal is reached

### Verify Storage

**Chrome DevTools:**
1. Open DevTools (F12)
2. Go to Application tab → Storage
3. Check **Local Storage** → `chrome-extension://[extension-id]`
4. Look for keys like `grokRetryPost_[postId]`
5. Verify `promptQueue` array is saved

## Troubleshooting

### Extension Doesn't Appear
- Make sure you selected the `dist` folder, not the `extension` folder
- Check the Extensions page for any errors
- Try disabling and re-enabling the extension

### Build Errors
- Run `npm install` again to ensure all dependencies are installed
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- The 3 NodeJS.Timeout errors are expected and won't prevent the build

### Prompt Queue Not Visible
- Refresh the Grok page after loading the extension
- Make sure you're on a `/imagine/post/*` route (not just `/imagine`)
- Check browser console for any JavaScript errors

### Queue Not Working
- Ensure auto-retry is enabled
- Verify video goal > 1
- Check that prompts are actually in the queue (should show count badge)

## Development Mode (Optional)

For live development with hot reload:

```bash
npm run watch
```

This will:
- Watch for file changes
- Auto-rebuild on changes
- You'll need to reload the extension in Chrome after each rebuild

## Additional Notes

- The extension requires the Grok.com website to function
- Prompts are saved per post ID
- Queue persists across page refreshes
- Queue can only be edited when no session is active
