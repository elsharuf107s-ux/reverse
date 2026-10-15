# REA Workbench

A GitHub Codespaces workstation for **REA (Reverse Engineer Anything)** with a browser UI and Ghidra native-binary analysis.

Upstream REA: https://github.com/morluto/rea

## What is included

- Ubuntu 24.04 Codespace
- Node.js 24.11
- `rea-agents` 6.5.0
- Ghidra 12.1.4
- OpenJDK 21
- VS Code MCP registration for REA
- Browser dashboard on port **3000**
- Local `targets/` directory for files being inspected
- Local `analysis-output/` directory for complete JSON evidence/results

## Start it

Because the devcontainer changed, rebuild your Codespace (or make a new one from `main`).

In VS Code/Codespaces:

1. Press **Ctrl+Shift+P**.
2. Run **Codespaces: Rebuild Container**.
3. Let the post-create bootstrap finish. The first build downloads Ghidra, which is roughly 570 MB.
4. Port **3000** is forwarded automatically and should open the **REA Workbench** UI.

If the browser does not open automatically, use the **Ports** tab and open port `3000`.

The UI can also be started manually:

```bash
npm run ui
```

## Use the browser UI

The dashboard lets you:

1. Upload a target into `targets/`.
2. Select the target.
3. Run one of the supported REA workflows:
   - Native overview
   - Native inspection
   - Search
   - Function dossier
   - Decompile
   - Instructions
   - Xrefs
   - Trace
   - JavaScript / Electron static analysis
4. Read a result preview in the browser.
5. Download the complete JSON result generated under `analysis-output/`.

The web server uses a fixed allowlist of REA operations; it is not an arbitrary web shell.

## Native analysis

The Codespace bootstrap installs the exact Ghidra/JDK combination used by current REA verification:

```text
GHIDRA_INSTALL_DIR=/opt/ghidra_12.1.4_PUBLIC
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
REA_ANALYSIS_PROVIDER=ghidra
```

Check readiness from the terminal:

```bash
npm run rea:doctor
npm run rea:providers
```

Analyze a native binary directly:

```bash
npm run rea -- analyze /workspaces/reverse/targets/program --provider ghidra --json
```

Decompile a known procedure:

```bash
npm run rea -- decompile /workspaces/reverse/targets/program main --provider ghidra --json
```

## JavaScript / Electron analysis

For an extracted JavaScript/Electron application or ASAR:

```bash
npm run rea:analyze:js -- /workspaces/reverse/targets/app.asar --json
```

JavaScript static analysis does not require Ghidra.

## MCP / AI-agent use

The bootstrap attempts to register REA with the VS Code MCP configuration automatically:

```bash
npm run rea:setup:vscode
```

After the first successful bootstrap, reload the VS Code/Codespaces window so the MCP client can reconnect.

Verify it with:

```bash
npm run rea:doctor:vscode
```

For Codex:

```bash
npm run rea:setup:codex
npm run rea:doctor:codex
```

You can also launch the MCP server directly:

```bash
npm run rea:mcp
```

## Important directories

```text
targets/          files/apps you are inspecting (gitignored)
analysis-output/  REA JSON results, UI log and diagnostics (gitignored)
public/           browser dashboard
scripts/          Codespace bootstrap/start scripts
server.mjs        local dashboard API
```

## Safety / authorization

Only reverse engineer software, services, or systems you own or are authorized to inspect. The repository is public, so do not commit proprietary binaries or extracted application contents. `targets/` and `analysis-output/` are ignored by git by default.
