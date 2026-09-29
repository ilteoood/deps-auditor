'use strict'

const { execFileSync } = require('node:child_process')

const OUTPUT_LIMIT = 64 * 1024 * 1024

function run(args, { allowFailure = false } = {}) {
	try {
		return execFileSync('git', args, { encoding: 'utf8', maxBuffer: OUTPUT_LIMIT })
	} catch (error) {
		if (allowFailure) return null
		throw new Error(`git ${args.join(' ')} failed: ${String(error.stderr || error.message).trim()}`)
	}
}

function resolveCommit(ref) {
	const resolved = run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFailure: true })
	if (resolved === null || resolved.trim() === '') throw new Error(`cannot resolve ref: ${ref}`)
	return resolved.trim()
}

function listFiles(commit) {
	return run(['ls-tree', '-r', '--name-only', commit])
		.split('\n')
		.filter((path) => path !== '')
}

function readFileAt(commit, path) {
	return run(['show', `${commit}:${path}`])
}

module.exports = { listFiles, readFileAt, resolveCommit }
