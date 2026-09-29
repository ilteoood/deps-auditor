'use strict'

const FLAGS = ['--from', '--to']

function parseArguments(argv) {
	const values = {}
	for (let index = 0; index < argv.length; index += 2) {
		const flag = argv[index]
		const value = argv[index + 1]
		if (value === undefined) throw new Error(`${flag} requires a value`)
		if (!FLAGS.includes(flag)) throw new Error(`unknown flag: ${flag}`)
		if (values[flag] !== undefined) throw new Error(`${flag} given more than once`)
		values[flag] = value
	}
	if (values['--from'] === undefined) throw new Error('--from is required (a commit, tag, branch or SHA)')
	if (values['--to'] === undefined) throw new Error('--to is required (a commit, tag, branch or SHA)')
	return { from: values['--from'], to: values['--to'] }
}

module.exports = { parseArguments }
