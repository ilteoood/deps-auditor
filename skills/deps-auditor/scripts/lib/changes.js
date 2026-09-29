'use strict'

const { indexDeclarations } = require('./manifest')
const { classify, extremeRange } = require('./version')

function collectOccurrences(beforeManifests, afterManifests) {
	const occurrences = new Map()
	for (const [path, beforeManifest] of beforeManifests) {
		const afterManifest = afterManifests.get(path)
		if (afterManifest === undefined) continue
		const afterDeclarations = indexDeclarations(afterManifest)
		for (const [name, before] of indexDeclarations(beforeManifest)) {
			const after = afterDeclarations.get(name)
			if (after === undefined || after.range === before.range) continue
			if (!occurrences.has(name)) occurrences.set(name, [])
			occurrences.get(name).push({ path, sections: before.sections, from: before.range, to: after.range })
		}
	}
	return occurrences
}

function buildChange(name, occurrences) {
	const from = extremeRange(occurrences.map((occurrence) => occurrence.from), 'lowest')
	const to = extremeRange(occurrences.map((occurrence) => occurrence.to), 'highest')
	const { kind, fromVersion, toVersion } = classify(from, to)
	return {
		name,
		kind,
		from,
		to,
		fromVersion,
		toVersion,
		sections: [...new Set(occurrences.flatMap((occurrence) => occurrence.sections))].sort(),
		manifests: [...new Set(occurrences.map((occurrence) => occurrence.path))].sort()
	}
}

function collectChanges(beforeManifests, afterManifests) {
	return [...collectOccurrences(beforeManifests, afterManifests)]
		.map(([name, occurrences]) => buildChange(name, occurrences))
		.sort((left, right) => left.name.localeCompare(right.name))
}

module.exports = { collectChanges }
