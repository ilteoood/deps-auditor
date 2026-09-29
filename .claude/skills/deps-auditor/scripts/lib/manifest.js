'use strict'

const { listFiles, readFileAt } = require('./git')

const SECTIONS = ['dependencies', 'devDependencies']

function isManifestPath(path) {
	return path.endsWith('package.json') && !path.includes('node_modules/')
}

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
		if (!isManifestPath(path)) continue
		const content = readFileAt(commit, path)
		if (content !== null) manifests.set(path, parseManifest(content, path, commit))
	}
	return manifests
}

function indexDeclarations(manifest) {
	const declarations = new Map()
	for (const section of SECTIONS) {
		for (const [name, range] of Object.entries(manifest[section] || {})) {
			if (typeof range !== 'string') continue
			if (!declarations.has(name)) declarations.set(name, { range, sections: [] })
			declarations.get(name).sections.push(section)
		}
	}
	return declarations
}

module.exports = { indexDeclarations, loadManifests }
