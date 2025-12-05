# Grok Auto Retry Extension

A TypeScript-based Chrome extension that automatically retries video generation on Grok.com when content moderation occurs.

## Features

- ✅ Auto-retry on content moderation with configurable max retries
- 🎬 Video goal system - automatically generate multiple videos with 8-second delays
- 📝 Prompt preservation and quick-add prompt partials with categories
- 🔄 Real-time progress in browser tab title with completion status
- 🎨 Resizable, draggable UI panel with fullscreen maximize mode
- 📊 Dynamic progress badges with color-coded status
- 🐛 Debug panel with real-time session logs and color-coded severity levels
- ⚠️ Rapid failure detection warns of immediate automated content checks
- 💚 Visual session indicator with pulsing active badge
- 🔒 Hybrid storage - persistent preferences, session-aware state
- 📦 Built with TypeScript and React for type safety and modern UI

## Development

### Prerequisites

- Node.js (v18+)
- npm
- Chrome browser

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

```text
grok-retry-script/
├── extension/
│   ├── src/
│   │   ├── components/      # React UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── config/          # Configuration (prompt partials, etc.)
│   │   ├── lib/             # Utility functions
│   │   └── content/         # Content script entry point
│   ├── dist/                # Built extension
│   ├── public/              # Static assets and manifest
│   └── vite.config.ts       # Vite build configuration
└── package.json             # Project metadata and scripts
```

### Build Process

1. **Vite Build**: Compiles TypeScript and React components
2. **Content Script**: Bundles into `dist/content.js` for Chrome extension
3. **Assets**: Copies manifest and static files to `dist/`
4. **Output**: `dist/` folder ready to load as unpacked extension

### Installation

See [docs/INSTALL.md](docs/INSTALL.md) for detailed installation instructions.

## Usage

1. Enable auto-retry using the toggle switch
2. Set max retries (1-50) and video goal (1-50)
3. Click "Copy from site" to capture the current prompt or type your own
4. Use prompt partials to quickly add common modifiers (Style, Lighting, Mood, etc.)
5. Click "Generate Video" to start - the system will automatically retry on moderation
6. Monitor progress in the browser tab title, dynamic status badges, and real-time debug logs

### Controls

- **Minimize**: Collapse panel to a draggable button (bottom-right)
- **Maximize**: Expand panel to fullscreen
- **Debug Toggle**: Switch between normal view and real-time session logs
- **Reset count**: Reset retry counter to 0
- **+/-**: Adjust max retries and video goal
- **Prompt Partials**: Quick-add categorized prompt modifiers with descriptions

## Contributing

### Type Safety

The codebase uses TypeScript with strict mode enabled:

- All components are typed with React.FC
- Custom hooks with explicit return types
- Type-safe prop interfaces
- Shadcn UI components for consistent UX

### Making Changes

1. Edit files in `extension/src/`
2. Run `npm run watch` for automatic rebuilds
3. Reload the extension in Chrome (`chrome://extensions/`)
4. Refresh the page to see changes
5. Check browser console for `[Grok Retry]` logs

### Adding New Features

```typescript
// Example: Add a new React component
import React from 'react';
import { Button } from '@/components/ui/button';

interface MyFeatureProps {
  onAction: () => void;
}

export const MyFeature: React.FC<MyFeatureProps> = ({ onAction }) => {
  return (
    <Button onClick={onAction}>
      My Feature
    </Button>
  );
};
```

## Configuration

### Prompt Partials

Add custom prompt snippets in `extension/src/config/promptPartials.ts`:

```typescript
export const promptPartials: PromptPartial[] = [
  {
    id: 'my-partial',
    label: 'My Style',
    description: 'Adds my custom style modifiers',
    content: 'your custom prompt text. ',
    categories: ['Style'],
    position: 'append'
  }
];
```

### Constants

Edit detection and timing in `extension/src/hooks/`:

- `useModerationDetector.ts` - Moderation text patterns
- `useSuccessDetector.ts` - Success detection logic
- `App.tsx` - 8-second delay between video generations

## Scripts

```bash
cd extension
npm install           # Install dependencies
npm run build         # Production build
npm run watch         # Watch mode for development
npm run dev           # Development server (Vite HMR)
```

## License

ISC
