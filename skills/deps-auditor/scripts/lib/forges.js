'use strict'

const { execFileSync } = require('node:child_process')

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//
const SCP_LIKE = /^(?:[^@/]+@)?([^/:]+)[/:](.+)$/

const PAGE_SIZE = 100

function privateToken(name) {
	return process.env[name] === undefined ? {} : { 'PRIVATE-TOKEN': process.env[name] }
}

function bearerToken(name) {
	return process.env[name] === undefined ? {} : { Authorization: `Bearer ${process.env[name]}` }
}

const FORGES = {
	'github.com': {
		name: 'github',
		accepts: (segments) => segments.length === 2,
		readFile: (transport, coordinates, path) =>
			transport.github([`repos/${coordinates}/contents/${path}`, '-H', 'Accept: application/vnd.github.raw']),
		listReleases: (transport, coordinates, page) =>
			transport.github([`repos/${coordinates}/releases?per_page=${PAGE_SIZE}&page=${page}`]),
		compareUrl: (coordinates, from, to) => `https://github.com/${coordinates}/compare/${from}...${to}`
	},
	'gitlab.com': {
		name: 'gitlab',
		accepts: (segments) => segments.length >= 2,
		readFile: (transport, coordinates, path) =>
			transport.https(
				`https://gitlab.com/api/v4/projects/${encodeURIComponent(coordinates)}/repository/files/${encodeURIComponent(path)}/raw`,
				privateToken('GITLAB_TOKEN')
			),
		listReleases: (transport, coordinates, page) =>
			transport.https(
				`https://gitlab.com/api/v4/projects/${encodeURIComponent(coordinates)}/releases?per_page=${PAGE_SIZE}&page=${page}`,
				privateToken('GITLAB_TOKEN')
			),
		compareUrl: (coordinates, from, to) => `https://gitlab.com/${coordinates}/-/compare/${from}...${to}`
	},
	'bitbucket.org': {
		name: 'bitbucket',
		accepts: (segments) => segments.length === 2,
		readFile: (transport, coordinates, path) =>
			transport.https(
				`https://bitbucket.org/${coordinates}/raw/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`,
				bearerToken('BITBUCKET_TOKEN')
			),
		listReleases: null,
		compareUrl: (coordinates) => `https://bitbucket.org/${coordinates}`
	}
}

function parseRepositoryUrl(url) {
	const raw = String(url ?? '').trim().replace(/^git\+/, '')
	const parts = SCP_LIKE.exec(raw.replace(SCHEME, ''))
	if (parts === null) return null
	const segments = parts[2].replace(/\.git$/, '').split('/').filter((segment) => segment !== '')
	if (segments.length < 2) return null
	return { host: parts[1].toLowerCase(), segments }
}

function resolveForge(url) {
	const parsed = parseRepositoryUrl(url)
	if (parsed === null) return { forge: null, reason: 'unusable-url' }
	const forge = FORGES[parsed.host]
	if (forge === undefined) return { forge: null, reason: 'unsupported-host', host: parsed.host }
	if (!forge.accepts(parsed.segments)) return { forge: null, reason: 'unusable-url', host: parsed.host }
	return { forge, host: parsed.host, coordinates: parsed.segments.join('/') }
}

function readRepositoryUrl(name) {
	const args = ['view', name, 'repository.url', '--json']
	try {
		const value = JSON.parse(execFileSync('npm', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim() || 'null')
		return typeof value === 'string' ? value : null
	} catch {
		return null
	}
}

module.exports = { PAGE_SIZE, readRepositoryUrl, resolveForge }
