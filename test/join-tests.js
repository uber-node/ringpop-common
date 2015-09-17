var events = require('./events');
test = require('./util').test;
util = require('util');
var createCoordinator = require('./it-tests').createCoordinator;
var dsl = require('./ringpop-assert');

test('join real-node', function(t) {
    var nNodes = 8;
    var tc = createCoordinator(nNodes);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, nNodes),
        dsl.assertStats(t, tc, nNodes+1, 0, 0),
        // dsl.addFakeNode(t, tc),
        dsl.joinNewNode(t, tc, nNodes),
        dsl.waitForJoinResponse(t, tc, nNodes),
        dsl.wait(1000),
        dsl.assertStats(t, tc, nNodes+2, 0, 0),
        dsl.expectOnlyPings(t, tc),
    ], 20000);
});

function testJoinCluster(nNodes, nJoins) {
    test(util.format('join %d-node cluster', nNodes), function(t) {
        var tc = createCoordinator(nNodes);
        tc.start();

        dsl.validate(t, tc, [
            dsl.waitForJoins(t, tc, nJoins),
            dsl.assertStats(t, tc, nNodes+1, 0, 0),
            dsl.expectOnlyPings(t, tc),
        ], 20000);
    });
}

testJoinCluster(1, 1);
testJoinCluster(2, 2);
testJoinCluster(20, 6);


