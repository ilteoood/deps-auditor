#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { dirname, join } = require('node:path')

const SCRIPT = join(dirname(__dirname), 'scripts', 'audit-deps')

function git(repository, args) {
	return execFileSync('git', args, { cwd: repository, encoding: 'utf8' })
}

function writeManifest(repository, path, manifest) {
	mkdirSync(join(repository, dirname(path)), { recursive: true })
	writeFileSync(join(repository, path), `${JSON.stringify(manifest, null, '\t')}\n`)
}

function commit(repository, message) {
	git(repository, ['add', '-A'])
	git(repository, ['commit', '-q', '-m', message])
}

function audit(repository, args) {
	return spawnSync(SCRIPT, args, { cwd: repository, encoding: 'utf8' })
}

function changeNamed(report, name) {
	const found = report.changes.find((change) => change.name === name)
	assert.ok(found, `expected a change for ${name}, got ${report.changes.map((change) => change.name).join(', ')}`)
	return found
}

const repository = mkdtempSync(join(tmpdir(), 'deps-auditor-'))

try {
	git(repository, ['init', '-q', '-b', 'main'])
	git(repository, ['config', 'user.email', 'test@deps-auditor.invalid'])
	git(repository, ['config', 'user.name', 'deps-auditor test'])

	writeManifest(repository, 'package.json', {
		dependencies: { react: '^17.0.2', lodash: '^4.17.20', internal: 'workspace:*' },
		devDependencies: { typescript: '~5.0.0' }
	})
	writeManifest(repository, 'packages/ui/package.json', {
		dependencies: { react: '^17.0.2', clsx: '^2.0.0' }
	})
	commit(repository, 'before')

	writeManifest(repository, 'package.json', {
		dependencies: { react: '^18.3.1', lodash: '^4.17.20', internal: 'workspace:^' },
		devDependencies: { typescript: '~5.4.0', zod: '^3.22.0' }
	})
	writeManifest(repository, 'packages/ui/package.json', {
		dependencies: { react: '^18.2.0', clsx: '^1.5.0' }
	})
	writeManifest(repository, 'packages/api/package.json', {
		dependencies: { react: '^18.3.1' }
	})
	commit(repository, 'after')

	const result = audit(repository, ['--from', 'HEAD^', '--to', 'HEAD'])
	assert.equal(result.status, 0, result.stderr)
	const report = JSON.parse(result.stdout)

	assert.deepEqual(report.manifests, { compared: 2 })
	assert.deepEqual(
		report.changes.map((change) => change.name),
		['clsx', 'internal', 'react', 'typescript']
	)

	const react = changeNamed(report, 'react')
	assert.equal(react.kind, 'upgrade')
	assert.equal(react.from, '^17.0.2')
	assert.equal(react.to, '^18.3.1', 'the widest range across workspaces wins')
	assert.equal(react.fromVersion, '17.0.2')
	assert.equal(react.toVersion, '18.3.1')
	assert.deepEqual(react.sections, ['dependencies'])
	assert.deepEqual(react.manifests, ['package.json', 'packages/ui/package.json'])
	assert.ok(
		!report.changes.some((change) => change.manifests.includes('packages/api/package.json')),
		'a manifest that only exists at the end ref cannot be diffed'
	)

	const clsx = changeNamed(report, 'clsx')
	assert.equal(clsx.kind, 'downgrade')
	assert.equal(clsx.fromVersion, '2.0.0')
	assert.equal(clsx.toVersion, '1.5.0')

	const typescript = changeNamed(report, 'typescript')
	assert.equal(typescript.kind, 'upgrade')
	assert.deepEqual(typescript.sections, ['devDependencies'])
	assert.equal(typescript.from, '~5.0.0')
	assert.equal(typescript.to, '~5.4.0')

	const internal = changeNamed(report, 'internal')
	assert.equal(internal.kind, 'unclassified', 'workspace: protocol carries no comparable version')
	assert.equal(internal.fromVersion, null)
	assert.equal(internal.toVersion, null)

	assert.ok(!report.changes.some((change) => change.name === 'lodash'), 'an unchanged range is not a change')
	assert.ok(!report.changes.some((change) => change.name === 'zod'), 'an added dependency is not a change')

	const missingFlag = audit(repository, ['--from', 'HEAD'])
	assert.notEqual(missingFlag.status, 0)
	assert.match(missingFlag.stderr, /--to is required/)

	const unresolvableRef = audit(repository, ['--from', 'HEAD', '--to', 'nope-not-a-ref'])
	assert.notEqual(unresolvableRef.status, 0)
	assert.match(unresolvableRef.stderr, /cannot resolve ref/)

	console.log('audit-deps: all assertions passed')
} finally {
	rmSync(repository, { recursive: true, force: true })
}
