---
name: deps-auditor
description: >-
  Audit the dependencies that changed between two git refs. Given a start and an end commit,
  tag, branch or SHA, it diffs every package.json in the tree, resolves each changed package's
  upstream repo from the npm registry, reads whichever of its changelog file or published release
  notes actually covers the range, and reports what each upgrade changed with a BREAKING /
  ACTION REQUIRED flag per dependency. Use when reviewing a dependency bump, a Dependabot or
  Renovate merge, a monorepo upgrade or a release range, or when asked what changed between two
  versions of the dependencies.
disable-model-invocation: true
---

# deps-auditor

Produces one short summary per dependency upgraded between two git refs.

`--from` and `--to` are both required. Each accepts a commit hash, tag or branch. Only committed
state is audited; the working tree is not a valid endpoint. `--out PATH` is optional.

```
/deps-auditor --from <ref> --to <ref> [--out <path>]
```

Resolve `<skill-dir>` below to this skill's base directory.

## 1. Detect the changes

```bash
<skill-dir>/scripts/audit-deps --from <ref> --to <ref>
```

It prints JSON on stdout: the resolved commits, how many manifests were compared, and a `changes`
array. Every entry has `name`, `kind`, `from`, `to`, `fromVersion`, `toVersion`, `sections` and
`manifests`. A package bumped in several workspaces appears once, spanning the lowest `from` and
the highest `to`.

`kind` is one of `upgrade`, `downgrade`, `range-only` (the range moved but the version did not) or
`unclassified` (a protocol such as `workspace:` carries no comparable version).

If `changes` is empty, stop and say that no dependency changed between the two refs.

## 2. Resolve the upstream repository

```bash
npm view <package> repository.url --json
```

The registry is the only source. Normalise the result to `owner/repo` by stripping a leading
`git+`, a `git@` prefix, any `://…/` authority, and a trailing `.git`. If the field is missing,
unusable, or not a github.com URL, the package has no fetch path — send it straight to the
"No changelog found" section.

The URL is not proof that the repo's changelog covers this package. A package published from a
monorepo — `@types/*` resolves to DefinitelyTyped, for instance — points at a repository whose
changelog describes the repository, not the package. If the fetched changelog never mentions the
package you asked about, treat it as having no changelog rather than summarising unrelated
entries.

## 3. Fetch the changelog

Most packages publish no changelog file at all and keep their notes on GitHub releases, so treat
the two sources as equals and read whichever covers the range.

**Changelog file.** Try each candidate filename in this order, stopping at the first that exists:

```
CHANGELOG.md  changelog.md  CHANGELOG  HISTORY.md  History.md  CHANGES.md  NEWS.md  RELEASES.md
```

Also try `CHANGELOG-<major>.md` variants when a repository splits its history by major.

```bash
gh api repos/<owner>/<repo>/contents/CHANGELOG.md -H 'Accept: application/vnd.github.raw'
```

`gh api` is authenticated, so private repositories work; `raw.githubusercontent.com` does not.
It exits 1 on a miss and 0 on a hit, so the candidate loop ends at the first command that exits 0.
If the contents API refuses the file as too large, take `.download_url` from the same call and
fetch that instead. A directory path returns a JSON listing rather than a file, so a path that
turns out to be a folder is not a hit.

**Release notes.**

```bash
gh api --paginate 'repos/<owner>/<repo>/releases?per_page=100' | jq -s 'add'
```

Always paginate. A single page of 100 reaches back only as far as the last hundred releases, so
without it a dependency with a long history looks like it has no notes when its range is simply
older than the page. `jq -s 'add'` merges the pages into one array; `gh`'s own `--slurp` cannot be
combined with `--jq`.

Tag names vary (`v1.2.3`, `1.2.3`, `pkg@1.2.3`); read the first version-looking token in each and
keep the ones that fall inside `(fromVersion, toVersion]`. A shared prefix is not a bound — the
`v5.` tags of a package currently on 5.9 include releases well above a 5.6 ceiling.

**Judge what you fetched.** Neither source existing is proof that it covers the range, so confirm
what you got carries substantive content for versions inside it. Common ways it does not: the file
exists but holds only an "Unreleased Changes" section, as Express's `History.md` does; the release
body is a link to a blog post rather than the notes themselves, as TypeScript's are; or the body is
empty. Read the other source rather than summarising whatever is there.

**If neither source covers the range**, the package goes in the "No changelog found" section with a
compare link and no summary:

```
https://github.com/<owner>/<repo>/compare/<fromVersion>...<toVersion>
```

## 4. Summarise each dependency

The range in scope is `(fromVersion, toVersion]` — everything published after the old version, up
to and including the new one. A jump from 1.x to 3.x must still surface 2.0.0's breaking changes;
only the endpoints are never enough. When a changelog is too long to read closely, keep every
major and fold patch and minor noise into a single bullet.

Per dependency, write at most three bullets covering only what changed, and one flag line
**before** them when the changelog itself declares a breaking change or prescribes a migration:

```
**BREAKING** — <what the changelog says changed incompatibly>
**ACTION REQUIRED** — <the migration the changelog tells readers to perform>
```

Derive both from the changelog's own wording. If it does not say a change is breaking, do not
claim that it is. Report every dependency the same way: no special treatment for type packages,
linters, bundlers or test frameworks, even when the changelog has nothing relevant to say.

## 5. Write the report

In English. Order the main section with major bumps first, then everything else, alphabetical
within each group.

```markdown
# Dependency audit <from>..<to>

`<fromCommit7>..<toCommit7>` — <N> changed across <M> manifests: <U> upgrades, <D> downgrades, <R> range-only, <X> unclassified.

## <name>  <from> → <to>

`dependencies` · `package.json`, `packages/ui/package.json`

**BREAKING** — <one line>
- <bullet>
- <bullet>
- <bullet>

## Downgrades

## Range-only changes

## Unclassified changes

## No changelog found

- `<name>` `<from>` → `<to>` — [compare](https://github.com/<owner>/<repo>/compare/<fromVersion>...<toVersion>)
```

Omit a section when it has no entries.

With `--out PATH`, write that markdown to `PATH` and print only the header line and a table of
name, range and flag to stdout. Without it, print the whole report and write nothing.

## Limits

- The audit is built from `package.json` alone. A dependency that moved in the lockfile without a
  manifest change is invisible to it.
- Non-GitHub hosts have no release-notes fallback, and a package with no `repository.url` has no
  fetch path at all.
- Packages published from a monorepo, `@types/*` above all, have no changelog of their own and
  land in the "No changelog found" section.
- `peerDependencies` are not audited.
- The changelog slice starts from the declared range's floor, which under a caret or tilde can sit
  below the version that was actually installed, so the range covered is a superset of what
  changed.
