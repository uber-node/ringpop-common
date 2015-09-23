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


    // require('./join-tests');
    // require('./ping-tests');
    require('./ping-req-tests');
        
    // require('./network-blip-tests');
    // require('./revive-tests');
}

function getProgramPath() {
    return programPath;
}

function getProgramInterpreter() {
    return programInterpreter;
}

// test is like normal tape test but also prints t.error.details if a fail occured
var Test = require('tape');
function test(msg, opts, cb) {
    var t = Test(msg, opts, cb);
    t.on('result', function(res) {
        if(!res.ok && res.error.details !== undefined) {
            console.log('============== error details ===============');
            console.log();
            console.log(res.error.details);
            console.log();
            console.log('============================================');
            console.log();
        }
    });
}

function test2(str, n, deadline, callback) {
    test(str, function(t) {

        var tc = new TestCoordinator({
            sut: {
                program: getProgramPath(),
                interpreter: getProgramInterpreter(),
            },
            numNodes: n,
        });

        tc.start(function onTCStarted() {
            dsl.validate(t, tc, callback(t, tc, n), deadline);
        });
    })
}

// ./util uses this so we want to export it before require('./util') happens somewhere
module.exports = {
    getProgramInterpreter: getProgramInterpreter,
    getProgramPath: getProgramPath,
    test: test,
    test2: test2,
    // createCoordinator: createCoordinator,
};

if (require.main === module) {
    main();
}