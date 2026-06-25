# Security Policy

AgentBoard is currently a local-first prototype.

## Secrets

Do not commit API keys, local credentials, `.env` files, exported browser storage, or generated artifacts that may contain private data.

API keys entered in the UI are stored in browser `localStorage`. Treat the browser profile and local machine as trusted local state.

## Local CLI Bridge

The local CLI bridge is exposed by the Vite development server and is intended for local development only. It can execute supported local agent CLIs on your machine, so do not expose the dev server to an untrusted network.

## Reporting Issues

Please report security issues through GitHub issues if they are low risk. If the issue involves secrets, credential leakage, or a practical exploit path, avoid posting sensitive details publicly; open a minimal issue asking for a private disclosure path.
