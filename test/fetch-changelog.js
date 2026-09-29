#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

const { collectNotes } = require('../skills/deps-auditor/scripts/lib/notes')

const SCRIPT = join(__dirname, '..', 'skills', 'deps-auditor', 'scripts', 'fetch-changelog')

const CHANGELOG = [
	'# Changelog',
	'',
	'## widget 1.1.0',
	'',
	'- added the thing',
	'',
	'## widget 1.0.5',
	'',
	'- fixed a thing',
	'',
	'## 2024 roadmap',
	'',
	'- not a release',
	'',
	'## widget 1.0.0',
	'',
	'- initial',
	''
].join('\n')

function releases(...versions) {
	return {
		status: 200,
		body: JSON.stringify(
			versions.map((version) => ({ tag_name: `v${version}`, description: `Notes for ${version}.` }))
		)
	}
}

function createTransport(responses) {
	const calls = []
	return {
		calls,
		https: async (url) => {
			calls.push(url)
			return responses[url] ?? { status: 404, body: '' }
		},
		github: async (args) => {
			calls.push(args[1])
			return responses[args[1]] ?? { status: 404, body: '' }
		}
	}
}

function change(overrides) {
	return {
		name: 'widget',
		kind: 'upgrade',
		from: '^1.0.0',
		to: '^1.1.0',
		fromVersion: '1.0.0',
		toVersion: '1.1.0',
		sections: ['dependencies'],
		manifests: ['package.json'],
		...overrides
	}
}

async function collect({ responses = {}, repositoryUrl = 'git+https://github.com/acme/widget.git', overrides = new Map(), ...fields } = {}) {
	const transport = createTransport(responses)
	const result = await collectNotes(change(fields), {
		overrides,
		transport,
		readRepositoryUrl: () => repositoryUrl
	})
	return { result, transport }
}

async function github() {
	const { result, transport } = await collect({
		responses: {
			'repos/acme/widget/contents/CHANGELOG.md': { status: 200, body: CHANGELOG },
			'repos/acme/widget/releases?per_page=100&page=1': releases('1.1.0', '1.0.5', '0.9.0')
		}
	})

	assert.equal(result.status, 'fetched')
	assert.equal(result.forge, 'github')
	assert.equal(result.coordinates, 'acme/widget')
	assert.equal(result.links.compare, 'https://github.com/acme/widget/compare/1.0.0...1.1.0')
	assert.equal(result.changelog.path, 'CHANGELOG.md')
	assert.equal(result.changelog.sliced, true)
	assert.equal(result.changelog.packageMentioned, true)
	assert.deepEqual(result.changelog.versionsFound, ['1.1.0', '1.0.5', '1.0.0'], 'a heading with no major.minor is not a release')
	assert.ok(result.changelog.content.includes('added the thing'))
	assert.ok(result.changelog.content.includes('fixed a thing'))
	assert.ok(!result.changelog.content.includes('initial'), 'the slice stops at the range floor')
	assert.deepEqual(
		result.releases.entries.map((entry) => entry.version),
		['1.1.0', '1.0.5'],
		'the floor is exclusive and the ceiling inclusive'
	)
	assert.equal(result.releases.bodiesAreLinks, false)
	assert.ok(!transport.calls.includes('repos/acme/widget/contents/changelog.md'), 'the first hit ends the candidate loop')
}

async function gitlab() {
	const project = 'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner'
	const { result, transport } = await collect({
		repositoryUrl: 'https://gitlab.com/gitlab-org/gitlab-runner.git',
		responses: {
			[`${project}/repository/files/CHANGELOG.md/raw`]: { status: 200, body: CHANGELOG },
			[`${project}/releases?per_page=100&page=1`]: {
				status: 200,
				body: JSON.stringify([
					{
						tag_name: 'v1.1.0',
						description:
							'See [the changelog](https://gitlab.com/gitlab-org/gitlab-runner/blob/v1.1.0/CHANGELOG.md) and https://docs.gitlab.com/runner/.'
					}
				])
			}
		}
	})

	assert.equal(result.status, 'fetched')
	assert.equal(result.forge, 'gitlab')
	assert.equal(result.coordinates, 'gitlab-org/gitlab-runner')
	assert.equal(result.links.compare, 'https://gitlab.com/gitlab-org/gitlab-runner/-/compare/1.0.0...1.1.0')
	assert.equal(result.releases.bodiesAreLinks, true, 'a body that is a link is not the notes')
	assert.ok(
		transport.calls.every((url) => url.startsWith(project)),
		'the project path is percent-encoded, so a subgroup path stays addressable'
	)
}

async function gitlabNestedFile() {
	const file = 'https://gitlab.com/api/v4/projects/acme%2Fgroup%2Fwidget/repository/files/docs%2FCHANGELOG.md/raw'
	const { transport } = await collect({
		repositoryUrl: 'https://gitlab.com/acme/group/widget.git',
		overrides: new Map([['widget', 'docs/CHANGELOG.md']]),
		responses: { [file]: { status: 200, body: CHANGELOG } }
	})

	assert.ok(
		transport.calls.includes(file),
		'an unencoded slash answers 404 on a file that exists, which reads as no changelog'
	)
}

async function bitbucket() {
	const { result, transport } = await collect({
		repositoryUrl: 'https://bitbucket.org/tildeslash/monit.git',
		responses: { 'https://bitbucket.org/tildeslash/monit/raw/HEAD/CHANGES.md': { status: 200, body: CHANGELOG } }
	})

	assert.equal(result.status, 'fetched')
	assert.equal(result.forge, 'bitbucket')
	assert.equal(result.releases, null, 'Bitbucket publishes no release notes')
	assert.equal(result.links.compare, 'https://bitbucket.org/tildeslash/monit', 'Bitbucket has no compare view')
	assert.ok(transport.calls.includes('https://bitbucket.org/tildeslash/monit/raw/HEAD/CHANGELOG.md'), 'candidates are tried in order')
}

async function noFetchPath() {
	const unsupported = await collect({ repositoryUrl: 'https://codeberg.org/acme/widget.git' })
	assert.equal(unsupported.result.status, 'no-fetch-path')
	assert.equal(unsupported.result.reason, 'unsupported-host')
	assert.equal(unsupported.result.host, 'codeberg.org')
	assert.equal(unsupported.result.repositoryUrl, 'https://codeberg.org/acme/widget.git')

	const missing = await collect({ repositoryUrl: null })
	assert.equal(missing.result.status, 'no-fetch-path')
	assert.equal(missing.result.reason, 'no-repository')

	const selfHosted = await collect({ repositoryUrl: 'https://gitlab.acme.com/acme/widget.git' })
	assert.equal(selfHosted.result.reason, 'unsupported-host', 'a supported forge is not a supported host')

	const shallowed = await collect({ repositoryUrl: 'https://github.com/acme/widget/too/deep' })
	assert.equal(shallowed.result.reason, 'unusable-url', 'GitHub coordinates are exactly two segments')

	const subgroup = await collect({ repositoryUrl: 'https://github.com/acme/widget' })
	assert.equal(subgroup.result.status, 'no-changelog')
}

async function outcomes() {
	const unreachable = await collect({
		responses: { 'repos/acme/widget/contents/CHANGELOG.md': { status: 0, body: '', error: 'no response within 15000ms' } }
	})
	assert.equal(unreachable.result.status, 'fetch-failed')
	assert.equal(unreachable.result.changelog.error, 'no response within 15000ms')

	const absent = await collect()
	assert.equal(absent.result.status, 'no-changelog', 'a source that 404s is not a failure to fetch')

	const rejected = await collect({
		responses: { 'repos/acme/widget/contents/CHANGELOG.md': { status: 401, body: '' } }
	})
	assert.equal(rejected.result.status, 'fetch-failed', 'a private or rate-limited host is not evidence of no changelog')

	const throttled = await collect({
		responses: {
			'repos/acme/widget/contents/CHANGELOG.md': { status: 404, body: '' },
			'repos/acme/widget/releases?per_page=100&page=1': { status: 429, body: '' }
		}
	})
	assert.equal(throttled.result.status, 'fetch-failed', 'a spent rate limit is not evidence of no changelog')

	const monorepo = await collect({
		responses: { 'repos/acme/widget/contents/CHANGELOG.md': { status: 200, body: CHANGELOG.replace(/widget/g, 'root') } }
	})
	assert.equal(monorepo.result.status, 'fetched')
	assert.equal(monorepo.result.changelog.packageMentioned, false, 'a changelog that never names the package is evidence, not a verdict')

	const prereleases = await collect({
		responses: {
			'repos/acme/widget/releases?per_page=100&page=1': {
				status: 200,
				body: JSON.stringify(
					['v1.1.0', 'v1.1-beta', 'v1.1.0-rc.1', 'v1.0.5', 'pkg@1.0.4'].map((tag) => ({ tag_name: tag, description: 'notes' }))
				)
			}
		}
	})
	assert.deepEqual(
		prereleases.result.releases.entries.map((entry) => entry.version),
		['1.1.0', '1.0.5', '1.0.4'],
		'a beta and an rc are not the release they precede'
	)

	const unclassified = await collect({ fromVersion: null, toVersion: null, to: 'workspace:*' })
	assert.equal(unclassified.result.status, 'unclassified')
}

function cli() {
	const piped = spawnSync(SCRIPT, [], { input: JSON.stringify({ changes: [change({ fromVersion: null, toVersion: null })] }), encoding: 'utf8' })
	assert.equal(piped.status, 0, piped.stderr)
	assert.equal(JSON.parse(piped.stdout).results[0].status, 'unclassified', 'the audit JSON on stdin drives the run')

	const empty = spawnSync(SCRIPT, [], { input: '', encoding: 'utf8' })
	assert.notEqual(empty.status, 0)
	assert.match(empty.stderr, /expected the audit JSON on stdin/)

	const badOverride = spawnSync(SCRIPT, ['--file', 'CHANGES'], { input: JSON.stringify({ changes: [] }), encoding: 'utf8' })
	assert.notEqual(badOverride.status, 0)
	assert.match(badOverride.stderr, /--file expects <package>=<path>/)
}

async function main() {
	await github()
	await gitlab()
	await gitlabNestedFile()
	await bitbucket()
	await noFetchPath()
	await outcomes()
	cli()
	console.log('fetch-changelog: all assertions passed')
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
