# deps-auditor

An agent skill that audits what changed when dependencies are upgraded between two git refs.

Given a start and an end ref it diffs every `package.json` in the tree, resolves each changed
package's upstream repository from the npm registry, reads its changelog file or published release
notes from GitHub, GitLab or Bitbucket, and reports what the upgrade actually did — with a
`BREAKING` / `ACTION REQUIRED` flag per dependency.

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

The skill needs `git` and `node` on the path, and `gh` authenticated for private GitHub
repositories. Set `GITLAB_TOKEN` or `BITBUCKET_TOKEN` to read a private project on those hosts;
without them the fetch is anonymous, which is all a public dependency needs.

## What it reports

For each changed dependency: the old and new range, which manifests declare it, up to three
bullets of what changed, and a `BREAKING` or `ACTION REQUIRED` flag when the changelog itself
declares one. Dependencies with no published changelog are listed with a compare link rather than
guessed at. Downgrades are reported in their own section.

A range that jumps several majors covers every release in between, not just the endpoints — a
1.x to 3.x jump still surfaces what 2.0.0 broke.

## Limits

Auditing `package.json` alone means a lockfile-only dependency move is invisible ([ADR
0001](docs/adr/0001-manifest-diff-over-lockfile.md)). Only github.com, gitlab.com and bitbucket.org
are read, so a package hosted anywhere else has no fetch path ([ADR
0002](docs/adr/0002-fetching-in-code-not-instructions.md)). The skill's own
[Limits](skills/deps-auditor/SKILL.md#limits) cover changelog coverage, monorepo-published
packages and `peerDependencies`.

## Development

`skills/deps-auditor/` is what ships; `test/` and `docs/` stay in the repository. The logic is
dependency-free CommonJS split into one module per domain under `skills/deps-auditor/scripts/lib/`,
with `scripts/audit-deps` and `scripts/fetch-changelog` as thin entry points that wire them together
and print JSON. Fetching is code rather than instructions ([ADR
0002](docs/adr/0002-fetching-in-code-not-instructions.md)); deciding what the fetched text covers is
still an instruction the model follows, and that split is the point.

| Module | Owns |
| --- | --- |
| `lib/cli.js` | argument parsing and its failures |
| `lib/git.js` | running git, resolving refs, reading a file at a ref |
| `lib/manifest.js` | `package.json` shape and which sections count |
| `lib/version.js` | version parsing, comparison, and upgrade vs downgrade |
| `lib/changes.js` | cross-manifest aggregation and dedupe |
| `lib/forges.js` | reading `repository.url` and building each host's requests |
| `lib/transport.js` | `gh api` and HTTPS, the two ways a request leaves the process |
| `lib/changelog.js` | candidate filenames, heading versions, slicing to a range |
| `lib/notes.js` | resolving one dependency's sources and the evidence about them |

Every module throws; the entry points are the only place that catches and reports. `lib/notes.js`
catches per dependency, so one unreadable package cannot fail an audit of fifteen.

```bash
test/audit-deps.js        # builds a fixture repo and asserts on its output
test/fetch-changelog.js   # replays recorded responses, one set per host
node --check skills/deps-auditor/scripts/lib/version.js
```

Both entry points run on their own, which is the fastest way to see what a ref range looks like and
what its upstream notes resolve to:

```bash
skills/deps-auditor/scripts/audit-deps --from v1.0.0 --to v2.0.0
skills/deps-auditor/scripts/audit-deps --from v1.0.0 --to v2.0.0 | skills/deps-auditor/scripts/fetch-changelog
```

`fetch-changelog` takes the audit JSON on stdin and returns one result per dependency, so it is
also the place to try a changelog path the candidates miss:

```bash
… | skills/deps-auditor/scripts/fetch-changelog --file 'monit=CHANGES'
```

## License

[MIT](LICENSE)

