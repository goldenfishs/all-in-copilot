# Security Policy

## Supported Versions

Security fixes are provided for the latest published version.

## Reporting a Vulnerability

Please do not open a public issue for secrets, credential leakage, or request-signing problems.

Report privately through GitHub Security Advisories after the repository is created, or contact the maintainer listed in the repository profile.

## Secret Handling

All in Copilot stores API keys in VS Code SecretStorage. The project should not log, persist, or commit API keys. When reporting bugs, remove:

- API keys and bearer tokens
- Provider-specific secret headers
- Private base URLs
- Chat transcripts containing sensitive data
