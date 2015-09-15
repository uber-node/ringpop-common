var createCoordinator = require('./it-tests').createCoordinator;
var events = require('./events');
test = require('./util').test;
var dsl = require('./ringpop-assert');

test('alive, suspect, faulty cycle in 7-node cluster', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, 6),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.assertRoundRobinPings(t, tc, 5, 1000),
        dsl.disableNode(t, tc, 0),
        // changeHandler(t, tc, 0, events.Types.Ping, function() {}),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(4000),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(1000),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.wait(5000),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.expectOnlyPingsAndPingReqs(t, tc),
    ], 20000);
});
