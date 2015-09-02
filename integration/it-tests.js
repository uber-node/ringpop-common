var _ = require('underscore');
var test = require('tape');
var program = require('commander');
var fs = require('fs');
var TestCoordinator = require('./test-coordinator');
var range = require('./util').range;
var farmhash = require('farmhash');
var events = require('./events');

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
    return new TestCoordinator({
        sut: {
            program: programPath,
            interpreter: programInterpreter
        },
        numNodes: numNodes
    });
}

function assertValidAdminStats(t, stats) {
    t.ok(stats, 'Stats should be present');
    t.ok(stats.membership && stats.membership.members, 'And should contain a membership list');
}

// XXX make this much richer
function assertMembership(t, adminStats, expectedMembership) {
    var reportedMembership = adminStats.membership.members.map(_.property('address'))
    expectedMembership = expectedMembership.sort();

    t.deepEqual(reportedMembership, expectedMembership, 'Membership is ' + expectedMembership);
}

test('join single-node cluster', function(t) {
    var tc = createCoordinator(1);

    tc.start();
    tc.waitForEvent({
        type: events.Types.Join,
        deadline: 1000
    }, function afterJoin(event) {
        tc.getAdminStats(function handleStats(err, stats) {
            tc.shutdown();
            t.ok(event, 'Should get a request from the real node');

            t.notOk(err, 'Should retrieve admin status successfully');
            assertValidAdminStats(t, stats);

            var expectedMembership = tc.getFakeNodeHostPortList().concat(tc.getSUTHostPort())
            assertMembership(t, stats, expectedMembership);
            t.end();
        });
    });
});

test('join two-node cluster', function(t) {
    var tc = createCoordinator(2);

    tc.start();
    tc.waitForEvent({
        type: events.Types.Join,
        deadline: 1000
    }, function afterJoin(event) {
        tc.getAdminStats(function handleStats(err, stats) {
            tc.shutdown();
            t.ok(event, 'Should get a request from the real node');

            t.notOk(err, 'Should retrieve admin status successfully');
            assertValidAdminStats(t, stats);

            var expectedMembership = tc.getFakeNodeHostPortList().concat(tc.getSUTHostPort())
            assertMembership(t, stats, expectedMembership);
            t.end();
        });
    });
});
