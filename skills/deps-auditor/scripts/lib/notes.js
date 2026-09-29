'use strict'

const {
	candidatePaths,
	findHeadings,
	isMostlyLinks,
	sliceToRange,
	versionsInHeadings,
	within
} = require('./changelog')
const { PAGE_SIZE, readRepositoryUrl, resolveForge } = require('./forges')
const { compareVersions, parseVersion } = require('./version')

const MAX_RELEASE_PAGES = 20

const RELEASE_VERSION = /(\d+)\.(\d+)(?:\.(\d+))?(-[0-9A-Za-z.-]+)?/

function releaseOf(entry) {
	const tag = entry?.tag_name
	if (typeof tag !== 'string') return null
	const match = RELEASE_VERSION.exec(tag)
	// ponytail: a prerelease tag is dropped rather than reported as its final version.
	// TypeScript tags a beta and an rc of every release, and reading `v5.4-beta` as 5.4.0
	// puts a version in the range twice and claims a build the range never installs.
	if (match === null || match[4] !== undefined) return null
	return {
		tag,
		version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3] || 0)}`,
		body: typeof entry.description === 'string' ? entry.description : ''
	}
}

function pastFloor(release, fromVersion) {
	const from = parseVersion(fromVersion)
	if (from === null) return false
	const version = parseVersion(release.version)
	return version !== null && compareVersions(version, from) <= 0
}

async function readChangelog(transport, forge, coordinates, fromVersion, toVersion, override) {
	const paths = override === undefined ? candidatePaths(fromVersion, toVersion) : [override]
	for (const path of paths) {
		const response = await forge.readFile(transport, coordinates, path)
		if (response.status === 200) return { path, status: 200, content: response.body }
		if (response.status !== 404) return { path, status: response.status, error: response.error }
	}
	return { status: 404 }
}

async function readReleases(transport, forge, coordinates, fromVersion, toVersion) {
	if (forge.listReleases === null) return null
	const inRange = []
	let status = 404
	let error
	// ponytail: hosts are assumed to return releases newest first, which is what lets the
	// floor stop the walk. If one returned them oldest first the walk would still end at
	// MAX_RELEASE_PAGES, and the cap would need to be a real bound rather than a backstop.
	for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
		const response = await forge.listReleases(transport, coordinates, page)
		status = response.status
		error = response.error
		if (response.status !== 200) break
		let batch
		try {
			batch = JSON.parse(response.body)
		} catch {
			error = 'releases did not parse as JSON'
			break
		}
		if (!Array.isArray(batch) || batch.length === 0) break
		const releases = batch.map(releaseOf).filter((release) => release !== null)
		inRange.push(...releases.filter((release) => within(release.version, fromVersion, toVersion)))
		if (batch.length < PAGE_SIZE || releases.some((release) => pastFloor(release, fromVersion))) break
	}
	return { status, error, entries: inRange }
}

function describeChangelog(found, name, fromVersion, toVersion) {
	if (found.content === undefined) return { path: found.path, status: found.status, error: found.error }
	const headings = findHeadings(found.content)
	const slice = sliceToRange(found.content, headings, fromVersion, toVersion)
	return {
		path: found.path,
		status: 200,
		versionsFound: versionsInHeadings(headings),
		packageMentioned: found.content.includes(name),
		sliced: slice !== null && slice.length < found.content.length,
		content: slice ?? found.content
	}
}

function outcome(changelog, releases) {
	if (changelog.status === 200) return 'fetched'
	if (releases !== null && releases.status === 200 && releases.entries.length > 0) return 'fetched'
	// A host answering 401 to a private project, or 429 once its rate limit is spent, means
	// the source was not read. Calling that "no changelog" would report a silent gap as a
	// fact about the upstream, which is the one thing this whole design exists to prevent.
	const unreadable = [changelog.status, releases?.status].filter(
		(status) => status !== undefined && status !== 200 && status !== 404
	)
	return unreadable.length === 0 ? 'no-changelog' : 'fetch-failed'
}

async function collectNotes(change, options) {
	const { name, fromVersion, toVersion } = change
	const identity = { name, fromVersion, toVersion }
	if (fromVersion === null || toVersion === null) return { ...identity, status: 'unclassified' }

	const repositoryUrl = options.readRepositoryUrl(name)
	if (repositoryUrl === null) return { ...identity, status: 'no-fetch-path', reason: 'no-repository' }
	const resolved = resolveForge(repositoryUrl)
	if (resolved.forge === null) {
		return { ...identity, status: 'no-fetch-path', reason: resolved.reason, host: resolved.host, repositoryUrl }
	}
	const { forge, coordinates } = resolved
	const identified = {
		...identity,
		forge: forge.name,
		coordinates,
		repositoryUrl,
		links: { compare: forge.compareUrl(coordinates, fromVersion, toVersion) }
	}

	const found = await readChangelog(options.transport, forge, coordinates, fromVersion, toVersion, options.overrides.get(name))
	const releases = await readReleases(options.transport, forge, coordinates, fromVersion, toVersion)
	const changelog = describeChangelog(found, name, fromVersion, toVersion)
	const reported = releases === null ? null : { ...releases, bodiesAreLinks: releases.entries.some((entry) => isMostlyLinks(entry.body)) }

	return { ...identified, status: outcome(changelog, releases), changelog, releases: reported }
}

module.exports = { collectNotes }
