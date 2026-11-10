# Security Policy

AgentBoard is currently a local-first prototype.

## Secrets

Do not commit API keys, local credentials, `.env` files, exported browser storage, or generated artifacts that may contain private data.

API keys entered in the UI are stored in browser `localStorage`. Treat the browser profile and local machine as trusted local state.

API mode sends the prompt and relevant board context to the configured model endpoint. Optional Jev review sends the goal, constraints and relevant material to TypeSafe. Use trusted endpoints and review the information you put on a board. Exports contain card content and visual state.

## Local CLI Bridge

Run the Vite server on `127.0.0.1` or `localhost`. The CLI and Jev endpoints check the loopback connection, Host and browser origin. JSON request bodies have size limits. The CLI bridge is available only in the development server and runs installed executables with their local permissions and credentials. Foreground CLI tasks can use the selected CLI's tools. Background analysis uses a narrower execution profile.

## Interactive visuals

Visual scripts run in sandboxed frames with opaque origins. A dedicated message port carries host state to the original frame document. The frame cannot access host storage or submit an Agent run, and its CSP restricts network APIs and embedded resources. Allowed CDN scripts can make script requests, and a frame can navigate itself. Import boards and use scripts from sources you trust.

## Reporting Issues

Use GitHub private vulnerability reporting where available. If it is unavailable, ask the maintainer for a private reporting channel before sharing credentials, personal data or exploit details.
