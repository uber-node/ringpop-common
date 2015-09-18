var createCoordinator = require('./it-tests').createCoordinator;
var events = require('./events');
test = require('./util').test;
var dsl = require('./ringpop-assert');

test('ping-req real-node with a disabled target', function(t) {
    var nNodes = 8;
    var tc = createCoordinator(nNodes);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, nNodes),
        dsl.assertStats(t, tc, nNodes+1, 0, 0),
        dsl.disableNode(t, tc, 1),
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, false),
        // do not make suspect after ping status = false
        dsl.assertStats(t, tc, nNodes+1, 0, 0),
        dsl.expectOnlyPings(t, tc),
    ], 20000);
});

test('ping-req real-node with enabled target', function(t) {
    var nNodes = 8;
    var tc = createCoordinator(nNodes);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, nNodes),
        dsl.assertStats(t, tc, nNodes+1, 0, 0),
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, true),
        dsl.assertStats(t, tc, nNodes+1, 0, 0),
        dsl.expectOnlyPings(t, tc),
    ], 20000);
});

test('alive, suspect, faulty cycle in 7-node cluster', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, Math.max(6, n-1)),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.assertRoundRobinPings(t, tc, Math.min(5, n-1), 1000),
        dsl.disableNode(t, tc, 0),
        dsl.waitForPingReqs(t, tc, Math.min(3, n-1)),
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

test('alive, suspect, alive (via re-join) cycle in 7-node cluster', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, 6),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.assertRoundRobinPings(t, tc, 5, 1000),
        dsl.disableNode(t, tc, 0),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(3000),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.enableNode(t, tc, 0, 1338),
        dsl.sendJoin(t, tc, 0),
        dsl.waitForJoinResponse(t, tc, 0),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.expectOnlyPingsAndPingReqs(t, tc),
    ], 20000);
});

test('alive, suspect, faulty, alive (via re-join) cycle in 7-node cluster', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, 6),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.assertRoundRobinPings(t, tc, 5, 1000),
        dsl.disableNode(t, tc, 0),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(4000),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(1000),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.wait(5000),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.enableNode(t, tc, 0, 1338),
        dsl.sendJoin(t, tc, 0),
        dsl.waitForJoinResponse(t, tc, 0),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.expectOnlyPingsAndPingReqs(t, tc),
    ], 20000);
});

test('don\'t bump up incarnation number and fail to revive from suspect because of it', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, 6),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.assertRoundRobinPings(t, tc, 5, 1000),
        dsl.disableNode(t, tc, 0),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(3000),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.enableNode(t, tc, 0, 1337),
        dsl.sendJoin(t, tc, 0),
        dsl.waitForJoinResponse(t, tc, 0),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(2000),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.wait(1000),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.expectOnlyPingsAndPingReqs(t, tc),
    ], 20000);
});

test('don\'t bump up incarnation number and fail to revive from faulty because of it', function(t) {
    var n = 7;
    var tc = createCoordinator(n);
    tc.start();

    dsl.validate(t, tc, [
        dsl.waitForJoins(t, tc, 6),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.assertRoundRobinPings(t, tc, 5, 1000),
        dsl.disableNode(t, tc, 0),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(4000),
        dsl.assertStats(t, tc, n, 1, 0),
        dsl.wait(1000),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.wait(5000),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.enableNode(t, tc, 0, 1337),
        dsl.sendJoin(t, tc, 0),
        dsl.waitForJoinResponse(t, tc, 0),
        dsl.assertStats(t, tc, n, 0, 1),
        dsl.expectOnlyPingsAndPingReqs(t, tc),
    ], 20000);
});


