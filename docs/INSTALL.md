# Chrome Extension Installation Guide

There are two ways to install the Grok Auto Retry extension for Chrome. The quickest path is to use a release ZIP, while building locally (listed second) remains the recommended way if you want to inspect the source before loading it.

## Option A: Install from a Release ZIP (Quick Start)

### Prerequisites (Release ZIP)

- Google Chrome or a Chromium-based browser that supports extensions
- Ability to download files from GitHub Releases

### Steps (Release ZIP)

1. **Download the packaged build:**

    - Visit the [GitHub Releases](https://github.com/jason-merrell/grok-auto-retry/releases)
    - Download the latest asset ending with `-dist.zip`

1. **Extract the ZIP:**

    - Unzip the archive to a convenient location (e.g., `~/Downloads/grok-auto-retry-dist`)

1. **Open the Chrome Extensions page:**

    - Go to `chrome://extensions/`
    - Or click the puzzle icon → "Manage Extensions"

1. **Enable Developer Mode:**

    - Toggle the "Developer mode" switch in the top-right corner

1. **Load the extracted build:**

    - Click "Load unpacked"
    - Select the unzipped folder (it should contain the built `manifest.json`)
    - The extension should now appear in your extensions list

1. **Verify installation:**

    - Navigate to <https://grok.com/imagine> or <https://grok.com/imagine/post/*>
    - You should see the control panel in the bottom-right corner

## Option B (Recommended): Build Locally and Load Unpacked

### Prerequisites (Local Build)

- Node.js 18 or newer
- npm (bundled with Node.js)
- Git (optional, but makes cloning easier)
- Google Chrome or a Chromium-based browser that supports extensions

### Steps (Local Build)

1. **Install dependencies & build:**

    ```bash
    cd extension
    npm install
    npm run build
    ```

1. **Open the Chrome Extensions page:**

    - Go to `chrome://extensions/`
    - Or click the puzzle icon → "Manage Extensions"

1. **Enable Developer Mode:**

    - Toggle the "Developer mode" switch in the top-right corner

1. **Load the local build:**

    - Click "Load unpacked"
    - Select the `extension/dist` folder you just built

1. **Verify installation:**

    - Navigate to <https://grok.com/imagine> or <https://grok.com/imagine/post/*>
    - You should see the control panel in the bottom-right corner

## Appendix: Installing Node.js and npm

If you need to install Node.js (which includes npm), follow the instructions for your operating system:

- **macOS (Homebrew):**

    ```bash
    brew update
    brew install node
    ```

- **macOS / Windows / Linux (Official Installer):**

    1. Visit <https://nodejs.org/>.
    2. Download the "LTS" installer for your platform.
    3. Run the installer and follow the prompts.
    4. Restart your terminal after installation so the new `node` and `npm` commands are available.

- **Windows (winget):**

    ```powershell
    winget install OpenJS.NodeJS.LTS
    ```

- **Linux (Debian/Ubuntu):**

    ```bash
    sudo apt update
    sudo apt install nodejs npm
    ```

After installation completes, verify the tools are available:

```bash
node --version
npm --version
```

Both commands should print version numbers (for example, `v20.11.0` for Node.js).
