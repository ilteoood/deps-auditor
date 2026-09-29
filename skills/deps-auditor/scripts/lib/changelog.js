'use strict'

const { compareVersions, parseVersion } = require('./version')

const CANDIDATES = [
	'CHANGELOG.md',
	'changelog.md',
	'CHANGELOG',
	'HISTORY.md',
	'History.md',
	'CHANGES.md',
	'NEWS.md',
	'RELEASES.md'
]
const HEADING_LINE = /^#{1,6}\s+.*$/gm
const RELEASE_HEADING_VERSION = /(?<![\d.])v?(\d+)\.(\d+)(?:\.(\d+))?(?![\d.a-zA-Z])/
const MARKDOWN_LINK = /\[[^\]]*\]\([^)]*\)/g
const BARE_URL = /https?:\/\/\S+/g
const WHITESPACE = /\s+/g

function candidatePaths(fromVersion, toVersion) {
	const from = parseVersion(fromVersion)
	const to = parseVersion(toVersion)
	if (from === null || to === null) return [...CANDIDATES]
	const split = []
	for (let major = from.release[0] + 1; major <= to.release[0]; major += 1) split.push(`CHANGELOG-${major}.md`)
	return [...CANDIDATES, ...split]
}

function parseHeadingVersion(heading) {
	const match = RELEASE_HEADING_VERSION.exec(heading.replace(/^#+\s*/, ''))
	if (match === null) return null
	return `${Number(match[1])}.${Number(match[2])}.${Number(match[3] || 0)}`
}

function findHeadings(content) {
	return [...content.matchAll(HEADING_LINE)].map((match) => ({
		index: match.index,
		version: parseHeadingVersion(match[0])
	}))
}

function versionsInHeadings(headings) {
	return [...new Set(headings.map((heading) => heading.version).filter((version) => version !== null))]
}

function within(version, fromVersion, toVersion) {
	const from = parseVersion(fromVersion)
	const to = parseVersion(toVersion)
	const candidate = parseVersion(version)
	if (from === null || to === null || candidate === null) return false
	const inRange = compareVersions(candidate, from) > 0 && compareVersions(candidate, to) <= 0
	return inRange && (candidate.prerelease === undefined || to.prerelease !== undefined)
}

function sliceToRange(content, headings, fromVersion, toVersion) {
	const from = parseVersion(fromVersion)
	const to = parseVersion(toVersion)
	if (from === null || to === null) return null
	const dated = headings.filter((heading) => heading.version !== null)
	const first = dated.findIndex((heading) => compareVersions(parseVersion(heading.version), to) <= 0)
	if (first === -1) return null
	const after = dated.findIndex((heading, index) => index > first && compareVersions(parseVersion(heading.version), from) <= 0)
	const last = after === -1 ? dated.length : after
	return content.slice(dated[first].index, dated[last].index)
}

function linkShare(body) {
	const prose = body.replace(MARKDOWN_LINK, '').replace(BARE_URL, '').replace(WHITESPACE, '')
	const total = body.replace(WHITESPACE, '').length
	return total === 0 ? 0 : (total - prose.length) / total
}

module.exports = { candidatePaths, findHeadings, linkShare, sliceToRange, versionsInHeadings, within }
