var events = require('./events');
test = require('./util').test;
util = require('util');
var createCoordinator = require('./it-tests').createCoordinator;
var dsl = require('./ringpop-assert');


function testJoinCluster(nNodes, nJoins) {
    test(util.format('join %d-node cluster', nNodes), function(t) {
        var tc = createCoordinator(nNodes);
        tc.start();
        
        dsl.validate(t, tc, [
            dsl.waitForJoins(t, tc, nJoins),
            dsl.assertStats(t, tc, nNodes+1, 0, 0),
            dsl.expectOnlyPings(t, tc),
        ], 2000);
    });
}

testJoinCluster(1, 1);
testJoinCluster(2, 2);
testJoinCluster(20, 6);

// test('join real-node', function(t) {
// 	var nNodes = 8;
//     var tc = createCoordinator(nNodes);
//     tc.start();

//     dsl.run(t, tc, [
//         dsl.waitForJoins(t, tc, 6),
//         dsl.assertStats(t, tc, nNodes+1, 0, 0),
//         dsl.assertStats(t, tc, nNodes+1, 0, 0),
//         // dsl.sendPing(t, tc, 1),
//         // dsl.sendJoin(t, tc, 1),
//         dsl.expectOnlyPings(t, tc),
//     ], 20000);
// });