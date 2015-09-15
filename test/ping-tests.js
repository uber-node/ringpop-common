var createCoordinator = require('./it-tests').createCoordinator;
var events = require('./events');
test = require('./util').test;
var dsl = require('./ringpop-assert');

test('ping 7-node cluster', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, 6),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.assertRoundRobinPings(t, tc, 30, 6000),
        dsl.expectOnlyPings(t, tc),
    ], 20000);
});

