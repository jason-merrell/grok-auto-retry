#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read the compiled JS file
const distPath = path.join(__dirname, 'dist', 'index.js');
const distContent = fs.readFileSync(distPath, 'utf8');

// Userscript header
const header = `// ==UserScript==
// @name         Grok Imagine - Auto Retry "Make video" on moderation (compact + draggable mini toggle)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Optional auto-retry for video generation when moderation message appears, with bottom-right UI, custom resize, pause, +/- controls, and draggable mini '+' toggle when minimized.
// @author       you
// @match        https://grok.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

`;

// Combine header with compiled code
const finalContent = header + distContent;

// Write back to dist
fs.writeFileSync(distPath, finalContent, 'utf8');

console.log('✓ Build complete: dist/index.js (userscript ready)');
