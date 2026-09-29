# Audit the manifest, not the lockfile

An audit is built by diffing `package.json` files between two refs, not by reading the lockfile.

The lockfile is the more accurate record of what moved, but pinning to it means supporting npm,
pnpm, yarn and bun formats and their several lockfile locations before a single dependency can be
reported, and an audit would then depend on whether the audited repository commits a lockfile at
all. The manifest is what a human actually changed, it is diffable with `git` alone, and it is
present in every project this applies to.

## Consequences

A dependency that moved in the lockfile without a manifest change is invisible to an audit, so
"nothing changed" can mean "nothing was declared" rather than "nothing was installed". The range
covered also starts from the declared floor, which under a caret or tilde can sit below the version
actually installed, making the reported range a superset of what really changed. Both err towards
reporting too much rather than too little.

Using the lockfile to anchor the range remains the natural first extension if this blind spot
becomes a problem in practice.
