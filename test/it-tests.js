// var Test = require('tape');
var program = require('commander');
var fs = require('fs');
var TestCoordinator = require('./test-coordinator');
var range = require('./util').range;
var farmhash = require('farmhash');

var programPath, programInterpreter;

program
    .version(require('../package.json').version)
    .option('-i, --interpreter <interpreter>', 'Interpreter that runs program.')
    .arguments('<program>')
    .description('it-test performs an integration test on a ringpop program')
    .action(function onAction(path, options) {
        programPath = path;
        if (programPath[0] !== '/') {
            programPath = './' + programPath;
        }
        programInterpreter = options.interpreter;
    });

program.parse(process.argv);

if (!programPath) {
    console.log('Error: program is required');
    process.exit(1);
}

if (!fs.existsSync(programPath)) {
    console.log('Error: program ' + programPath + ' does not exist. Check path');
    process.exit(1);
}

function createCoordinator(numNodes) {
    var tc = new TestCoordinator({
        sut: {
            program: programPath,
            interpreter: programInterpreter
        },
        numNodes: numNodes
    });

    return tc;
}

module.exports = {
    createCoordinator: createCoordinator,
}

// require('./join-tests');
// require('./ping-tests');
require('./ping-req-tests');
    
// require('./network-blip-tests');
// require('./revive-tests');