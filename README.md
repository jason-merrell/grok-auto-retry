# Grok Auto Retry Userscript

A TypeScript-based Tampermonkey userscript that automatically retries video generation on Grok.com when content moderation occurs.

## Features

- ✅ Auto-retry on content moderation with configurable max retries
- 📝 Prompt preservation and manual sync
- ⏸️ Pause/Resume functionality
- 🔄 Real-time progress in browser tab title
- 🎨 Resizable, draggable UI panel
- 📦 Built with TypeScript for type safety

## Development

### Prerequisites

- Node.js (v18+)
- npm
- Tampermonkey browser extension

### Setup

```bash
# Install dependencies
npm install

# Build the userscript
npm run build

# Watch for changes during development
npm run watch
```

### Project Structure

```
grok-retry-script/
├── src/
│   └── index.ts          # Main TypeScript source
├── dist/
│   └── index.js          # Compiled userscript (ready for Tampermonkey)
├── build.js              # Build script that adds userscript header
├── tsconfig.json         # TypeScript configuration
└── package.json          # Project metadata and scripts
```

### Build Process

1. **TypeScript Compilation**: `tsc` compiles `src/index.ts` to `dist/index.js`
2. **Header Injection**: `build.js` prepends the Tampermonkey metadata header
3. **Output**: `dist/index.js` is ready to install in Tampermonkey

### Installation

1. Build the project: `npm run build`
2. Open Tampermonkey dashboard
3. Create a new script or import `dist/index.js`
4. Navigate to https://grok.com/* to see the control panel

## Usage

1. Enable auto-retry using the checkbox
2. Click "Copy from site" to capture the current prompt or type your own
3. Set max retries (1-50)
4. The script will automatically retry when moderation occurs
5. Monitor progress in the browser tab title

### Controls

- **Pause/Resume**: Temporarily stop auto-retry
- **Minimize**: Collapse panel to a draggable "+" button
- **Reset count**: Reset retry counter to 0
- **+/-**: Adjust max retries

## TypeScript Development

### Type Safety

The codebase uses TypeScript with strict mode enabled:

- All variables are explicitly typed
- Null safety checks on DOM elements
- Type-safe event handlers
- HTMLElement type assertions for DOM queries

### Making Changes

1. Edit `src/index.ts`
2. Run `npm run watch` for automatic rebuilds
3. Refresh the page in your browser to reload the script
4. Check browser console for `[Grok-Moderation-Retry]` logs

### Adding New Features

```typescript
// Example: Add a new button to the UI panel
const myButton = document.createElement("button");
myButton.textContent = "My Feature";
myButton.addEventListener("click", () => {
  log("Button clicked!");
});
contentWrapper?.appendChild(myButton);
```

## Configuration

Edit constants in `src/index.ts`:

```typescript
const MODERATION_TEXT = "Content Moderated. Try a different idea.";
const BUTTON_SELECTOR = 'button[aria-label="Make video"]';
const TEXTAREA_SELECTOR = 'textarea[aria-label="Make a video"]';
const CLICK_COOLDOWN = 8000; // ms between retries
const DEFAULT_MAX_RETRIES = 3;
```

## Scripts

- `npm run build` - Compile TypeScript and add userscript header
- `npm run watch` - Watch mode for development (auto-rebuild on changes)
- `npm run dev` - Same as watch

## License

ISC
