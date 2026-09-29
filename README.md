# deps-auditor

An agent skill that audits what changed when dependencies are upgraded between two git refs.

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

With [skills.sh](https://skills.sh), which installs the skill into whichever agents you name:

```bash
npx skills add ilteoood/deps-auditor             # pick the agents interactively
npx skills add ilteoood/deps-auditor --all       # every detected agent, no prompts
npx skills add ilteoood/deps-auditor -g -a claude-code   # globally, for Claude Code only
```

`npx skills remove deps-auditor` takes it back out.

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

Auditing `package.json` alone means a lockfile-only dependency move is invisible ([ADR
0001](docs/adr/0001-manifest-diff-over-lockfile.md)). The skill's own
[Limits](skills/deps-auditor/SKILL.md#limits) cover changelog coverage, monorepo-published
packages and `peerDependencies`.

## Development

`skills/deps-auditor/` is what ships; `test/` and `docs/` stay in the repository. The diff logic is
dependency-free CommonJS split into one module per domain under `skills/deps-auditor/scripts/lib/`,
with `scripts/audit-deps` as a thin entry point that wires them together and prints the JSON; the
fetch and summarise steps are instructions the model follows.

| Module | Owns |
| --- | --- |
| `lib/cli.js` | argument parsing and its failures |
| `lib/git.js` | running git, resolving refs, reading a file at a ref |
| `lib/manifest.js` | `package.json` shape and which sections count |
| `lib/version.js` | version parsing, comparison, and upgrade vs downgrade |
| `lib/changes.js` | cross-manifest aggregation and dedupe |

Every module throws; the entry point is the only place that catches and reports.

```bash
test/audit-deps.js   # builds a fixture repo and asserts on its output
node --check skills/deps-auditor/scripts/lib/version.js
```

`scripts/audit-deps` also runs on its own and prints the same JSON the skill consumes, which is the
fastest way to see what a given ref range looks like:

```bash
skills/deps-auditor/scripts/audit-deps --from v1.0.0 --to v2.0.0
```

## License

[MIT](LICENSE)

