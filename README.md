# Reverse Engineer Anything Workspace

This repository is configured to run **REA (Reverse Engineer Anything)** in GitHub Codespaces or any Linux environment with Node.js 24.11+.

Upstream project: https://github.com/morluto/rea

## Open in Codespaces

1. Open this repository on GitHub.
2. Click **Code → Codespaces → Create codespace on main**.
3. Wait for the dev container to finish. It automatically runs `npm install` and installs the pinned `rea-agents` package.

## First-time REA setup

For a browser-based GitHub Codespace using VS Code, run:

```bash
npm run rea:setup:vscode
```

For Codex, run:

```bash
npm run rea:setup:codex
```

Or use the interactive client picker:

```bash
npm run rea:setup
```

REA shows the proposed configuration changes before applying them. Restart the selected agent/client after setup if REA asks you to.

Then verify the client:

```bash
npm run rea:doctor:vscode
# or
npm run rea:doctor:codex
```

For a general readiness report:

```bash
npm run rea:doctor
```

## Start the MCP server manually

```bash
npm run rea:mcp
```

REA's MCP transport is intended for an MCP client/agent. It is not a normal website, so there is no browser port to forward just for the MCP server.

## Analyze a JavaScript / Electron target

Put the extracted target under `targets/` (the folder contents are ignored by git), then run:

```bash
npm run rea:analyze:js -- /workspaces/reverse/targets/YOUR_APP --json
```

You can also call the REA CLI directly:

```bash
npm run rea -- --help
```

## Native binaries

Native binary analysis needs a supported analysis provider such as Ghidra, Hopper, or IDA. The REA package is installed here, but those larger third-party tools are intentionally not bundled into this repository.

## Repository scripts

| Command | Purpose |
| --- | --- |
| `npm run rea:setup:vscode` | Configure REA for VS Code/Codespaces |
| `npm run rea:setup:codex` | Configure REA for Codex |
| `npm run rea:setup` | Interactive REA client setup |
| `npm run rea:doctor` | Check general REA readiness |
| `npm run rea:doctor:vscode` | Check VS Code REA readiness |
| `npm run rea:doctor:codex` | Check Codex REA readiness |
| `npm run rea:mcp` | Start the REA MCP server |
| `npm run rea:analyze:js -- <path> --json` | Analyze an extracted JS/Electron application |
| `npm run rea -- --help` | Open the full REA CLI help |

## Notes

Only reverse engineer software, services, or systems you own or are authorized to inspect. Keep proprietary binaries and extracted application contents out of the public repository; `targets/` is ignored for that reason.
