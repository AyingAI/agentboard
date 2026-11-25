# Security Policy

AgentBoard stores boards, activity, and API settings in the browser's `localStorage`. API keys are accessible to the local browser profile and scripts running on the app's origin. Use a trusted browser profile and deployment.

## API connections

API mode sends your prompt and board context to your configured service. Whole-board insights include the complete body of every card. The connection test uses a fixed example. Model discovery sends credentials to the configured provider's models endpoint.

API requests require HTTPS, with HTTP supported for loopback addresses. AgentBoard omits browser cookies and referrers on API requests and rejects redirects. When you change the provider or effective Base URL in settings, enter the corresponding API key again.

## Local CLI bridge

Run the Vite server on `127.0.0.1` or `localhost`. The CLI bridge checks the loopback connection, Host, and browser origin, and limits the size of JSON request bodies. The bridge is available through the development server.

A CLI run uses the installed executable and its local credentials and permissions. The CLI can use the tools and services available to it and may retain its own logs. The board's patch permissions govern changes to the board.

## Interactive visuals

Visual scripts run in sandboxed frames with opaque origins. A dedicated message port provides visual state to the original frame document. The iframe has no direct access to host storage, and its API can draft an agent request for user review. The frame's Content Security Policy restricts network APIs and embedded resources. Allowed CDN scripts can make requests to those CDNs, and a frame can navigate itself. Import boards and run visual scripts from sources you trust.

## Sharing

Review exports, screenshots, and traces before sharing. Markdown and JSON exports can contain board goals, card text, source URLs, and visual state. JSON backups also include the visual source. The board export includes the board and its title. API settings and activity history live separately in the browser.

Keep keys, local credentials, `.env` files, exported browser storage, and private board data out of commits and public issues.

## Reporting issues

Use GitHub private vulnerability reporting where available. If it is unavailable, ask the maintainer for a private reporting channel before sharing credentials, personal data, or reproduction details.
