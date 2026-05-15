# Contributing

Thanks for helping improve All in Copilot.

## Development

```bash
npm install
npm run compile
```

Open the folder in VS Code and start the extension host with `Run Extension`.

## Local Packaging

```bash
npm run package
```

This creates a `.vsix` file in the repository root. Generated `.vsix` files are ignored by Git.

## Pull Requests

- Keep changes scoped to one feature or fix.
- Run `npm run check` before opening a pull request.
- Do not commit API keys, `.vsix` files, `.codex-vscode`, `node_modules`, or generated `out` files.
- Update `README.md` or `CHANGELOG.md` when behavior changes.

## Coding Style

- TypeScript source lives in `src/`.
- Keep provider protocol code isolated in `openai.ts`, `anthropic.ts`, and `adapters.ts`.
- Keep VS Code contribution and activation logic in `extension.ts` and `provider.ts`.
- Keep the sidebar webview in `modelView.ts`.
