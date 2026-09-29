'use strict'

const { parseArgs } = require('node:util')

function parseArguments(argv) {
	const { values } = parseArgs({ args: argv, options: { from: { type: 'string' }, to: { type: 'string' } } })
	if (values.from === undefined) throw new Error('--from is required (a commit, tag, branch or SHA)')
	if (values.to === undefined) throw new Error('--to is required (a commit, tag, branch or SHA)')
	return values
}

function parseChangelogOverrides(argv) {
	const { values } = parseArgs({ args: argv, options: { file: { type: 'string', multiple: true } } })
	const overrides = new Map()
	for (const entry of values.file ?? []) {
		const separator = entry.indexOf('=')
		if (separator === -1) throw new Error(`--file expects <package>=<path>, got: ${entry}`)
		overrides.set(entry.slice(0, separator), entry.slice(separator + 1))
	}
	return overrides
}

module.exports = { parseArguments, parseChangelogOverrides }
