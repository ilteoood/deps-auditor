# deps-auditor

An audit answers what a dependency upgrade actually changed. It is built from the manifests of a
repository between two refs, and it resolves each changed dependency's upstream notes before
saying anything about them.

## Language

**Audit**:
The account of one ref range — every dependency that moved between two refs, and what its upgrade
did.
_Avoid_: report, review

**Manifest**:
A `package.json` in the audited repository. An audit is built from manifests alone, never from a
lockfile ([ADR 0001](docs/adr/0001-manifest-diff-over-lockfile.md)).
_Avoid_: package file, lockfile

**Change**:
A dependency whose declared range moved between the two refs. A range that moved without its
version moving is a change too, as is one that could not be compared at all.
_Avoid_: upgrade, bump

**Range in scope**:
The releases an audit must account for — everything after the old version, up to and including the
new one. The endpoints alone are never enough: a jump across a major must still surface what that
major broke.
_Avoid_: version range, diff range

## Forges

**Forge**:
The software that serves repositories — GitHub, GitLab, Bitbucket. A forge is not a place; where
one runs is a host.
_Avoid_: platform, provider

**Host**:
One running instance of a forge, named by its domain. The host, not the forge, decides how a
repository is addressed: three differ in what a path means and in whether releases exist at all.
_Avoid_: forge, platform, site

**Supported host**:
A host whose notes an audit can read: github.com, gitlab.com, bitbucket.org. A per-user or
enterprise instance of a supported forge is not one, whatever the software it runs.
_Avoid_: supported forge

**Repository coordinates**:
The forge-specific path identifying a repository, and the only thing a fetch is built from. Its
shape belongs to the host, not to the audit: one path segment is a GitHub owner and a Bitbucket
workspace, while a GitLab path may be a group, a subgroup or a project and is not knowable by
counting slashes.
_Avoid_: owner/repo, slug

## Sources

**Changelog file**:
A file committed to the repository recording releases in prose. It describes whatever the
repository covers, which is not necessarily the package that pointed at it.
_Avoid_: changelog, release notes

**Release notes**:
Per-release entries published by the host rather than committed to the repository. Not every host
has them, and an entry is often nothing but a link to the changelog file.
_Avoid_: releases, changelog

**Source coverage**:
Whether a source actually carries entries for the range in scope. Existing is not covering: a
section of unreleased work, a link standing in for notes, or an empty body all leave a gap that
only reading the source reveals.
_Avoid_: found, available

**Slice**:
The part of a changelog file spanning the range in scope, isolable only when the file is organised
by version.
_Avoid_: excerpt, window

## Resolution

**Fetch path**:
The route from a package to its notes — a repository on a supported host, reachable, whose sources
cover the range. A dependency without one is reported as such and never guessed at.
_Avoid_: source, upstream

**Evidence**:
What an audit can state mechanically about a source: which versions it names, whether it mentions
the package asked about, whether it was sliced. Evidence is never a verdict — the reading that
decides whether a source covers the range stays a judgement.
_Avoid_: confidence, score
