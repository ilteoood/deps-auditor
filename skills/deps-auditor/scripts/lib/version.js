'use strict'

const VERSION_PATTERN = /(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/
const NON_VERSION_PROTOCOL_PATTERN = /^(git\+|file:|link:|git:|https?:)/
const NUMERIC_IDENTIFIER = /^\d+$/

function parseVersion(range) {
	if (NON_VERSION_PROTOCOL_PATTERN.test(range)) return null
	const match = VERSION_PATTERN.exec(range)
	if (match === null) return null
	return {
		release: [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)],
		prerelease: match[4]
	}
}

function formatVersion(version) {
	const [major, minor, patch] = version.release
	return version.prerelease === undefined
		? `${major}.${minor}.${patch}`
		: `${major}.${minor}.${patch}-${version.prerelease}`
}

function comparePrerelease(left, right) {
	const leftIdentifiers = left.split('.')
	const rightIdentifiers = right.split('.')
	for (const [index, leftIdentifier] of leftIdentifiers.entries()) {
		const rightIdentifier = rightIdentifiers[index]
		if (rightIdentifier === undefined) return 1
		if (leftIdentifier === rightIdentifier) continue
		const leftIsNumeric = NUMERIC_IDENTIFIER.test(leftIdentifier)
		const rightIsNumeric = NUMERIC_IDENTIFIER.test(rightIdentifier)
		if (leftIsNumeric !== rightIsNumeric) return leftIsNumeric ? -1 : 1
		if (leftIsNumeric) return Number(leftIdentifier) - Number(rightIdentifier)
		return leftIdentifier < rightIdentifier ? -1 : 1
	}
	return rightIdentifiers.length > leftIdentifiers.length ? -1 : 0
}

function compareVersions(left, right) {
	for (let index = 0; index < left.release.length; index += 1) {
		if (left.release[index] !== right.release[index]) return left.release[index] - right.release[index]
	}
	if (left.prerelease === right.prerelease) return 0
	if (left.prerelease === undefined) return 1
	if (right.prerelease === undefined) return -1
	return comparePrerelease(left.prerelease, right.prerelease)
}

function compareRanges(left, right) {
	const leftVersion = parseVersion(left)
	const rightVersion = parseVersion(right)
	if (leftVersion === null || rightVersion === null) return left === right ? 0 : left < right ? -1 : 1
	return compareVersions(leftVersion, rightVersion)
}

function extremeRange(ranges, prefer) {
	return ranges.reduce((widest, range) => {
		const order = compareRanges(range, widest)
		return prefer === 'lowest' ? (order < 0 ? range : widest) : order > 0 ? range : widest
	})
}

function classify(fromRange, toRange) {
	const from = parseVersion(fromRange)
	const to = parseVersion(toRange)
	if (from === null || to === null) return { kind: 'unclassified', fromVersion: null, toVersion: null }
	const order = compareVersions(to, from)
	return {
		kind: order > 0 ? 'upgrade' : order < 0 ? 'downgrade' : 'range-only',
		fromVersion: formatVersion(from),
		toVersion: formatVersion(to)
	}
}

module.exports = { classify, compareVersions, extremeRange, formatVersion, parseVersion }
