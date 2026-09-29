'use strict'

const { parseArgs } = require('node:util')

function parseArguments(argv) {
	const { values } = parseArgs({ args: argv, options: { from: { type: 'string' }, to: { type: 'string' } } })
	if (values.from === undefined) throw new Error('--from is required (a commit, tag, branch or SHA)')
	if (values.to === undefined) throw new Error('--to is required (a commit, tag, branch or SHA)')
	return values
}

module.exports = { parseArguments }
