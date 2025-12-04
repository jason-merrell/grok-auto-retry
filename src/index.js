// ==UserScript==
// @name         Grok Imagine - Auto Retry "Make video" on moderation (compact + draggable mini toggle)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Optional auto-retry for video generation when moderation message appears, with bottom-right UI, custom resize, pause, +/- controls, and draggable mini '+' toggle when minimized.
// @author       you
// @match        https://grok.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
	"use strict";

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
	let lastClickTime = 0;
	let retryCount = 0;
	let maxRetries = DEFAULT_MAX_RETRIES;
	let autoRetryEnabled = false;
	let isPaused = false;
	let isMinimized = false;
	let lastPromptValue = "";
	let originalPageTitle = "";
	let lastCaptureTime = 0;

	// UI elements
	let retryInfoSpan = null;
	let maxRetriesInput = null;
	let enabledCheckbox = null;
	let pauseButton = null;
	let minimizeButton = null;
	let contentWrapper = null;
	let panel = null;
	let miniToggle = null; // the little '+' bubble
	let promptTextarea = null;
	let promptSyncIndicator = null;
	let copyFromSiteBtn = null;

	// Resize state (panel)
	let isResizing = false;
	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let startHeight = 0;

	// Drag state (mini toggle)
	let miniDragging = false;
	let miniDragMoved = false;
	let miniStartX = 0;
	let miniStartY = 0;
	let miniStartLeft = 0;
	let miniStartTop = 0;

	/************************************************************
	 * LOGGING
	 ************************************************************/
	function log(...args) {
		console.log("[Grok-Moderation-Retry]", ...args);
	}

	/************************************************************
	 * CORE LOGIC
	 ************************************************************/
	function findModerationTextPresent() {
		return document.body && document.body.textContent.includes(MODERATION_TEXT);
	}

	function updateRetryInfo() {
		if (retryInfoSpan) {
			retryInfoSpan.textContent = `${retryCount}/${maxRetries}`;
		}
		updatePageTitle();
	}

	function updatePageTitle() {
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

	function setMaxRetries(val, fromUI = true) {
		let clamped = parseInt(val, 10);
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

	function incrementMaxRetries(delta) {
		setMaxRetries(maxRetries + delta);
	}

	function clickMakeVideoButton() {
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

		const btn = document.querySelector(BUTTON_SELECTOR);
		if (!btn) {
			log('Moderation text detected, but "Make video" button not found.');
			return;
		}

		const siteTextarea = document.querySelector(TEXTAREA_SELECTOR);
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
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
		nativeInputValueSetter.call(siteTextarea, promptToUse);
		
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

	function capturePromptValue(isUserClick = false) {
		// Only capture on user clicks, not script-triggered clicks
		if (!isUserClick) return;
		
		const textarea = document.querySelector(TEXTAREA_SELECTOR);
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

	function copyPromptFromSite() {
		const textarea = document.querySelector(TEXTAREA_SELECTOR);
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

	function showSyncIndicator(message, isWarning = false) {
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

	function checkAndAct() {
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
	function updateFontSizeForWidth(width) {
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
	function initResize(handle) {
		handle.addEventListener("mousedown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			isResizing = true;
			startX = e.clientX;
			startY = e.clientY;
			startWidth = panel.offsetWidth;
			startHeight = panel.offsetHeight;

			document.addEventListener("mousemove", onResizeMove);
			document.addEventListener("mouseup", stopResize);
		});
	}

	function onResizeMove(e) {
		if (!isResizing) return;

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

	function stopResize() {
		if (!isResizing) return;
		isResizing = false;
		document.removeEventListener("mousemove", onResizeMove);
		document.removeEventListener("mouseup", stopResize);
	}

	/************************************************************
	 * MINI '+' TOGGLE (DRAGGABLE)
	 ************************************************************/
	function createMiniToggle() {
		if (miniToggle) return;

		miniToggle = document.createElement("div");
		miniToggle.id = "grok-moderation-retry-mini-toggle";
		miniToggle.textContent = "+";
		miniToggle.title = "Restore Grok Auto Retry panel";

		miniToggle.style.position = "fixed";
		miniToggle.style.bottom = "16px";
		miniToggle.style.right = "16px";
		miniToggle.style.width = "28px";
		miniToggle.style.height = "28px";
		miniToggle.style.borderRadius = "999px";
		miniToggle.style.background = "rgba(15, 23, 42, 0.95)";
		miniToggle.style.color = "#f9fafb";
		miniToggle.style.display = "none"; // hidden until minimized
		miniToggle.style.alignItems = "center";
		miniToggle.style.justifyContent = "center";
		miniToggle.style.cursor = "pointer";
		miniToggle.style.boxShadow = "0 4px 10px rgba(0,0,0,0.45)";
		miniToggle.style.fontSize = "18px";
		miniToggle.style.zIndex = "9999";
		miniToggle.style.userSelect = "none";

		document.body.appendChild(miniToggle);

		// Dragging logic
		miniToggle.addEventListener("mousedown", (e) => {
			e.preventDefault();
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

	function onMiniDragMove(e) {
		if (!miniDragging) return;
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

	function onMiniDragEnd(e) {
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

	function showMiniToggle() {
		// Check if miniToggle still exists in DOM
		if (miniToggle && !document.body.contains(miniToggle)) {
			miniToggle = null;
		}
		createMiniToggle();
		if (miniToggle) {
			miniToggle.style.display = "flex";
		}
	}

	function hideMiniToggle() {
		if (miniToggle) {
			miniToggle.style.display = "none";
		}
	}

	function restorePanelFromMini() {
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
		
		panel.style.display = "flex";
	}

	/************************************************************
	 * UI PANEL
	 ************************************************************/
	function createControlPanel() {
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

		// Bottom-right anchored
		panel.style.position = "fixed";
		panel.style.bottom = "16px";
		panel.style.right = "16px";
		panel.style.zIndex = "9998";
		panel.style.background = "rgba(15, 23, 42, 0.97)";
		panel.style.borderRadius = "14px";
		panel.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.45)";
		panel.style.color = "#f9fafb";
		panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
		panel.style.display = "flex";
		panel.style.flexDirection = "column";
		panel.style.boxSizing = "border-box";
		panel.style.width = BASE_WIDTH + "px";
		panel.style.minWidth = "260px";
		panel.style.minHeight = "110px";
		panel.style.maxWidth = "520px";
		panel.style.overflow = "hidden";
		panel.style.padding = "10px 12px";
		panel.style.gap = "8px";

		updateFontSizeForWidth(BASE_WIDTH);

		/********* Custom resize handle (top-left) *********/
		const resizeHandle = document.createElement("div");
		resizeHandle.title = "Drag to resize";
		resizeHandle.style.position = "absolute";
		resizeHandle.style.top = "4px";
		resizeHandle.style.left = "4px";
		resizeHandle.style.width = "10px";
		resizeHandle.style.height = "10px";
		resizeHandle.style.borderRadius = "3px";
		resizeHandle.style.border = "1px solid rgba(148, 163, 184, 0.7)";
		resizeHandle.style.background = "rgba(15, 23, 42, 0.9)";
		resizeHandle.style.cursor = "nwse-resize";
		resizeHandle.style.zIndex = "10000";
		panel.appendChild(resizeHandle);

		// Content container
		const innerWrapper = document.createElement("div");
		innerWrapper.style.display = "flex";
		innerWrapper.style.flexDirection = "column";
		innerWrapper.style.gap = "8px";
		innerWrapper.style.opacity = "0.96";
		innerWrapper.style.paddingTop = "4px";

		/********* Header row: title + pause + min/max *********/
		const header = document.createElement("div");
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.justifyContent = "space-between";
		header.style.gap = "8px";

		const titleWrapper = document.createElement("div");
		titleWrapper.style.display = "flex";
		titleWrapper.style.flexDirection = "column";

		const title = document.createElement("div");
		title.textContent = "Grok Auto Retry";
		title.style.fontWeight = "600";
		title.style.fontSize = "1em";

		const subtitle = document.createElement("div");
		subtitle.textContent = "Retries the video if it gets moderated";
		subtitle.style.fontSize = "0.8em";
		subtitle.style.color = "#9ca3af";

		titleWrapper.appendChild(title);
		titleWrapper.appendChild(subtitle);

		const headerRight = document.createElement("div");
		headerRight.style.display = "flex";
		headerRight.style.alignItems = "center";
		headerRight.style.gap = "0.4em";

		pauseButton = document.createElement("button");
		pauseButton.textContent = "Pause";
		pauseButton.style.border = "none";
		pauseButton.style.padding = "0.2em 0.8em";
		pauseButton.style.borderRadius = "999px";
		pauseButton.style.fontSize = "0.8em";
		pauseButton.style.cursor = "pointer";
		pauseButton.style.background = "rgba(248, 250, 252, 0.14)";
		pauseButton.style.color = "#e5e7eb";

		minimizeButton = document.createElement("button");
		minimizeButton.textContent = "–";
		minimizeButton.title = "Minimize";
		minimizeButton.style.border = "none";
		minimizeButton.style.padding = "0.1em 0.7em";
		minimizeButton.style.borderRadius = "999px";
		minimizeButton.style.fontSize = "0.9em";
		minimizeButton.style.cursor = "pointer";
		minimizeButton.style.background = "rgba(31, 41, 55, 0.95)";
		minimizeButton.style.color = "#e5e7eb";

		headerRight.appendChild(pauseButton);
		headerRight.appendChild(minimizeButton);

		header.appendChild(titleWrapper);
		header.appendChild(headerRight);
		innerWrapper.appendChild(header);

		/********* Divider *********/
		const divider = document.createElement("div");
		divider.style.height = "1px";
		divider.style.background = "rgba(55, 65, 81, 0.9)";
		divider.style.margin = "2px 0 4px 0";
		innerWrapper.appendChild(divider);

		/********* Content wrapper *********/
		contentWrapper = document.createElement("div");
		contentWrapper.style.display = "flex";
		contentWrapper.style.flexDirection = "column";
		contentWrapper.style.gap = "8px";
		innerWrapper.appendChild(contentWrapper);

		// Row 1: Auto retry checkbox
		const row1 = document.createElement("label");
		row1.style.display = "flex";
		row1.style.alignItems = "center";
		row1.style.gap = "0.5em";
		row1.style.cursor = "pointer";

		enabledCheckbox = document.createElement("input");
		enabledCheckbox.type = "checkbox";
		enabledCheckbox.style.margin = "0";

		const enabledLabel = document.createElement("span");
		enabledLabel.textContent = "Enable auto retry on moderation";
		enabledLabel.style.fontSize = "0.9em";

		row1.appendChild(enabledCheckbox);
		row1.appendChild(enabledLabel);
		contentWrapper.appendChild(row1);

		// Row 1.5: Prompt textarea with controls
		const promptRow = document.createElement("div");
		promptRow.style.display = "flex";
		promptRow.style.flexDirection = "column";
		promptRow.style.gap = "0.3em";

		// Header with label and copy button
		const promptHeader = document.createElement("div");
		promptHeader.style.display = "flex";
		promptHeader.style.justifyContent = "space-between";
		promptHeader.style.alignItems = "center";

		const promptLabel = document.createElement("label");
		promptLabel.textContent = "Prompt to retry with:";
		promptLabel.style.fontSize = "0.8em";
		promptLabel.style.color = "#9ca3af";
		promptLabel.style.fontWeight = "500";

		copyFromSiteBtn = document.createElement("button");
		copyFromSiteBtn.textContent = "📋 Copy from site";
		copyFromSiteBtn.title = "Copy the current prompt from the site's textarea";
		copyFromSiteBtn.style.border = "none";
		copyFromSiteBtn.style.padding = "0.15em 0.6em";
		copyFromSiteBtn.style.borderRadius = "999px";
		copyFromSiteBtn.style.fontSize = "0.75em";
		copyFromSiteBtn.style.cursor = "pointer";
		copyFromSiteBtn.style.background = "rgba(59, 130, 246, 0.2)";
		copyFromSiteBtn.style.color = "#60a5fa";
		copyFromSiteBtn.style.transition = "all 0.2s";
		copyFromSiteBtn.addEventListener("mouseenter", () => {
			copyFromSiteBtn.style.background = "rgba(59, 130, 246, 0.3)";
		});
		copyFromSiteBtn.addEventListener("mouseleave", () => {
			copyFromSiteBtn.style.background = "rgba(59, 130, 246, 0.2)";
		});
		copyFromSiteBtn.addEventListener("click", copyPromptFromSite);

		promptHeader.appendChild(promptLabel);
		promptHeader.appendChild(copyFromSiteBtn);

		// Textarea wrapper for border animation
		const textareaWrapper = document.createElement("div");
		textareaWrapper.style.position = "relative";

		promptTextarea = document.createElement("textarea");
		promptTextarea.placeholder = "Click 'Copy from site' or type your prompt here...";
		promptTextarea.value = lastPromptValue;
		promptTextarea.rows = 3;
		promptTextarea.style.width = "100%";
		promptTextarea.style.fontSize = "0.85em";
		promptTextarea.style.padding = "0.5em";
		promptTextarea.style.borderRadius = "0.5em";
		promptTextarea.style.border = "1px solid rgba(148, 163, 184, 0.9)";
		promptTextarea.style.background = "rgba(15, 23, 42, 0.98)";
		promptTextarea.style.color = "#f9fafb";
		promptTextarea.style.boxSizing = "border-box";
		promptTextarea.style.resize = "vertical";
		promptTextarea.style.fontFamily = "inherit";
		promptTextarea.style.transition = "border-color 0.2s";

		promptTextarea.addEventListener("input", () => {
			lastPromptValue = promptTextarea.value;
		});

		promptTextarea.addEventListener("focus", () => {
			promptTextarea.style.borderColor = "rgba(96, 165, 250, 0.9)";
		});

		promptTextarea.addEventListener("blur", () => {
			promptTextarea.style.borderColor = "rgba(148, 163, 184, 0.9)";
		});

		textareaWrapper.appendChild(promptTextarea);

		// Sync indicator
		promptSyncIndicator = document.createElement("div");
		promptSyncIndicator.style.fontSize = "0.75em";
		promptSyncIndicator.style.color = "#34d399";
		promptSyncIndicator.style.marginTop = "0.2em";
		promptSyncIndicator.style.opacity = "0";
		promptSyncIndicator.style.transition = "opacity 0.3s";
		promptSyncIndicator.style.minHeight = "1em";

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
		maxBlock.style.display = "flex";
		maxBlock.style.flexDirection = "column";
		maxBlock.style.alignItems = "flex-end";
		maxBlock.style.gap = "0.3em";

		const maxLabel = document.createElement("span");
		maxLabel.textContent = "Max retries";
		maxLabel.style.fontSize = "0.8em";
		maxLabel.style.color = "#9ca3af";

		const maxControls = document.createElement("div");
		maxControls.style.display = "flex";
		maxControls.style.alignItems = "center";
		maxControls.style.gap = "0.3em";

		const minusBtn = document.createElement("button");
		minusBtn.textContent = "–";
		minusBtn.style.border = "none";
		minusBtn.style.padding = "0.2em 0.8em";
		minusBtn.style.borderRadius = "999px";
		minusBtn.style.fontSize = "0.95em";
		minusBtn.style.cursor = "pointer";
		minusBtn.style.background = "rgba(31, 41, 55, 0.95)";
		minusBtn.style.color = "#e5e7eb";

		maxRetriesInput = document.createElement("input");
		maxRetriesInput.type = "number";
		maxRetriesInput.min = String(MIN_RETRIES_HARD_LIMIT);
		maxRetriesInput.max = String(MAX_RETRIES_HARD_LIMIT);
		maxRetriesInput.value = String(maxRetries);
		maxRetriesInput.style.width = "4.2em";
		maxRetriesInput.style.height = "1.6em";
		maxRetriesInput.style.fontSize = "0.9em";
		maxRetriesInput.style.padding = "0.1em 0.4em";
		maxRetriesInput.style.borderRadius = "0.6em";
		maxRetriesInput.style.border = "1px solid rgba(148, 163, 184, 0.9)";
		maxRetriesInput.style.background = "rgba(15, 23, 42, 0.98)";
		maxRetriesInput.style.color = "#f9fafb";
		maxRetriesInput.style.boxSizing = "border-box";
		maxRetriesInput.style.textAlign = "center";

		const plusBtn = document.createElement("button");
		plusBtn.textContent = "+";
		plusBtn.style.border = "none";
		plusBtn.style.padding = "0.2em 0.8em";
		plusBtn.style.borderRadius = "999px";
		plusBtn.style.fontSize = "0.95em";
		plusBtn.style.cursor = "pointer";
		plusBtn.style.background = "rgba(31, 41, 55, 0.95)";
		plusBtn.style.color = "#e5e7eb";

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
		row3.style.display = "flex";
		row3.style.justifyContent = "space-between";
		row3.style.alignItems = "center";

		const tip = document.createElement("span");
		tip.textContent = "You can pause at any time.";
		tip.style.fontSize = "0.75em";
		tip.style.color = "#9ca3af";

		const resetBtn = document.createElement("button");
		resetBtn.textContent = "Reset count";
		resetBtn.style.border = "none";
		resetBtn.style.padding = "0.25em 0.8em";
		resetBtn.style.borderRadius = "999px";
		resetBtn.style.fontSize = "0.8em";
		resetBtn.style.cursor = "pointer";
		resetBtn.style.background = "rgba(37, 99, 235, 0.95)";
		resetBtn.style.color = "#e5e7eb";

		row3.appendChild(tip);
		row3.appendChild(resetBtn);
		contentWrapper.appendChild(row3);

		panel.appendChild(innerWrapper);
		document.body.appendChild(panel);

		/********* UI event handlers *********/

		initResize(resizeHandle);

		enabledCheckbox.addEventListener("change", () => {
			autoRetryEnabled = enabledCheckbox.checked;
			log("Auto retry enabled:", autoRetryEnabled);
			updatePageTitle();
		});

		maxRetriesInput.addEventListener("change", () => {
			setMaxRetries(maxRetriesInput.value);
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
			pauseButton.textContent = isPaused ? "Resume" : "Pause";
			pauseButton.style.background = isPaused ? "rgba(248, 250, 252, 0.24)" : "rgba(248, 250, 252, 0.14)";
			log("Paused state:", isPaused);
			updatePageTitle();
		});

		minimizeButton.addEventListener("click", () => {
			isMinimized = true;
			panel.style.display = "none";
			showMiniToggle();
		});

		// Ensure mini toggle exists (hidden initially)
		createMiniToggle();

		log("Control panel created.");
	}

	/************************************************************
	 * OBSERVER + INIT
	 ************************************************************/
	const observer = new MutationObserver(() => {
		checkAndAct();
	});

	function startObserver() {
		if (!document.body) return;

		// Capture original page title
		originalPageTitle = document.title;

		createControlPanel();

		// Capture prompt value whenever the "Make video" button is clicked by user
		document.addEventListener('click', (e) => {
			// Check if the clicked element or any parent is the Make video button
			let element = e.target;
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
