'use strict'

const { listFiles, readFileAt } = require('./git')

function parseManifest(content, path, commit) {
	try {
		return JSON.parse(content)
	} catch {
		throw new Error(`${path} at ${commit.slice(0, 7)} is not valid JSON`)
	}
}

function loadManifests(commit) {
	const manifests = new Map()
	for (const path of listFiles(commit)) {
		if (!path.endsWith('package.json') || path.includes('node_modules/')) continue
		manifests.set(path, parseManifest(readFileAt(commit, path), path, commit))
	}
	return manifests
}

function indexDeclarations(manifest) {
	const declarations = new Map()
	for (const section of ['dependencies', 'devDependencies']) {
		for (const [name, range] of Object.entries(manifest[section] || {})) {
			if (typeof range !== 'string') continue
			if (!declarations.has(name)) declarations.set(name, { range, sections: [] })
			declarations.get(name).sections.push(section)
		}
	}
	return declarations
}

module.exports = { indexDeclarations, loadManifests }
