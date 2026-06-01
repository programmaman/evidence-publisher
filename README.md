# evidence-publisher

Standalone GitHub project wrapper for the `@rakelabs/evidence-publisher` npm package.

## Project layout

- `npm/` — the publishable npm package source, build output, and README.

## GitHub repo intent

This folder is structured so `sdk/evidence` can be pushed as its own repository:

- GitHub repository: `https://github.com/programmaman/evidence-publisher`
- npm package: `@rakelabs/evidence-publisher`

## Working in this repo

From the repository root (`sdk/evidence`), the npm package itself lives in `npm/`.

### Install

```sh
cd npm
npm ci
```

### Build

```sh
cd npm
npm run build
```

### Check the publish artifact

```sh
cd npm
npm pack --dry-run
```

## Notes

- The committed `npm/package.json` is intentionally the public-facing manifest.
- Local-only test/dev overlay config belongs in the ignored `npm/package.local.json` file.
- The package README with full usage documentation lives at `npm/README.md`.