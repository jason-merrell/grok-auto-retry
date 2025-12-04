(function () {
	"use strict";

	/************************************************************
	 * TAILWIND CSS INJECTION
	 ************************************************************/
	function injectTailwind(): void {
		if (document.getElementById('grok-retry-tailwind')) return;
		
		// Inject Tailwind config to use a specific prefix and layer
		const configScript = document.createElement('script');
		configScript.id = 'grok-retry-tailwind-config';
		configScript.textContent = `
			tailwind.config = {
				prefix: 'tw-',
				corePlugins: {
					preflight: false, // Disable Tailwind's base styles
				},
				important: '#grok-moderation-retry-panel, #grok-moderation-retry-mini-toggle',
			}
		`;
		document.head.appendChild(configScript);
		
		const script = document.createElement('script');
		script.id = 'grok-retry-tailwind';
		script.src = 'https://cdn.tailwindcss.com';
		document.head.appendChild(script);
		
		log("Tailwind CSS injected with scoped configuration");
	}

	/************************************************************
	 * CONFIG
	 ************************************************************/
	const MODERATION_TEXT = "Content Moderated. Try a different idea.";
	const BUTTON_SELECTOR = 'button[aria-label="Make video"]';
	const TEXTAREA_SELECTOR = 'textarea[aria-label="Make a video"]';
	const CLICK_COOLDOWN = 8000; // ms
	const DEFAULT_MAX_RETRIES = 3;
	const MAX_RETRIES_HARD_LIMIT = 50;
	const MIN_RETRIES_HARD_LIMIT = 1;

	const BASE_WIDTH = 320; // design width (for font sizing)
	const MIN_FONT = 11;
	const MAX_FONT = 16;

	/************************************************************
	 * STATE
	 ************************************************************/
	let lastClickTime: number = 0;
	let retryCount: number = 0;
	let maxRetries: number = DEFAULT_MAX_RETRIES;
	let autoRetryEnabled: boolean = false;
	let isPaused: boolean = false;
	let isMinimized: boolean = false;
	let lastPromptValue: string = "";
	let originalPageTitle: string = "";
	let lastCaptureTime: number = 0;

	// UI elements
	let retryInfoSpan: HTMLSpanElement | null = null;
	let maxRetriesInput: HTMLInputElement | null = null;
	let enabledCheckbox: HTMLInputElement | null = null;
	let pauseButton: HTMLButtonElement | null = null;
	let minimizeButton: HTMLButtonElement | null = null;
	let contentWrapper: HTMLDivElement | null = null;
	let panel: HTMLDivElement | null = null;
	let miniToggle: HTMLDivElement | null = null;
	let promptTextarea: HTMLTextAreaElement | null = null;
	let promptSyncIndicator: HTMLDivElement | null = null;
	let copyFromSiteBtn: HTMLButtonElement | null = null;

	// Resize state (panel)
	let isResizing: boolean = false;
	let startX: number = 0;
	let startY: number = 0;
	let startWidth: number = 0;
	let startHeight: number = 0;

	// Drag state (mini toggle)
	let miniDragging: boolean = false;
	let miniDragMoved: boolean = false;
	let miniStartX: number = 0;
	let miniStartY: number = 0;
	let miniStartLeft: number = 0;
	let miniStartTop: number = 0;

	/************************************************************
	 * LOGGING
	 ************************************************************/
	function log(...args: any[]): void {
		console.log("[Grok-Moderation-Retry]", ...args);
	}

	/************************************************************
	 * CORE LOGIC
	 ************************************************************/
	function findModerationTextPresent(): boolean {
		return document.body && document.body.textContent!.includes(MODERATION_TEXT);
	}

	function updateRetryInfo(): void {
		if (retryInfoSpan) {
			retryInfoSpan.textContent = `${retryCount}/${maxRetries}`;
		}
		updatePageTitle();
	}

	function updatePageTitle(): void {
		if (autoRetryEnabled && retryCount > 0) {
			if (isPaused) {
				document.title = `⏸️ [${retryCount}/${maxRetries}] ${originalPageTitle}`;
			} else if (retryCount >= maxRetries) {
				document.title = `❌ [${retryCount}/${maxRetries}] ${originalPageTitle}`;
			} else {
				document.title = `🔄 [${retryCount}/${maxRetries}] ${originalPageTitle}`;
			}
		} else {
			document.title = originalPageTitle;
		}
	}

	function setMaxRetries(val: string | number, fromUI: boolean = true): void {
		let clamped = parseInt(String(val), 10);
		if (isNaN(clamped)) clamped = DEFAULT_MAX_RETRIES;
		if (clamped < MIN_RETRIES_HARD_LIMIT) clamped = MIN_RETRIES_HARD_LIMIT;
		if (clamped > MAX_RETRIES_HARD_LIMIT) clamped = MAX_RETRIES_HARD_LIMIT;

		maxRetries = clamped;
		if (maxRetriesInput) {
			maxRetriesInput.value = String(maxRetries);
		}
		updateRetryInfo();
		if (fromUI) {
			log("Max retries set to:", maxRetries);
		}
	}

	function incrementMaxRetries(delta: number): void {
		setMaxRetries(maxRetries + delta);
	}

	function clickMakeVideoButton(): void {
		if (!autoRetryEnabled) return;
		if (isPaused) return;

		if (retryCount >= maxRetries) {
			log(`Max retries (${maxRetries}) reached. Not retrying anymore.`);
			return;
		}

		const now = Date.now();
		if (now - lastClickTime < CLICK_COOLDOWN) {
			return;
		}

		const btn = document.querySelector(BUTTON_SELECTOR) as HTMLButtonElement | null;
		if (!btn) {
			log('Moderation text detected, but "Make video" button not found.');
			return;
		}

		const siteTextarea = document.querySelector(TEXTAREA_SELECTOR) as HTMLTextAreaElement | null;
		if (!siteTextarea) {
			log('Site textarea not found.');
			return;
		}

		// Get prompt from our panel textarea
		const promptToUse = lastPromptValue.trim();
		if (!promptToUse) {
			log("No prompt text in panel textarea. Please enter a prompt first.");
			return;
		}

		log(`Setting prompt: "${promptToUse}"`);
		
		// Use React-style property setting for modern frameworks
		const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
		const nativeInputValueSetter = descriptor?.set;
		if (nativeInputValueSetter) {
			nativeInputValueSetter.call(siteTextarea, promptToUse);
		}
		
		// Trigger all possible events to ensure the framework picks it up
		siteTextarea.dispatchEvent(new Event('input', { bubbles: true }));
		siteTextarea.dispatchEvent(new Event('change', { bubbles: true }));
		siteTextarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));

		lastClickTime = now;
		retryCount++;
		updateRetryInfo();

		log(`Retry #${retryCount}/${maxRetries} — clicking "Make video"...`);
		btn.click();
	}

	function capturePromptValue(isUserClick: boolean = false): void {
		// Only capture on user clicks, not script-triggered clicks
		if (!isUserClick) return;
		
		const textarea = document.querySelector(TEXTAREA_SELECTOR) as HTMLTextAreaElement | null;
		if (textarea && textarea.value.trim() !== "") {
			const value = textarea.value.trim();
			lastPromptValue = value;
			if (promptTextarea) {
				promptTextarea.value = value;
			}
			lastCaptureTime = Date.now();
			showSyncIndicator("✓ Synced from site");
			log(`✓ Captured prompt value (${value.length} chars)`);
		}
	}

	function copyPromptFromSite(): void {
		const textarea = document.querySelector(TEXTAREA_SELECTOR) as HTMLTextAreaElement | null;
		if (textarea && textarea.value.trim() !== "") {
			const value = textarea.value.trim();
			lastPromptValue = value;
			if (promptTextarea) {
				promptTextarea.value = value;
			}
			showSyncIndicator("✓ Copied from site");
			log(`Manually copied prompt (${value.length} chars)`);
		} else {
			showSyncIndicator("⚠ Site textarea is empty", true);
		}
	}

	function showSyncIndicator(message: string, isWarning: boolean = false): void {
		if (!promptSyncIndicator) return;
		
		promptSyncIndicator.textContent = message;
		promptSyncIndicator.style.color = isWarning ? "#fbbf24" : "#34d399";
		promptSyncIndicator.style.opacity = "1";
		
		// Fade out after 3 seconds
		setTimeout(() => {
			if (promptSyncIndicator) {
				promptSyncIndicator.style.opacity = "0";
			}
		}, 3000);
	}

	function checkAndAct(): void {
		// Ensure panel still exists in DOM
		if (panel && !document.body.contains(panel)) {
			log("Panel removed from DOM, recreating...");
			panel = null;
			contentWrapper = null;
			createControlPanel();
		}
		
		if (findModerationTextPresent()) {
			clickMakeVideoButton();
		}
	}

	/************************************************************
	 * FONT SCALING
	 ************************************************************/
	function updateFontSizeForWidth(width: number): void {
		const ratio = width / BASE_WIDTH;
		let fontSize = Math.round(13 * ratio);
		if (fontSize < MIN_FONT) fontSize = MIN_FONT;
		if (fontSize > MAX_FONT) fontSize = MAX_FONT;
		if (panel) {
			panel.style.fontSize = fontSize + "px";
		}
	}

	/************************************************************
	 * PANEL RESIZE (TOP-LEFT HANDLE, PANEL BOTTOM-RIGHT ANCHORED)
	 ************************************************************/
	function initResize(handle: HTMLElement): void {
		handle.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (!panel) return;
			isResizing = true;
			startX = e.clientX;
			startY = e.clientY;
			startWidth = panel.offsetWidth;
			startHeight = panel.offsetHeight;

			document.addEventListener("mousemove", onResizeMove);
			document.addEventListener("mouseup", stopResize);
		});
	}

	function onResizeMove(e: MouseEvent): void {
		if (!isResizing || !panel) return;

		const dx = startX - e.clientX;
		const dy = startY - e.clientY;

		let newWidth = startWidth + dx;
		let newHeight = startHeight + dy;

		const minW = 260;
		const maxW = 520;
		const minH = 100;
		const maxH = 400;

		if (newWidth < minW) newWidth = minW;
		if (newWidth > maxW) newWidth = maxW;
		if (newHeight < minH) newHeight = minH;
		if (newHeight > maxH) newHeight = maxH;

		panel.style.width = newWidth + "px";
		panel.style.height = newHeight + "px";

		updateFontSizeForWidth(newWidth);
	}

	function stopResize(): void {
		if (!isResizing) return;
		isResizing = false;
		document.removeEventListener("mousemove", onResizeMove);
		document.removeEventListener("mouseup", stopResize);
	}

	/************************************************************
	 * MINI '+' TOGGLE (DRAGGABLE)
	 ************************************************************/
	function createMiniToggle(): void {
		if (miniToggle) return;

		miniToggle = document.createElement("div");
		miniToggle.id = "grok-moderation-retry-mini-toggle";
		miniToggle.textContent = "+";
		miniToggle.title = "Restore Grok Auto Retry panel";
		miniToggle.className = "tw-fixed tw-bottom-4 tw-right-4 tw-w-7 tw-h-7 tw-rounded-full tw-bg-slate-900/95 tw-text-gray-50 tw-hidden tw-items-center tw-justify-center tw-cursor-pointer tw-shadow-xl tw-text-lg tw-z-[9999] tw-select-none tw-hover:bg-slate-800 tw-transition-colors";

		document.body.appendChild(miniToggle);

		// Dragging logic
		miniToggle.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			if (!miniToggle) return;
			miniDragging = true;
			miniDragMoved = false;

			// Convert bottom/right to top/left for dragging
			const rect = miniToggle.getBoundingClientRect();
			miniStartX = e.clientX;
			miniStartY = e.clientY;
			miniStartLeft = rect.left;
			miniStartTop = rect.top;

			miniToggle.style.left = miniStartLeft + "px";
			miniToggle.style.top = miniStartTop + "px";
			miniToggle.style.right = "auto";
			miniToggle.style.bottom = "auto";

			document.addEventListener("mousemove", onMiniDragMove);
			document.addEventListener("mouseup", onMiniDragEnd);
		});
	}

	function onMiniDragMove(e: MouseEvent): void {
		if (!miniDragging || !miniToggle) return;
		miniDragMoved = true;

		const dx = e.clientX - miniStartX;
		const dy = e.clientY - miniStartY;

		let newLeft = miniStartLeft + dx;
		let newTop = miniStartTop + dy;

		const w = miniToggle.offsetWidth;
		const h = miniToggle.offsetHeight;

		const maxLeft = window.innerWidth - w - 4;
		const maxTop = window.innerHeight - h - 4;

		if (newLeft < 4) newLeft = 4;
		if (newTop < 4) newTop = 4;
		if (newLeft > maxLeft) newLeft = maxLeft;
		if (newTop > maxTop) newTop = maxTop;

		miniToggle.style.left = newLeft + "px";
		miniToggle.style.top = newTop + "px";
	}

	function onMiniDragEnd(e: MouseEvent): void {
		if (!miniDragging) return;
		document.removeEventListener("mousemove", onMiniDragMove);
		document.removeEventListener("mouseup", onMiniDragEnd);

		// If it didn't move much, treat as a click to restore
		if (!miniDragMoved) {
			restorePanelFromMini();
		}

		miniDragging = false;
		miniDragMoved = false;
	}

	function showMiniToggle(): void {
		// Check if miniToggle still exists in DOM
		if (miniToggle && !document.body.contains(miniToggle)) {
			miniToggle = null;
		}
		createMiniToggle();
		if (miniToggle) {
			miniToggle.classList.remove("hidden");
			miniToggle.classList.add("flex");
		}
	}

	function hideMiniToggle(): void {
		if (miniToggle) {
			miniToggle.classList.remove("flex");
			miniToggle.classList.add("hidden");
		}
	}

	function restorePanelFromMini(): void {
		isMinimized = false;
		hideMiniToggle();
		
		// Check if panel still exists in DOM
		if (!panel || !document.body.contains(panel)) {
			log("Panel missing, recreating...");
			if (panel) panel.remove();
			panel = null;
			contentWrapper = null;
			createControlPanel();
			return;
		}
		
		// Check if content wrapper is still present
		if (!contentWrapper || !panel.contains(contentWrapper)) {
			log("Content wrapper lost, recreating panel...");
			panel.remove();
			panel = null;
			contentWrapper = null;
			createControlPanel();
			return;
		}
		
		panel.classList.remove("hidden");
		panel.classList.add("flex");
	}

	/************************************************************
	 * UI PANEL
	 ************************************************************/
	function createControlPanel(): void {
		const existingPanel = document.getElementById("grok-moderation-retry-panel");
		if (existingPanel && existingPanel === panel) {
			return;
		}
		// Remove orphaned panel if it exists but isn't our reference
		if (existingPanel) {
			existingPanel.remove();
		}

		panel = document.createElement("div");
		panel.id = "grok-moderation-retry-panel";
		panel.className = "tw-fixed tw-bottom-4 tw-right-4 tw-z-[9998] tw-bg-slate-900/[0.97] tw-rounded-[14px] tw-shadow-2xl tw-text-gray-50 tw-font-sans tw-flex tw-flex-col tw-box-border tw-min-w-[260px] tw-min-h-[110px] tw-max-w-[520px] tw-overflow-hidden tw-p-3 tw-gap-2";
		panel.style.width = BASE_WIDTH + "px";

		updateFontSizeForWidth(BASE_WIDTH);

		/********* Custom resize handle (top-left) *********/
		const resizeHandle = document.createElement("div");
		resizeHandle.title = "Drag to resize";
		resizeHandle.className = "tw-absolute tw-top-1 tw-left-1 tw-w-2.5 tw-h-2.5 tw-rounded tw-border tw-border-slate-400/70 tw-bg-slate-900/90 tw-cursor-nwse-resize tw-z-[10000]";
		panel.appendChild(resizeHandle);

		// Content container
		const innerWrapper = document.createElement("div");
		innerWrapper.className = "tw-flex tw-flex-col tw-gap-2 tw-opacity-96 tw-pt-1";

		/********* Header row: title + pause + min/max *********/
		const header = document.createElement("div");
		header.className = "tw-flex tw-items-center tw-justify-between tw-gap-2";

		const titleWrapper = document.createElement("div");
		titleWrapper.className = "tw-flex tw-flex-col";

		const title = document.createElement("div");
		title.textContent = "Grok Auto Retry";
		title.className = "tw-font-semibold tw-text-base";

		const subtitle = document.createElement("div");
		subtitle.textContent = "Retries the video if it gets moderated";
		subtitle.className = "tw-text-[0.8em] tw-text-gray-400";

		titleWrapper.appendChild(title);
		titleWrapper.appendChild(subtitle);

		const headerRight = document.createElement("div");
		headerRight.className = "tw-flex tw-items-center tw-gap-1.5";

		pauseButton = document.createElement("button");
		pauseButton.textContent = "Pause";
		pauseButton.className = "tw-border-0 tw-px-3 tw-py-1 tw-rounded-full tw-text-[0.8em] tw-cursor-pointer tw-bg-slate-50/[0.14] tw-text-gray-200 tw-hover:bg-slate-50/20 tw-transition-colors";

		minimizeButton = document.createElement("button");
		minimizeButton.textContent = "–";
		minimizeButton.title = "Minimize";
		minimizeButton.className = "tw-border-0 tw-px-2.5 tw-py-0.5 tw-rounded-full tw-text-[0.9em] tw-cursor-pointer tw-bg-gray-800/95 tw-text-gray-200 tw-hover:bg-gray-700 tw-transition-colors";

		headerRight.appendChild(pauseButton);
		headerRight.appendChild(minimizeButton);

		header.appendChild(titleWrapper);
		header.appendChild(headerRight);
		innerWrapper.appendChild(header);

		/********* Divider *********/
		const divider = document.createElement("div");
		divider.className = "tw-h-px tw-bg-gray-700/90 tw-my-1";
		innerWrapper.appendChild(divider);

		/********* Content wrapper *********/
		contentWrapper = document.createElement("div");
		contentWrapper.className = "tw-flex tw-flex-col tw-gap-2";
		innerWrapper.appendChild(contentWrapper);

		// Row 1: Auto retry checkbox
		const row1 = document.createElement("label");
		row1.className = "tw-flex tw-items-center tw-gap-2 tw-cursor-pointer";

		enabledCheckbox = document.createElement("input");
		enabledCheckbox.type = "checkbox";
		enabledCheckbox.className = "tw-m-0 tw-cursor-pointer";

		const enabledLabel = document.createElement("span");
		enabledLabel.textContent = "Enable auto retry on moderation";
		enabledLabel.className = "tw-text-[0.9em]";

		row1.appendChild(enabledCheckbox);
		row1.appendChild(enabledLabel);
		contentWrapper.appendChild(row1);

		// Row 1.5: Prompt textarea with controls
		const promptRow = document.createElement("div");
		promptRow.className = "tw-flex tw-flex-col tw-gap-1";

		// Header with label and copy button
		const promptHeader = document.createElement("div");
		promptHeader.className = "tw-flex tw-justify-between tw-items-center";

		const promptLabel = document.createElement("label");
		promptLabel.textContent = "Prompt to retry with:";
		promptLabel.className = "tw-text-[0.8em] tw-text-gray-400 tw-font-medium";

		copyFromSiteBtn = document.createElement("button");
		copyFromSiteBtn.textContent = "📋 Copy from site";
		copyFromSiteBtn.title = "Copy the current prompt from the site's textarea";
		copyFromSiteBtn.className = "tw-border-0 tw-px-2 tw-py-0.5 tw-rounded-full tw-text-[0.75em] tw-cursor-pointer tw-bg-blue-500/20 tw-text-blue-400 tw-hover:bg-blue-500/30 tw-transition-all tw-duration-200";
		copyFromSiteBtn.addEventListener("click", copyPromptFromSite);

		promptHeader.appendChild(promptLabel);
		promptHeader.appendChild(copyFromSiteBtn);

		// Textarea wrapper for border animation
		const textareaWrapper = document.createElement("div");
		textareaWrapper.className = "tw-relative";

		promptTextarea = document.createElement("textarea");
		promptTextarea.placeholder = "Click 'Copy from site' or type your prompt here...";
		promptTextarea.value = lastPromptValue;
		promptTextarea.rows = 3;
		promptTextarea.className = "tw-w-full tw-text-[0.85em] tw-p-2 tw-rounded-lg tw-border tw-border-slate-400/90 tw-bg-slate-900/[0.98] tw-text-gray-50 tw-box-border tw-resize-y tw-font-[inherit] tw-transition-colors tw-focus:border-blue-400/90 tw-focus:outline-none";

		promptTextarea.addEventListener("input", () => {
			if (promptTextarea) lastPromptValue = promptTextarea.value;
		});

		textareaWrapper.appendChild(promptTextarea);

		// Sync indicator
		promptSyncIndicator = document.createElement("div");
		promptSyncIndicator.className = "tw-text-[0.75em] tw-text-emerald-400 tw-mt-1 tw-opacity-0 tw-transition-opacity tw-duration-300 tw-min-h-[1em]";

		promptRow.appendChild(promptHeader);
		promptRow.appendChild(textareaWrapper);
		promptRow.appendChild(promptSyncIndicator);
		contentWrapper.appendChild(promptRow);

		// Row 2: retries + max controls
		const row2 = document.createElement("div");
		row2.style.display = "flex";
		row2.style.alignItems = "center";
		row2.style.justifyContent = "space-between";
		row2.style.gap = "1em";

		const retriesBlock = document.createElement("div");
		retriesBlock.style.display = "flex";
		retriesBlock.style.flexDirection = "column";
		retriesBlock.style.gap = "0.2em";

		const retriesLabel = document.createElement("span");
		retriesLabel.textContent = "Retries used";
		retriesLabel.style.fontSize = "0.8em";
		retriesLabel.style.color = "#9ca3af";

		retryInfoSpan = document.createElement("span");
		retryInfoSpan.textContent = `${retryCount}/${maxRetries}`;
		retryInfoSpan.style.fontVariantNumeric = "tabular-nums";
		retryInfoSpan.style.fontSize = "0.95em";
		retryInfoSpan.style.fontWeight = "500";

		retriesBlock.appendChild(retriesLabel);
		retriesBlock.appendChild(retryInfoSpan);

		const maxBlock = document.createElement("div");
		maxBlock.className = "tw-flex tw-flex-col tw-items-end tw-gap-1";

		const maxLabel = document.createElement("span");
		maxLabel.textContent = "Max retries";
		maxLabel.className = "tw-text-[0.8em] tw-text-gray-400";

		const maxControls = document.createElement("div");
		maxControls.className = "tw-flex tw-items-center tw-gap-1";

		const minusBtn = document.createElement("button");
		minusBtn.textContent = "–";
		minusBtn.className = "tw-border-0 tw-px-3 tw-py-1 tw-rounded-full tw-text-[0.95em] tw-cursor-pointer tw-bg-gray-800/95 tw-text-gray-200 tw-hover:bg-gray-700 tw-transition-colors";

		maxRetriesInput = document.createElement("input");
		maxRetriesInput.type = "number";
		maxRetriesInput.min = String(MIN_RETRIES_HARD_LIMIT);
		maxRetriesInput.max = String(MAX_RETRIES_HARD_LIMIT);
		maxRetriesInput.value = String(maxRetries);
		maxRetriesInput.className = "tw-w-[4.2em] tw-h-[1.6em] tw-text-[0.9em] tw-px-1.5 tw-py-0.5 tw-rounded-lg tw-border tw-border-slate-400/90 tw-bg-slate-900/[0.98] tw-text-gray-50 tw-box-border tw-text-center tw-focus:outline-none tw-focus:border-blue-400/90";

		const plusBtn = document.createElement("button");
		plusBtn.textContent = "+";
		plusBtn.className = "tw-border-0 tw-px-3 tw-py-1 tw-rounded-full tw-text-[0.95em] tw-cursor-pointer tw-bg-gray-800/95 tw-text-gray-200 tw-hover:bg-gray-700 tw-transition-colors";

		maxControls.appendChild(minusBtn);
		maxControls.appendChild(maxRetriesInput);
		maxControls.appendChild(plusBtn);

		maxBlock.appendChild(maxLabel);
		maxBlock.appendChild(maxControls);

		row2.appendChild(retriesBlock);
		row2.appendChild(maxBlock);
		contentWrapper.appendChild(row2);

		// Row 3: reset + hint
		const row3 = document.createElement("div");
		row3.className = "tw-flex tw-justify-between tw-items-center";

		const tip = document.createElement("span");
		tip.textContent = "You can pause at any time.";
		tip.className = "tw-text-[0.75em] tw-text-gray-400";

		const resetBtn = document.createElement("button");
		resetBtn.textContent = "Reset count";
		resetBtn.className = "tw-border-0 tw-px-3 tw-py-1 tw-rounded-full tw-text-[0.8em] tw-cursor-pointer tw-bg-blue-600/95 tw-text-gray-200 tw-hover:bg-blue-600 tw-transition-colors";

		row3.appendChild(tip);
		row3.appendChild(resetBtn);
		contentWrapper.appendChild(row3);

		panel.appendChild(innerWrapper);
		document.body.appendChild(panel);

		/********* UI event handlers *********/

		initResize(resizeHandle);

		enabledCheckbox.addEventListener("change", () => {
			if (enabledCheckbox) autoRetryEnabled = enabledCheckbox.checked;
			log("Auto retry enabled:", autoRetryEnabled);
			updatePageTitle();
		});

		maxRetriesInput.addEventListener("change", () => {
			if (maxRetriesInput) setMaxRetries(maxRetriesInput.value);
		});

		minusBtn.addEventListener("click", () => {
			incrementMaxRetries(-1);
		});

		plusBtn.addEventListener("click", () => {
			incrementMaxRetries(1);
		});

		resetBtn.addEventListener("click", () => {
			retryCount = 0;
			updateRetryInfo();
			log("Retry count reset to 0.");
			updatePageTitle();
		});

		pauseButton.addEventListener("click", () => {
			isPaused = !isPaused;
			if (pauseButton) {
				pauseButton.textContent = isPaused ? "Resume" : "Pause";
				// Toggle background opacity for paused state
				if (isPaused) {
					pauseButton.classList.add("bg-slate-50/[0.24]");
					pauseButton.classList.remove("bg-slate-50/[0.14]");
				} else {
					pauseButton.classList.add("bg-slate-50/[0.14]");
					pauseButton.classList.remove("bg-slate-50/[0.24]");
				}
			}
			log("Paused state:", isPaused);
			updatePageTitle();
		});

		minimizeButton.addEventListener("click", () => {
			isMinimized = true;
			if (panel) {
				panel.classList.remove("flex");
				panel.classList.add("hidden");
			}
			showMiniToggle();
		});

		// Ensure mini toggle exists (hidden initially)
		createMiniToggle();

		log("Control panel created.");
	}

	/************************************************************
	 * OBSERVER + INIT
	 ************************************************************/
	const observer: MutationObserver = new MutationObserver(() => {
		checkAndAct();
	});

	function startObserver(): void {
		if (!document.body) return;

		// Inject Tailwind CSS
		injectTailwind();

		// Capture original page title
		originalPageTitle = document.title;

		createControlPanel();

		// Capture prompt value whenever the "Make video" button is clicked by user
		document.addEventListener('click', (e: MouseEvent) => {
			// Check if the clicked element or any parent is the Make video button
			let element = e.target as HTMLElement | null;
			while (element && element !== document.body) {
				if (element.matches && element.matches(BUTTON_SELECTOR)) {
					// Check if this is a trusted user event (not programmatically triggered)
					capturePromptValue(e.isTrusted);
					break;
				}
				element = element.parentElement;
			}
		}, true);

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		checkAndAct();
		log("Observer started.");
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", startObserver);
	} else {
		startObserver();
	}

	// Backup interval
	setInterval(checkAndAct, 8000);
})();
