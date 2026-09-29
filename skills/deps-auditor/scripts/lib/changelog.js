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
const HEADING_VERSION = /(\d+)\.(\d+)(?:\.(\d+))?/
const MARKDOWN_LINK = /\[[^\]]*\]\([^)]*\)/g
const BARE_URL = /https?:\/\/\S+/g
const LINK_SHARE_THRESHOLD = 0.5

function candidatePaths(fromVersion, toVersion) {
	const from = parseVersion(fromVersion)
	const to = parseVersion(toVersion)
	if (from === null || to === null) return [...CANDIDATES]
	const split = []
	for (let major = from.release[0] + 1; major <= to.release[0]; major += 1) split.push(`CHANGELOG-${major}.md`)
	return [...CANDIDATES, ...split]
}

function parseHeadingVersion(heading) {
	// ponytail: a heading must carry major.minor, so `## 2024 roadmap` is not read as a
	// release. A changelog naming only majors yields no evidence rather than wrong evidence.
	const match = HEADING_VERSION.exec(heading.replace(/^#+\s*/, ''))
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
	if (from === null || to === null) return false
	const candidate = parseVersion(version)
	return candidate !== null && compareVersions(candidate, from) > 0 && compareVersions(candidate, to) <= 0
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

function isMostlyLinks(body) {
	// ponytail: a body over half link is treated as a pointer to notes rather than the
	// notes. The threshold is a guess; a release whose first paragraph is a link to its
	// own changelog is the case worth catching, and a body that is genuinely half link
	// is rare enough that the model can overrule it.
	const withoutLinks = body.replace(MARKDOWN_LINK, '').replace(BARE_URL, '')
	const total = body.replace(/\s+/g, '').length
	if (total === 0) return false
	return (total - withoutLinks.replace(/\s+/g, '').length) / total > LINK_SHARE_THRESHOLD
}

module.exports = { candidatePaths, findHeadings, isMostlyLinks, sliceToRange, versionsInHeadings, within }
