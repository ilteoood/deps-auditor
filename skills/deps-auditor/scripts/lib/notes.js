'use strict'

const {
	candidatePaths,
	findHeadings,
	linkShare,
	sliceToRange,
	versionsInHeadings,
	within
} = require('./changelog')
const { PAGE_SIZE, readRepositoryUrl, resolveForge } = require('./forges')
const { formatVersion, parseVersion } = require('./version')

const MAX_RELEASE_PAGES = 50
const MAX_COMMIT_PAGES = 20
const BREAKING_CHANGE = /^BREAKING[ -]CHANGE:[ \t]*(.*)$/m

function releaseOf(entry) {
	const tag = entry?.tag_name
	if (typeof tag !== 'string') return null
	const version = parseVersion(tag)
	if (version === null) return null
	return { tag, version: formatVersion(version), body: typeof entry.description === 'string' ? entry.description : '' }
}

// GitHub nests the message under `commit`, GitLab flattens it. A tag-only repository publishes
// neither release notes nor a changelog, and the commit subjects are then the only account of
// what the range changed.
function commitOf(entry) {
	const message = entry?.commit?.message ?? entry?.message
	if (typeof message !== 'string') return null
	return { subject: message.split('\n')[0], breaking: BREAKING_CHANGE.exec(message)?.[1] ?? null }
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
	let exhausted = false
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
		if (!Array.isArray(batch)) break
		const releases = batch.map(releaseOf).filter((release) => release !== null)
		inRange.push(
			...releases
				.filter((release) => within(release.version, fromVersion, toVersion))
				.map((release) => ({ ...release, linkShare: linkShare(release.body) }))
		)
		if (batch.length < PAGE_SIZE) {
			exhausted = true
			break
		}
	}
	return { status, error, entries: inRange, truncated: status === 200 && !exhausted }
}

async function readCommits(transport, forge, coordinates, fromTag, toTag) {
	if (forge.listCommits === null || fromTag === undefined || toTag === undefined) return null
	const entries = []
	let status = 404
	let error
	let exhausted = false
	for (let page = 1; page <= MAX_COMMIT_PAGES; page += 1) {
		const response = await forge.listCommits(transport, coordinates, fromTag, toTag, page)
		status = response.status
		error = response.error
		if (response.status !== 200) break
		let batch
		try {
			batch = JSON.parse(response.body)
		} catch {
			error = 'commits did not parse as JSON'
			break
		}
		// GitHub answers a compare with an object holding `commits`; GitLab answers with the array.
		const commits = Array.isArray(batch) ? batch : batch?.commits
		if (!Array.isArray(commits)) break
		entries.push(...commits.map(commitOf).filter((commit) => commit !== null))
		if (commits.length < PAGE_SIZE) {
			exhausted = true
			break
		}
	}
	return { status, error, entries, truncated: status === 200 && !exhausted }
}

function compareLink(forge, coordinates, tags, fromVersion, toVersion) {
	if (forge.compareView === false) return forge.compareUrl(coordinates)
	const fromTag = tags.get(fromVersion)
	const toTag = tags.get(toVersion)
	return fromTag === undefined || toTag === undefined ? null : forge.compareUrl(coordinates, fromTag, toTag)
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

function outcome(changelog, releases, commits) {
	if (changelog.status === 200) return 'fetched'
	if (releases !== null && releases.status === 200 && releases.entries.length > 0) return 'fetched'
	if (commits !== null && commits.status === 200 && commits.entries.length > 0) return 'fetched'
	// A host answering 401 to a private project, or 429 once its rate limit is spent, means
	// the source was not read. Calling that "no changelog" would report a silent gap as a
	// fact about the upstream, which is the one thing this whole design exists to prevent.
	const unreadable = [changelog.status, releases?.status, commits?.status].filter(
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
	const { forge, coordinates, cloneUrl } = resolved
	const tags = options.readTags(forge, cloneUrl, name)
	const identified = {
		...identity,
		forge: forge.name,
		coordinates,
		repositoryUrl,
		links: { compare: compareLink(forge, coordinates, tags, fromVersion, toVersion) }
	}

	const found = await readChangelog(options.transport, forge, coordinates, fromVersion, toVersion, options.overrides.get(name))
	const releases = await readReleases(options.transport, forge, coordinates, fromVersion, toVersion)
	const commits = await readCommits(options.transport, forge, coordinates, tags.get(fromVersion), tags.get(toVersion))
	const changelog = describeChangelog(found, name, fromVersion, toVersion)

	return { ...identified, status: outcome(changelog, releases, commits), changelog, releases, commits }
}

module.exports = { collectNotes }
