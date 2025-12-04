# Chrome Extension Migration Plan

## Overview
Convert the Grok Auto Retry userscript into a modern Chrome extension using React, TypeScript, Tailwind CSS, and Shadcn UI components.

## Current Functionality to Preserve
- ✅ Auto-retry on content moderation detection
- ✅ Configurable max retries (1-50, default 3)
- ✅ Pause/Resume functionality
- ✅ Prompt preservation and manual sync
- ✅ Browser tab title progress indicators (🔄/⏸️/❌)
- ✅ Resizable, draggable UI panel
- ✅ Minimize to floating toggle button
- ✅ 8-second cooldown between retries
- ✅ Retry counter and progress display
- ✅ DOM persistence protection
- ✅ User-only click detection (e.isTrusted)

## Tech Stack
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/ui
- **Manifest**: Chrome Extension Manifest V3
- **Isolation**: Shadow DOM
- **State**: React hooks (useState, useEffect, useCallback)

---

## Phase 1: Project Scaffolding ✨
**Goal**: Set up basic Chrome extension structure with React + Vite

### Tasks:
- [ ] Create new extension project structure
- [ ] Install dependencies (React, TypeScript, Vite, Tailwind)
- [ ] Configure Vite for Chrome extension builds
- [ ] Create manifest.json (v3)
- [ ] Set up Tailwind CSS with PostCSS
- [ ] Configure TypeScript for extension development
- [ ] Create basic folder structure

### File Structure:
```
grok-retry-extension/
├── public/
│   ├── manifest.json
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── src/
│   ├── content/
│   │   ├── index.tsx          # Content script entry
│   │   └── App.tsx             # Main React component
│   ├── components/
│   │   └── ui/                 # Shadcn components
│   ├── lib/
│   │   └── utils.ts            # Utilities
│   ├── hooks/
│   │   └── useGrokRetry.ts     # Core logic hook
│   └── styles/
│       └── globals.css         # Tailwind imports
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### Deliverables:
- Working Chrome extension that can be loaded
- React renders inside Shadow DOM
- Tailwind styles working

---

## Phase 2: Shadcn UI Setup 🎨
**Goal**: Install and configure Shadcn components

### Tasks:
- [ ] Initialize Shadcn/ui
- [ ] Install required components:
  - Button
  - Input
  - Textarea
  - Card
  - Label
  - Switch (for checkbox)
  - Badge (for retry counter)
  - Tooltip
- [ ] Configure components for Shadow DOM compatibility
- [ ] Create theme variables (dark theme for panel)
- [ ] Test component rendering

### Components Needed:
```tsx
- Button (Pause, Reset, Minimize, Copy, +/-)
- Input (number input for max retries)
- Textarea (prompt input)
- Card (panel container)
- Label (form labels)
- Switch (enable auto-retry)
- Badge (retry counter display)
- Tooltip (hover hints)
```

### Deliverables:
- All Shadcn components installed
- Components render correctly in Shadow DOM
- Custom theme applied

---

## Phase 3: Core State Management 🧠
**Goal**: Implement React hooks for all userscript state

### Tasks:
- [ ] Create `useGrokRetry` hook with all state:
  - `retryCount`, `maxRetries`, `autoRetryEnabled`
  - `isPaused`, `isMinimized`, `lastPromptValue`
  - `originalPageTitle`, `lastCaptureTime`
- [ ] Create `usePanelResize` hook for resize logic
- [ ] Create `useMiniToggleDrag` hook for dragging
- [ ] Create `useModerationDetector` hook for DOM observation
- [ ] Add chrome.storage.local for persistence
- [ ] Implement state synchronization

### Custom Hooks:
```typescript
useGrokRetry()        // Core retry logic & state
usePanelResize()      // Panel resize functionality
useMiniToggleDrag()   // Mini toggle drag logic
useModerationDetector() // MutationObserver for moderation text
usePageTitle()        // Tab title updates
usePromptCapture()    // Prompt value capture
```

### Deliverables:
- All state managed with React hooks
- State persists via chrome.storage
- Clean separation of concerns

---

## Phase 4: UI Components 🎭
**Goal**: Build all React components

### Tasks:
- [ ] **ControlPanel** component (main panel)
- [ ] **PanelHeader** component (title, pause, minimize)
- [ ] **RetryControls** component (checkbox, prompt textarea)
- [ ] **RetryStats** component (retries used display)
- [ ] **MaxRetriesControls** component (+/- buttons, input)
- [ ] **PromptTextarea** component (with copy button)
- [ ] **MiniToggle** component (floating + button)
- [ ] **ResizeHandle** component (top-left drag handle)
- [ ] Implement responsive sizing
- [ ] Add animations/transitions

### Component Hierarchy:
```
<App>
  {isMinimized ? (
    <MiniToggle />
  ) : (
    <ControlPanel>
      <ResizeHandle />
      <PanelHeader />
      <RetryControls />
      <RetryStats />
      <MaxRetriesControls />
    </ControlPanel>
  )}
</App>
```

### Deliverables:
- All UI components built with Shadcn
- Clean component structure
- Props properly typed

---

## Phase 5: Core Retry Logic 🔄
**Goal**: Port all retry functionality

### Tasks:
- [ ] Implement moderation text detection
- [ ] Implement button click with cooldown (8s)
- [ ] Implement prompt value setting (React-style)
- [ ] Implement retry counter logic
- [ ] Implement max retries enforcement
- [ ] Implement pause/resume functionality
- [ ] Add user-only click capture (e.isTrusted)
- [ ] Add prompt sync from site textarea
- [ ] Implement page title updates

### Core Functions to Port:
```typescript
findModerationTextPresent()
clickMakeVideoButton()
capturePromptValue()
copyPromptFromSite()
updatePageTitle()
checkAndAct()
```

### Deliverables:
- All retry logic working
- Button clicks automated correctly
- Prompt preservation functional

---

## Phase 6: Panel Interactions 🎯
**Goal**: Implement resize, drag, minimize

### Tasks:
- [ ] Panel resize from top-left handle
- [ ] Bottom-right anchored positioning
- [ ] Font scaling based on width
- [ ] Mini toggle drag functionality
- [ ] Minimize/restore transitions
- [ ] Panel position persistence
- [ ] Prevent panel removal from DOM
- [ ] Click vs drag detection on mini toggle

### Features:
- Resize: min 260px, max 520px width
- Resize: min 100px, max 400px height
- Font: scales from 11px to 16px
- Mini toggle: draggable anywhere on screen

### Deliverables:
- Smooth resize functionality
- Working drag and minimize
- Persisted UI state

---

## Phase 7: Shadow DOM Integration 🌓
**Goal**: Ensure complete style isolation

### Tasks:
- [ ] Mount React app in Shadow DOM
- [ ] Inject Tailwind styles into Shadow DOM
- [ ] Test all Shadcn components in Shadow DOM
- [ ] Ensure no style leakage to/from page
- [ ] Handle font inheritance
- [ ] Fix any Shadow DOM quirks

### Shadow DOM Setup:
```typescript
const container = document.createElement('div');
container.id = 'grok-retry-root';
document.body.appendChild(container);

const shadowRoot = container.attachShadow({ mode: 'open' });
const reactRoot = document.createElement('div');
shadowRoot.appendChild(reactRoot);

// Inject styles
const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(tailwindCSS);
shadowRoot.adoptedStyleSheets = [styleSheet];

// Render React
ReactDOM.createRoot(reactRoot).render(<App />);
```

### Deliverables:
- Complete style isolation
- No conflicts with Grok site
- All features work in Shadow DOM

---

## Phase 8: Chrome Extension APIs 🔌
**Goal**: Leverage Chrome APIs for better UX

### Tasks:
- [ ] Use chrome.storage.sync for settings
- [ ] Add chrome.runtime messaging if needed
- [ ] Handle extension lifecycle events
- [ ] Add error reporting/logging
- [ ] Implement extension icon badge (retry count)
- [ ] Add keyboard shortcuts (optional)

### Storage Schema:
```typescript
interface StorageData {
  maxRetries: number;
  autoRetryEnabled: boolean;
  lastPromptValue: string;
  panelWidth: number;
  panelHeight: number;
  miniTogglePosition?: { x: number; y: number };
}
```

### Deliverables:
- Settings persist across sessions
- Extension badge shows status
- Proper error handling

---

## Phase 9: Testing & Polish 🧪
**Goal**: Ensure everything works perfectly

### Tasks:
- [ ] Test all retry scenarios
- [ ] Test pause/resume
- [ ] Test minimize/restore
- [ ] Test resize and drag
- [ ] Test prompt capture and sync
- [ ] Test edge cases (button not found, etc.)
- [ ] Performance optimization
- [ ] Add loading states
- [ ] Improve error messages
- [ ] Add tooltips for all controls

### Test Scenarios:
1. Enable auto-retry → trigger moderation → verify retry
2. Pause during retry → resume → verify continues
3. Minimize panel → drag toggle → restore
4. Resize panel → refresh page → verify size persisted
5. Copy prompt → retry → verify prompt used
6. Reach max retries → verify stops
7. User clicks button → verify prompt captured

### Deliverables:
- All features tested and working
- No console errors
- Smooth animations
- Helpful tooltips

---

## Phase 10: Documentation & Distribution 📦
**Goal**: Prepare for release

### Tasks:
- [ ] Create extension icons (16, 48, 128px)
- [ ] Write README for extension
- [ ] Add installation instructions
- [ ] Create demo GIF/video
- [ ] Write Chrome Web Store description
- [ ] Set up version numbering
- [ ] Create build script for distribution
- [ ] Zip extension for Chrome Web Store
- [ ] (Optional) Publish to Chrome Web Store

### Assets Needed:
- Extension icons (square, transparent background)
- Screenshots for Web Store
- Promo images (1400x560, 920x680)
- Demo video or GIF

### Deliverables:
- Production-ready extension
- Complete documentation
- Distribution package

---

## Technical Decisions

### Vite Configuration
- Build content script as IIFE
- Inject CSS inline or as separate file
- Handle HMR for development
- Source maps for debugging

### State Management
- Local state with hooks (no Redux needed)
- Chrome storage for persistence
- Context for shared state (if needed)

### Styling Strategy
- Tailwind with JIT mode
- Custom theme for dark panel
- Shadow DOM style injection
- Responsive utilities

### Error Handling
- Try/catch around critical functions
- Fallbacks for missing elements
- User-friendly error messages
- Console logging for debugging

---

## Migration Strategy

### Phase-by-Phase Approach:
1. Build new extension alongside old userscript
2. Test each phase independently
3. Compare functionality with original
4. Only remove userscript when extension is 100% feature-complete

### Rollback Plan:
- Keep original userscript code in `src/legacy/`
- Git tags for each phase
- Can revert to userscript if needed

---

## Success Criteria

Extension must:
- ✅ Match all original userscript functionality
- ✅ Have better UX with Shadcn components
- ✅ Load faster than CDN-based approach
- ✅ Be completely isolated from page styles
- ✅ Persist settings across sessions
- ✅ Be easy to install and update
- ✅ Have no console errors
- ✅ Work reliably on grok.com

---

## Timeline Estimate

- Phase 1: 30 mins (scaffolding)
- Phase 2: 20 mins (Shadcn setup)
- Phase 3: 30 mins (state management)
- Phase 4: 45 mins (UI components)
- Phase 5: 30 mins (retry logic)
- Phase 6: 30 mins (interactions)
- Phase 7: 20 mins (Shadow DOM)
- Phase 8: 20 mins (Chrome APIs)
- Phase 9: 30 mins (testing)
- Phase 10: 20 mins (docs)

**Total: ~4-5 hours**

---

## Ready to Start?

Reply with "Start Phase 1" to begin! 🚀
