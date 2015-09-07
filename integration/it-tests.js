// var Test = require('tape');
var program = require('commander');
var fs = require('fs');
var TestCoordinator = require('./test-coordinator');
var range = require('./util').range;
var farmhash = require('farmhash');
var assertJoins = require('./assertions').assertJoins;
var requestAdminStats = require('./assertions').requestAdminStats;
var assertStats = require('./assertions').assertStats;
var wait = require('./assertions').wait;
var clear = require('./assertions').clear;

var assertOnlyPings = require('./assertions').assertOnlyPings;
var assertRoundRobinPings = require('./assertions').assertRoundRobinPings;

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
    // tc.on('event', function(event) { 
    //     console.log(event.endpoint, event.direction);
    // });
    return tc;
}

// test is normal tape test but also prints t._failMessage if a fail occured
var Test = require('tape');
function test(msg, opts, cb) {
    var t = Test(msg, opts, cb);
    t.on('result', function(res) {
        if(res.error !== undefined) {
            console.log('============== error details ===============');
            console.log();
            console.log(res.error);
            console.log();
            console.log('============================================');
            console.log();
        }
    });
}


test('join single-node cluster', function(t) {
    var n = 1
    var tc = createCoordinator(n);
    tc.start();

    tc.validate(t, [
        assertJoins(t, tc, n),
        requestAdminStats(tc),
        assertStats(t, tc, n+1, 0, 0),
        assertOnlyPings(t, tc),
    ], 2000);
});

test('join two-node cluster', function(t) {
    var n = 2;
    var tc = createCoordinator(n);
    tc.start();

    tc.validate(t, [
        assertJoins(t, tc, n),
        requestAdminStats(tc),
        assertStats(t, tc, n+1, 0, 0),
        assertOnlyPings(t, tc),
    ], 2000);
});

test('join twenty-node cluster', function(t) {
    var n = 20;
    var tc = createCoordinator(n);
    tc.start();

    tc.validate(t, [
        assertJoins(t, tc, 6),
        requestAdminStats(tc),
        assertStats(t, tc, n+1, 0, 0),
        assertOnlyPings(t, tc),
    ], 2000);
});



test('ping 7-node cluster', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    tc.validate(t, [
        assertJoins(t, tc, 6),
        requestAdminStats(tc),
        assertStats(t, tc, n+1, 0, 0),
        wait(6000),
        assertRoundRobinPings(t, tc, 30),
        assertOnlyPings(t, tc),
    ], 20000);
})
