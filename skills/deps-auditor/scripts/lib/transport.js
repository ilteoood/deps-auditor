'use strict'

const { execFileSync } = require('node:child_process')
const { request } = require('node:https')

const OUTPUT_LIMIT = 16 * 1024 * 1024
const TIMEOUT_MS = 15_000

function https(url, headers) {
	return new Promise((resolve) => {
		const outgoing = request(url, { headers }, (response) => {
			let body = ''
			response.setEncoding('utf8')
			response.on('data', (chunk) => {
				body += chunk
			})
			response.on('end', () => resolve({ status: response.statusCode, body }))
		})
		outgoing.setTimeout(TIMEOUT_MS, () => outgoing.destroy(new Error(`no response within ${TIMEOUT_MS}ms`)))
		outgoing.on('error', (error) => resolve({ status: 0, body: '', error: error.message }))
	})
}

function github(args) {
	try {
		const quiet = { encoding: 'utf8', maxBuffer: OUTPUT_LIMIT, stdio: ['pipe', 'pipe', 'pipe'] }
		return { status: 200, body: execFileSync('gh', args, quiet) }
	} catch (error) {
		if (error.code === 'ENOENT') return { status: 0, body: '', error: 'gh is not on the path' }
		// ponytail: gh reports every failure as exit 1, so a 500 is reported as 404.
		// Distinguishing them needs `gh api -i` and header parsing; add it if a report
		// is ever wrong about a GitHub source existing.
		return { status: error.status === 1 ? 404 : 0, body: '', error: String(error.stderr || error.message).trim() }
	}
}

module.exports = { github, https }
