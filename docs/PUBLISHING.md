# Publishing

This repository is configured for `https://github.com/goldenfishs/all-in-copilot`.

Before publishing to the VS Code Marketplace, confirm these values:

- `package.json -> publisher`
- `package.json -> repository`
- `package.json -> homepage`
- `package.json -> bugs`

## Marketplace Setup

1. Create a publisher in the Visual Studio Marketplace publisher portal.
2. Create an Azure DevOps Personal Access Token with `Marketplace: Manage`.
3. Add the PAT to GitHub repository secrets as `VSCE_PAT`.
4. Change `publisher` in `package.json` from `local` to your Marketplace publisher ID. If you create a Marketplace publisher named `goldenfishs`, use `"publisher": "goldenfishs"`.

## Manual Publish

```bash
npm install
npm run check
npm run package:strict
npx vsce publish -p <VSCE_PAT>
```

## Automated Publish

The workflow in `.github/workflows/publish.yml` publishes when you push a tag like `v0.0.10`.
The tag version must match `package.json -> version`, and `publisher` must be a real Marketplace publisher ID.

```bash
npm version patch
git push
git push --tags
```

Do not publish the same version twice. VS Code Marketplace rejects duplicate versions.

## Before First Public Release

- Replace `publisher: "local"` with your publisher ID.
- Confirm the GitHub repository URL is correct.
- Review `README.md` for project name and trademark wording.
- Confirm no local `.vsix`, `.codex-vscode`, `.backup-extensions`, or API keys are staged.
