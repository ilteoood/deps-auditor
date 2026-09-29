'use strict'

const { spawnSync } = require('node:child_process')
const { request } = require('node:https')

const OUTPUT_LIMIT = 16 * 1024 * 1024
const TIMEOUT_MS = 15_000
const STATUS_LINE = /^HTTP\/\S+\s+(\d{3})/
const HEADERS_END = /\r?\n\r?\n/

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

function parseResponse(output) {
	const separator = HEADERS_END.exec(output)
	if (separator === null) return { status: 0, body: '', error: 'gh printed no response headers' }
	const status = Number(STATUS_LINE.exec(output.slice(0, separator.index))?.[1] ?? 0)
	return { status, body: output.slice(separator.index + separator[0].length) }
}

function github(args) {
	const result = spawnSync('gh', ['api', '--include', ...args], { encoding: 'utf8', maxBuffer: OUTPUT_LIMIT })
	if (result.error !== undefined) {
		return { status: 0, body: '', error: result.error.code === 'ENOENT' ? 'gh is not on the path' : result.error.message }
	}
	return parseResponse(result.stdout ?? '')
}

module.exports = { github, https }
