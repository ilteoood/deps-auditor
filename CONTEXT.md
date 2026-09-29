# Dependency Auditing

The language used to describe what changed between two points in a project's history, and what may
be said about it. An audit is only ever as good as the distinction between what was declared and
what is known.

## Language

**Audit**:
The report covering one ref range and every dependency that changed inside it.
_Avoid_: scan, check, review, run

**Manifest Change**:
A difference in the dependency declarations of a single `package.json` between two refs. The only
thing an audit is built from.
_Avoid_: diff, change, delta

**Upgrade**:
A Manifest Change whose declared range moved to a higher version in at least one manifest.
_Avoid_: dependency update, bump, version bump

**Downgrade**:
A Manifest Change whose declared range moved to a lower version, kept apart from upgrades because
it usually means a pin was reverted rather than that anything improved.
_Avoid_: rollback, revert, regression

**Upgrade Range**:
The half-open interval `(from, to]` a single dependency's summary must cover: everything published
after the old version, up to and including the new one.
_Avoid_: version diff, changelog range, delta

**Changelog Source**:
The upstream document a summary is drawn from — a changelog file, or failing that, published
release notes.
_Avoid_: release notes, docs, upstream

**Breaking Flag**:
The per-dependency marker stating that the Changelog Source itself declares an incompatible change
or prescribes a migration. Absent when the Changelog Source does not say so.
_Avoid_: severity, risk, warning, impact

**No Changelog Found**:
A dependency whose upstream publishes no Changelog Source. Reported as a placeholder with a compare
link, never summarised from substitutes.
_Avoid_: unsupported, skipped, unresolvable
