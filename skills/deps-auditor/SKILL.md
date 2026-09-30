---
name: deps-auditor
description: >-
  Audit the dependencies that changed between two git refs. Given a start and an end commit,
  tag, branch or SHA, it diffs every package.json in the tree, resolves each changed package's
  upstream repository from the npm registry, reads its changelog file, its published release notes
  and the commits in the range from GitHub, GitLab or Bitbucket, and reports what each upgrade
  changed with a BREAKING / ACTION REQUIRED flag per dependency. Use when reviewing a dependency
  bump, a Dependabot or Renovate merge, a monorepo upgrade or a release range, or when asked what
  changed between two versions of the dependencies.
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

## 2. Fetch the upstream notes

Pipe step 1 into the fetcher:

```bash
<skill-dir>/scripts/audit-deps --from <ref> --to <ref> | <skill-dir>/scripts/fetch-changelog
```

It resolves each package's repository from the npm registry — the only source — then reads the
changelog file, the release notes and the commits in the range, and prints one `results` entry per
dependency holding the sources themselves plus evidence about them. Do not construct a URL or a
`curl` command yourself. Each host addresses a repository differently, and GitLab's in particular
needs a path percent-encoded: a file that exists at `docs/CHANGELOG.md` answers 404 unless the
slash is `%2F`, which is indistinguishable from a repository that published no changelog at all.

The supported hosts are github.com, gitlab.com and bitbucket.org. A repository on any other host,
or on a self-hosted or enterprise instance of one of these, is reported rather than fetched.

Candidates are tried in order and the first hit wins: `CHANGELOG.md`, `changelog.md`, `CHANGELOG`,
`HISTORY.md`, `History.md`, `CHANGES.md`, `NEWS.md`, `RELEASES.md`, then `CHANGELOG-<major>.md` for
each major the range crosses. When the file is named something none of those cover — monit ships
`CHANGES` with no extension — pass the path for that package and pipe again:

```bash
<skill-dir>/scripts/audit-deps --from <ref> --to <ref> | <skill-dir>/scripts/fetch-changelog --file 'monit=CHANGES'
```

Read `status` on each result:

| `status` | what it means |
| --- | --- |
| `fetched` | at least one source returned content; judge whether it covers the range |
| `no-changelog` | every source was read and none of them carries anything about the range |
| `no-fetch-path` | no usable `repository.url`, or an unsupported host; `reason` says which |
| `fetch-failed` | a source could not be read; `changelog.status`, `releases.status` and `commits.status` hold the code |
| `unclassified` | the range carries no comparable version, so nothing was fetched |

A `no-fetch-path` result carries `reason` — `no-repository`, `unusable-url` or `unsupported-host` —
and the `repositoryUrl` the registry gave, which is the link to show for it. `releases` is `null`
on Bitbucket, which publishes none, and `commits` is `null` there too, as on any package whose
from or to version carries no tag.

## 3. Judge what you fetched

The fetcher reports what it found; it does not decide what counts as coverage. That reading is
yours, and it is the step the whole design is built to keep. There are three sources, and a range is
covered when any one of them accounts for it — in the order below, since the first two are written
for a reader and the third is not. Each result carries:

- `changelog.versionsFound` — the versions its markdown headings name
- `changelog.packageMentioned` — whether the file ever names the package you asked about
- `changelog.sliced` — whether `changelog.content` was cut down to the range
- `releases.entries` — the releases inside the range, each with its `tag`, `version` and `body`
- `releases.entries[].linkShare` — how much of that body is link, from 0 to 1
- `releases.truncated` — whether the host had more releases than the walk read
- `commits.entries` — the commits between the two tags, each with a `subject` and a `breaking`
  value when its message carries a `BREAKING CHANGE:` trailer
- `commits.truncated` — whether the range held more commits than the walk read

`commits` is the fallback, not the main course. A release body and a changelog entry are written
for a reader; a commit subject is written for a reviewer of that one commit, and it carries the
merge, the lockfile and the CI noise alongside the fix. Reach for it when the first two sources came
back empty or pointed somewhere else — a repository that tags a release without publishing notes for
it, a release body that is nothing but a link, a changelog file that turns out to describe the
repository rather than the package. When a release body does carry the notes, summarise that and
leave the commits alone: zod's 4.4.3 to 4.5.4 ships 58k characters of release notes and 214 commits,
and the notes are the account of the release.

A `breaking` value is a conventional-commit `BREAKING CHANGE:` trailer, which is the author's own
declaration of a breaking change — a `!` after a type in the subject says the same thing more
quietly. A subject that only touches dependencies, formatting or the pipeline is not a change to
report, and a range of a hundred commits is a handful of changes wearing a hundred hats.

A source existing is not proof that it covers the range, so confirm what you got carries
substantive content for versions inside it. Common ways it does not:

- `packageMentioned` is false. The URL pointed at a repository whose changelog describes the
  repository, not the package — every `@types/*` package, which resolves to DefinitelyTyped, is
  this case. Treat it as having no changelog rather than summarising unrelated entries, unless the
  commits place the package in the range.
- `linkShare` is high. The release body points at a blog post or a changelog file instead of
  carrying the notes, as TypeScript's and GitLab Runner's do. The notes are somewhere else; read the
  commits for the range or find them.
- `truncated` is true. Releases or commits past the walk's bound were never read, so the range may
  have more coverage behind them than the entries show. Say so rather than reporting the walk as
  complete.
- `sliced` is false. No heading range could be isolated, so the whole file is present and the
  versions in the range have to be found by reading it.
- The file holds only an "Unreleased Changes" section, as Express's `History.md` does, or a release
  body is empty.

Release tags vary (`v1.2.3`, `1.2.3`, `pkg@1.2.3`) and the version in each is compared numerically,
so a shared prefix is no longer a bound: the `v5.` tags of a package currently on 5.9 do not all
fall inside a 5.6 ceiling. A prerelease tag stays a prerelease when the range calls for one, and is
otherwise left out: `v5.4-beta` is a build that `~5.4.2` never installs, not a 5.4.0 release.

**Only when no source covers the range** — no changelog entry, no release note and not one commit
between the two tags — the package goes in the "No changelog found" section with the compare link
the result carries, and no summary. That section is a statement that nothing was found, so a range
you have not read to the bottom does not belong in it: read the commits before you put a package
there.

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

## No fetch path

- `<name>` `<from>` → `<to>` — [<host>](<repositoryUrl>) · <reason>

## No changelog found

- `<name>` `<from>` → `<to>` — [compare](<links.compare>)
```

Omit a section when it has no entries. A dependency whose fetch failed is not the same as one with
no changelog: report the error against it rather than listing it as undocumented. A null
`links.compare` means no tag carries that version, so link `repositoryUrl` instead.

With `--out PATH`, write that markdown to `PATH` and print only the header line and a table of
name, range and flag to stdout. Without it, print the whole report and write nothing.

## Limits

- The audit is built from `package.json` alone. A dependency that moved in the lockfile without a
  manifest change is invisible to it.
- Only github.com, gitlab.com and bitbucket.org are read. A package on Codeberg, Gitea, a
  self-hosted GitLab or an enterprise instance of a supported forge has no fetch path.
- Bitbucket publishes no release notes, has no compare view and no commit range to read, so a
  Bitbucket dependency is read from its changelog file alone and its "No changelog found" entry
  links the repository.
- A commit range is read up to 2000 commits, so a jump spanning a longer history than that reports
  `commits.truncated` rather than pretending to be the whole range. React 17.0.2 to 18.3.1 is 1422
  commits and reads whole; a jump across a decade of a busy repository does not.
- A compare link is built from the repository's own tag names, and is `null` when a version was
  never published as a tag — TypeScript has no `v5.0.0`, so an audit from `~5.0.0` carries none.
  Link `repositoryUrl` in place of a null one rather than writing `[compare](null)`.
- A changelog is read from the default branch, not from the tag matching the audited version, so a
  repository that rewrites its changelog after a release makes the audit non-reproducible.
- A host that answers 404 for a private repository to an anonymous caller cannot be told apart from
  one that has no such repository, so a private package may be reported as undocumented. Set
  `GITLAB_TOKEN` or `BITBUCKET_TOKEN` to read a private one.
- A package published from a monorepo shares its repository's commit range with every sibling, so
  the commits between the two tags describe the whole release and not only this package. Keep the
  entries that name the package or its area, and say so when a range is too shared to attribute.
  `@types/*`, which resolves to DefinitelyTyped, has no changelog and no release of its own at all.
- `peerDependencies` are not audited.
- The changelog slice starts from the declared range's floor, which under a caret or tilde can sit
  below the version that was actually installed, so the range covered is a superset of what
  changed.
