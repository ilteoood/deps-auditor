# Fetch upstream notes in code, not in instructions

Resolving a package's repository and downloading its changelog file and release notes is a script,
`scripts/fetch-changelog`, rather than a set of commands the model is told to run and interpret.

The skill began as instructions because that is the shape a skill takes when it only has one thing
to do. Supporting GitLab and Bitbucket alongside GitHub made that shape untenable: each host
addresses a repository differently, and GitLab's API in particular requires a path to be
percent-encoded, where a file that exists at `docs/CHANGELOG.md` answers 404 unless the slash is
`%2F`. Prose cannot guarantee that encoding, and a wrong encoding is indistinguishable from a
repository that published no changelog. Encoding once, in code, is also what makes a self-hosted
host a matter of configuration rather than of a model's judgement. The script returns the sources
plus mechanical evidence — which versions each names, whether a body is mostly a link, whether the
changelog mentions the package asked about — and stops there. Whether those sources cover the
range remains the reading the model does, because a release body that is a link instead of notes is
a judgement no heuristic makes correctly.

## Consequences

Changelogs are read from the default branch rather than pinned to the tag matching the audited
version. A repository that rewrites its changelog after a release therefore makes an audit
non-reproducible, and a changelog may describe releases published after the range in scope. Pinning
is the obvious improvement and is deliberately not done: resolving a tag from a version means
guessing at tag conventions, and on Bitbucket — which has no release notes at all, so never needs
the guess — tags are frequently not versions.

Supported hosts are a closed list: github.com, gitlab.com, bitbucket.org. A self-hosted or
enterprise instance of a supported forge is not supported, and a package on any other host is
reported as having no fetch path rather than being fetched. The host is already known from
`repository.url`; what is missing is which API dialect it speaks, and probing every unknown host
costs a request per dependency to solve a question only a minority of packages raise.

Release notes are paginated by the script rather than by `gh api --paginate` and `jq`, so `jq` is
no longer a prerequisite. The walk reads pages until one comes back short, because a host that
answers oldest first would otherwise let a range's floor end the walk before the releases above it
were read. A repository with more releases than the walk's page bound is reported as truncated
rather than silently cut short.
