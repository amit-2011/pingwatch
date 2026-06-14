# Releasing PingWatch (P4.1)

PingWatch ships two ways from one monorepo: a published **npm package** (`pingwatch`) and a
**multi-arch Docker image** (`ghcr.io/amit-2011/pingwatch`). Both are produced by the tag-driven
[`.github/workflows/release.yml`](.github/workflows/release.yml).

## Cutting a release

1. Bump and push a tag:
   ```bash
   git tag v0.4.0 && git push origin v0.4.0
   ```
   (or run the **release** workflow manually with an explicit version).
2. CI then runs two jobs:
   - **npm-publish** — builds the monorepo, syncs all package versions, and `pnpm -r publish`es.
   - **docker** — `docker buildx` a `linux/amd64,linux/arm64` image pushed to GHCR.

Secrets: `NPM_TOKEN` (npm automation token). GHCR uses the built-in `GITHUB_TOKEN`.

## npm: publish the workspace, not one fragile tarball

The user installs **`pingwatch`** (`npx pingwatch`). That package is `apps/server` (renamed from
`@pingwatch/server`), and it depends on five libraries via `workspace:*`:
`@pingwatch/shared`, `@pingwatch/db`, `@pingwatch/monitor-core`, `@pingwatch/notifications`,
`@pingwatch/web` (the last ships its built `.next`). All six are published together by
`pnpm -r publish`, which **rewrites `workspace:*` → the real version** at publish time.

Why this and not a single self-contained tarball: this stack has genuine **version conflicts**
(zod 3.24 in the server vs 3.25 in web, multiple Prisma engine versions) and **arch-specific native
modules** (`better-sqlite3`, Prisma's schema-engine). Bundling everything into one tarball forces
one version per package and one arch's binaries, which npm's install-time dedup then breaks. Letting
npm resolve the published tree instead means each dependency installs itself correctly:
`better-sqlite3` runs its `prebuild-install` for the user's CPU, and Prisma fetches the matching
schema-engine — the real multi-arch story. (Prisma's query engine is gone in v7 / driver adapters;
argon2 is WASM via `hash-wasm`; so `better-sqlite3` + the schema-engine are the only native pieces.)

`scripts/set-version.mjs <version>` sets the shared version across all six packages before publish.

## Docker: the verified, self-contained path

The image takes the simpler route — `pnpm deploy --prod --legacy` prunes to just the server + its
inlined workspace/prod deps under `/app/out` (the isolated linker's symlinks resolve fine inside the
image), and `docker buildx` builds each platform natively/emulated so the prebuilds match the target
arch. Verified locally end-to-end: `docker build` → `docker run` → migrations apply, `/api/health`
is ok, the dashboard renders.

```bash
docker build -t pingwatch .
docker run -p 3001:3001 -v pingwatch-data:/data \
  -e PINGWATCH_SECRET=$(openssl rand -hex 24) pingwatch
```

The zero-config default is untouched: same embedded Nest + Next process on port 3001,
`pingwatch start`, default `~/.pingwatch` data dir, auto-created SQLite WAL DB + `secret.key`.
Postgres / Redis / SSO / KMS all stay opt-in via env.
