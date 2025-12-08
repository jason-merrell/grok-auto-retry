import { setupDebug } from "../lib/debug";

setupDebug();
// Mark when content script entry runs for tests
(window as any).__grok_content_loaded = true;
import ReactDOM from "react-dom/client";
import App from "./App";
import "../styles/globals.css";

console.log("[Grok Retry] Extension script starting...");

// Singleton flag to prevent multiple initializations
let isInitialized = false;
let isInitializing = false;

function createContainer(): HTMLDivElement {
	const container = document.createElement("div");
	container.id = "grok-retry-root";
	container.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 999999;";
	return container;
}

function initializeApp() {
	// Prevent multiple simultaneous initializations
	if (isInitializing) {
		console.log("[Grok Retry] Initialization already in progress, skipping...");
		return;
	}

	// Check if container already exists
	const existing = document.getElementById("grok-retry-root");
	if (existing && existing.children.length > 0) {
		console.log("[Grok Retry] App already initialized, skipping...");
		return;
	}

	isInitializing = true;

	// Remove any existing container
	if (existing) {
		existing.remove();
	}

	// Create and append new container
	const container = createContainer();
	document.body.appendChild(container);

	console.log("[Grok Retry] Container created and appended to body");

	// Create a new React root for this container
	const root = ReactDOM.createRoot(container);

	root.render(<App />);

	isInitialized = true;
	isInitializing = false;
	console.log("[Grok Retry] React app rendered");
}

// Initial render
initializeApp();

// Watch for removal and re-add if necessary
const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		for (const node of mutation.removedNodes) {
			if (node instanceof HTMLElement && node.id === "grok-retry-root") {
				console.log("[Grok Retry] Container removed, re-adding...");
				isInitialized = false;
				// Use setTimeout to debounce rapid removals
				setTimeout(() => {
					if (!isInitialized) {
						initializeApp();
					}
				}, 100);
				return;
			}
		}
	}
});

// Start observing body for removed children
observer.observe(document.body, { childList: true });

console.log("[Grok Retry] Observer installed to watch for container removal");
