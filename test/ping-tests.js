var createCoordinator = require('./it-tests').createCoordinator;
var events = require('./events');
test = require('./util').test;
var dsl = require('./ringpop-assert');

test('ping 7-node cluster', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.assertRoundRobinPings(t, tc, 30, 6000),
        dsl.expectOnlyPings(t, tc),
    ], 20000);
});

test('ping real-node from fake-nodes', function(t) {
	var nNodes = 8;
    var tc = createCoordinator(nNodes);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, nNodes),
        dsl.assertStats(t, tc, nNodes+1, 0, 0),
        dsl.sendPings(t, tc, [0,1,1,1,5,6,7]),
        dsl.waitForPingResponses(t, tc, [0,1,1,1,5,6,7]),
        dsl.expectOnlyPings(t, tc),
    ], 20000);
});
