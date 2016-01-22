#!/usr/bin/env node
/**
 * Reads tap-compliant data from stdin and only displays failures.
 */
var os = require('os');
var parser = require('tap-parser');
var program = require('commander');

var verbose = false;
var testSuccesses = 0;
var testFailures = 0;

program.description('Reads tap-compliant data from stdin and only displays failures by default.');
program.option('-v --verbose', 'Output information on test successes.');
program.parse(process.argv);

verbose = program.verbose;

// Callback fired when the test run has finished.
var p = parser(function (results) {
	// Display summary of tests that passed/failed
	console.log();
	console.log('# tests ' + (testSuccesses + testFailures));
	console.log('# pass ' + testSuccesses);
	if (testFailures) {
		console.log('# fail ' + testFailures);
	} else {
		console.log();
		console.log('# ok');
	}
	console.log();

	// Exit with a non-zero exit code if there were test failures.
	process.exit(results.ok ? 0 : 1);
});

// Callback fired at the end of each test.
p.on('assert', function (assert) {
	if (assert.ok) {
		if (verbose) {
			console.log('ok ' +  assert.id + ' ' + assert.name);
		}
		testSuccesses++;

	} else {
		var buffer = '';
		buffer += 'not ok ' +  assert.id + ' ' + assert.name + os.EOL;
		buffer += '  ---' + os.EOL;
		buffer += '    operator: ' + assert.diag.operator + os.EOL;
		buffer += '    expected: ' + assert.diag.expected + os.EOL;
		buffer += '    actual:   ' + assert.diag.actual + os.EOL;
		buffer += '    at:       ' + assert.diag.at + os.EOL;
		buffer += '  ...';
		console.log(buffer);
		testFailures++;
	}
});

process.stdin.pipe(p);
