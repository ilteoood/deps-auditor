# deps-auditor

A Claude Code skill that audits what changed when dependencies are upgraded between two git refs.

Given a start and an end ref it diffs every `package.json` in the tree, resolves each changed
package's upstream repository from the npm registry, reads its changelog, and reports what the
upgrade actually did — with a `BREAKING` / `ACTION REQUIRED` flag per dependency.

```
/deps-auditor --from v1.2.0 --to v2.0.0
/deps-auditor --from HEAD^ --to HEAD --out upgrade-report.md
```

`--from` and `--to` are required and each accepts a commit hash, tag or branch. `--out` is
optional: give it a path and the report is written there with only a status table on stdout, leave
it off and the report is printed in the conversation.

## Install

Copy the skill directory into wherever Claude Code looks for skills.

```bash
# for every project
cp -r .claude/skills/deps-auditor ~/.claude/skills/

# or for one project
cp -r .claude/skills/deps-auditor /path/to/project/.claude/skills/
```

The skill needs `git`, `node` and `jq` on the path, and `gh` authenticated for private
repositories.

## What it reports

For each changed dependency: the old and new range, which manifests declare it, up to three
bullets of what changed, and a `BREAKING` or `ACTION REQUIRED` flag when the changelog itself
declares one. Dependencies with no published changelog are listed with a compare link rather than
guessed at. Downgrades are reported in their own section.

A range that jumps several majors covers every release in between, not just the endpoints — a
1.x to 3.x jump still surfaces what 2.0.0 broke.

## Limits

- Built from `package.json` alone, so a lockfile-only dependency move is invisible. See
  [ADR 0001](docs/adr/0001-manifest-diff-over-lockfile.md).
- Packages published from a monorepo — `@types/*` above all — have no changelog of their own and
  land in "No changelog found".
- No release-notes fallback for non-GitHub hosts, and no fetch path for a package with no
  `repository.url`.
- `peerDependencies` are not audited.

## Development

The diff logic is dependency-free CommonJS split into one module per domain under
`scripts/lib/`, with `scripts/audit-deps` as a thin entry point that wires them together and prints
the JSON; the fetch and summarise steps are instructions the model follows.

| Module | Owns |
| --- | --- |
| `lib/cli.js` | argument parsing and its failures |
| `lib/git.js` | running git, resolving refs, reading a file at a ref |
| `lib/manifest.js` | `package.json` shape and which sections count |
| `lib/version.js` | version parsing, comparison, and upgrade vs downgrade |
| `lib/changes.js` | cross-manifest aggregation and dedupe |

Every module throws; the entry point is the only place that catches and reports.

```bash
.claude/skills/deps-auditor/test/audit-deps.js   # builds a fixture repo and asserts on its output
node --check .claude/skills/deps-auditor/scripts/lib/version.js
```

`scripts/audit-deps` also runs on its own and prints the same JSON the skill consumes, which is the
fastest way to see what a given ref range looks like:

```bash
.claude/skills/deps-auditor/scripts/audit-deps --from v1.0.0 --to v2.0.0
```

Vocabulary is defined in [CONTEXT.md](CONTEXT.md).
