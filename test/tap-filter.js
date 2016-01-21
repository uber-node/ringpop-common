#!/usr/bin/env node
/**
 * Reads tap-compliant data from stdin outputs successes to stdout and errors
 * to stderr.
 */
var os = require('os')
var parser = require('tap-parser');

// Exit using the correct exit code depending on whether the tests passed or
// failed.
var p = parser(function (results) {
	process.exit(results.ok ? 0 : 1);
});

// Parse the data from stdin and output success to stdout and errors to stderr.
// Malformed data (or data that cannot be parsed) will be thrown away.
p.on('assert', function (assert) {
	if (assert.ok) {
		console.log('ok ' +  assert.id + ' ' + assert.name);
	} else {
		var buffer = '';
		buffer += 'not ok ' +  assert.id + ' ' + assert.name + os.EOL;
		buffer += '  ---' + os.EOL;
		buffer += '    operator: ' + assert.diag.operator + os.EOL;
		buffer += '    expected: ' + assert.diag.expected + os.EOL;
		buffer += '    actual:   ' + assert.diag.actual + os.EOL;
		buffer += '    at:       ' + assert.diag.at + os.EOL;
		buffer += '  ...';
		console.error(buffer);
	}
});

process.stdin.pipe(p);
