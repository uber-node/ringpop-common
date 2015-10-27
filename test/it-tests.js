var program = require('commander');
var fs = require('fs');
var farmhash = require('farmhash');
var TestCoordinator = require('./test-coordinator');
var dsl = require('./ringpop-assert');
var programPath, programInterpreter;


function main() {
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


    require('./join-tests');
    require('./ping-tests');
    require('./ping-req-tests');
    require('./incarnation-no-tests');
    
    require('./piggyback-tests');
    require('./admin-tests');

    // require('./network-blip-tests');
    // require('./revive-tests');
}

function getProgramPath() {
    return programPath;
}

function getProgramInterpreter() {
    return programInterpreter;
}

// ./util uses this so we want to export it before require('./util') happens somewhere
module.exports = {
    getProgramInterpreter: getProgramInterpreter,
    getProgramPath: getProgramPath,
};

if (require.main === module) {
    main();
}