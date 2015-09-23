var createCoordinator = require('./it-tests').createCoordinator;
var events = require('./events');
test = require('./util').test;
var dsl = require('./ringpop-assert');

// test('ping-req real-node with a disabled target', function(t) {
//     var nNodes = 8;
//     var tc = createCoordinator(nNodes);
//     tc.start();

//     dsl.validate(t, tc, [
//         dsl.waitForJoins(t, tc, nNodes),
//         dsl.assertStats(t, tc, nNodes+1, 0, 0),
//         dsl.disableNode(t, tc, 1),
//         dsl.sendPingReq(t, tc, 0, 1),
//         dsl.waitForPingReqResponse(t, tc, 0, 1, false),
//         // do not make suspect after ping status = false
//         dsl.assertStats(t, tc, nNodes+1, 0, 0),
//         dsl.expectOnlyPings(t, tc),
//     ], 20000);
// });

// test('ping-req real-node with enabled target', function(t) {
//     var nNodes = 8;
//     var tc = createCoordinator(nNodes);
//     tc.start();

//     dsl.validate(t, tc, [
//         dsl.waitForJoins(t, tc, nNodes),
//         dsl.assertStats(t, tc, nNodes+1, 0, 0),
//         dsl.sendPingReq(t, tc, 0, 1),
//         dsl.waitForPingReqResponse(t, tc, 0, 1, true),
//         dsl.assertStats(t, tc, nNodes+1, 0, 0),
//         dsl.expectOnlyPings(t, tc),
//     ], 20000);
// });

// test('alive, suspect, faulty cycle in 7-node cluster', function(t) {
//     var n = 7;
//     var tc = createCoordinator(n);
//     tc.start();

//     dsl.validate(t, tc, [
//         dsl.waitForJoins(t, tc, 6),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.assertRoundRobinPings(t, tc, 5, 1000),
//         dsl.disableNode(t, tc, 0),
//         dsl.waitForPingReqs(t, tc, 3),
//         dsl.wait(100),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(4000),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(1000),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.wait(5000),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.expectOnlyPingsAndPingReqs(t, tc),
//     ], 20000);
// });

// test('alive, suspect, alive (via re-join) cycle in 7-node cluster', function(t) {
//     var n = 7;
//     var tc = createCoordinator(n);
//     tc.start();

//     dsl.validate(t, tc, [
//         dsl.waitForJoins(t, tc, 6),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.assertRoundRobinPings(t, tc, 5, 1000),
//         dsl.disableNode(t, tc, 0),
//         dsl.waitForPingReqs(t, tc, 3),
//         dsl.wait(100),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(3000),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.enableNode(t, tc, 0, 1338),
//         dsl.sendJoin(t, tc, 0),
//         dsl.waitForJoinResponse(t, tc, 0),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.expectOnlyPingsAndPingReqs(t, tc),
//     ], 20000);
// });

// test('alive, suspect, faulty, alive (via re-join) cycle in 7-node cluster', function(t) {
//     var n = 7;
//     var tc = createCoordinator(n);
//     tc.start();

//     dsl.validate(t, tc, [
//         dsl.waitForJoins(t, tc, 6),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.assertRoundRobinPings(t, tc, 5, 1000),
//         dsl.disableNode(t, tc, 0),
//         dsl.waitForPingReqs(t, tc, 3),
//         dsl.wait(100),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(4000),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(1000),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.wait(5000),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.enableNode(t, tc, 0, 1338),
//         dsl.sendJoin(t, tc, 0),
//         dsl.waitForJoinResponse(t, tc, 0),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.expectOnlyPingsAndPingReqs(t, tc),
//     ], 20000);
// });

// test('don\'t bump up incarnation number and fail to revive from suspect because of it', function(t) {
//     var n = 7;
//     var tc = createCoordinator(n);
//     tc.start();

//     dsl.validate(t, tc, [
//         dsl.waitForJoins(t, tc, 6),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.assertRoundRobinPings(t, tc, 5, 1000),
//         dsl.disableNode(t, tc, 0),
//         dsl.waitForPingReqs(t, tc, 3),
//         dsl.wait(100),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(3000),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.enableNode(t, tc, 0, 1337),
//         dsl.sendJoin(t, tc, 0),
//         dsl.waitForJoinResponse(t, tc, 0),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(2000),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.wait(1000),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.expectOnlyPingsAndPingReqs(t, tc),
//     ], 20000);
// });

// test('don\'t bump up incarnation number and fail to revive from faulty because of it', function(t) {
//     var n = 7;
//     var tc = createCoordinator(n);
//     tc.start();

//     dsl.validate(t, tc, [
//         dsl.waitForJoins(t, tc, 6),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.assertRoundRobinPings(t, tc, 5, 1000),
//         dsl.disableNode(t, tc, 0),
//         dsl.waitForPingReqs(t, tc, 3),
//         dsl.wait(100),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(4000),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(1000),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.wait(5000),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.enableNode(t, tc, 0, 1337),
//         dsl.sendJoin(t, tc, 0),
//         dsl.waitForJoinResponse(t, tc, 0),
//         dsl.assertStats(t, tc, n, 0, 1),
//         dsl.expectOnlyPingsAndPingReqs(t, tc),
//     ], 20000);
// });


// test('alive, suspect, alive (via re-join) cycle in 7-node cluster', function(t) {
//     var n = 7;
//     var tc = createCoordinator(n);
//     tc.start();

//     var disabledIx = 1;
//     dsl.validate(t, tc, [
//         dsl.waitForJoins(t, tc, 6),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.assertRoundRobinPings(t, tc, 5, 1000),
//         dsl.disableNode(t, tc, disabledIx),
//         dsl.waitForPingReqs(t, tc, 3),
//         dsl.wait(100),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.wait(3000),
//         dsl.assertStats(t, tc, n, 1, 0),
//         dsl.enableNode(t, tc, disabledIx, 1338),
//         dsl.wait(1000),
//         dsl.sendPing(t, tc, 2, {sourceIx: 2, subjectIx: disabledIx, status: 'alive' }),
//         dsl.waitForPingResponse(t, tc, 2),
//         dsl.assertStats(t, tc, n+1, 0, 0),
//         dsl.expectOnlyPingsAndPingReqs(t, tc),
//     ], 20000);
// });


function test2(str, n, deadline, callback) {    
    test(str, function(t) {
        var tc = createCoordinator(n)
        tc.start(function onTCStarted() {
            dsl.validate(t, tc, callback(t, tc, n), deadline);
        });
    })
}


function prepareWithStatus(ix, status, insert_fns) {
    return function(t, tc, n) {
        var sourceIx = 0;
        if (ix == sourceIx) {
            sourceIx = 1;
        }

        return [
            dsl.waitForJoins(t, tc, n),
            dsl.assertStats(t, tc, n+1, 0, 0),
            dsl.disableNode(t, tc, ix),
            dsl.sendPing(t, tc, sourceIx, {sourceIx: sourceIx, subjectIx: ix, status: status }),
            dsl.waitForPingResponse(t, tc, sourceIx),
            insert_fns(t, tc, n),
            dsl.expectOnlyPingsAndPingReqs(t, tc),
        ];
    };
}


function testSetStatusViaPiggyback(n, status, nAlive, nSuspect, nFaulty) {
    test2('prepare node with status ' + status, n, 20000, 
        prepareWithStatus(1, status, function(t, tc, n) {
            return [
                dsl.assertStats(t, tc, nAlive, nSuspect, nFaulty),
            ]
        })
    );
}

testSetStatusViaPiggyback(8, 'alive',   9, 0, 0);
testSetStatusViaPiggyback(8, 'suspect', 8, 1, 0);
testSetStatusViaPiggyback(8, 'faulty',  8, 0, 1);


// piggyback {alive, suspect, faulty} status of fake-node
// who is {alive, suspect, faulty} with {lower, equal, higher}
// incarnation number than the fake-node (27 combinations)
function changeStatus(n, initial, finalS, incNoDelta, nAlive, nSuspect, nFaulty) {
    var ix = 1;
    test2('change status from ' + initial + ', to ' + finalS + 
        ' with incNoDelta' + incNoDelta + ' via piggybacking', 
        8, 20000, prepareWithStatus(ix, initial, function(t, tc, n) {
            return [
                dsl.sendPing(t, tc, 0, 
                    {sourceIx: 0, subjectIx: ix, status: finalS, subjectIncNoDelta: incNoDelta}),
                dsl.waitForPingResponse(t, tc, 0),
                dsl.assertStats(t, tc, nAlive, nSuspect, nFaulty),
            ];
        })
    );
}


changeStatus(8, 'alive',  'alive',    -1, 9, 0, 0);
changeStatus(8, 'alive',  'alive',    0,  9, 0, 0);
changeStatus(8, 'alive',  'alive',    1,  9, 0, 0);

changeStatus(8, 'alive',  'suspect',  -1, 9, 0, 0);
changeStatus(8, 'alive',  'suspect',  0,  8, 1, 0);
changeStatus(8, 'alive',  'suspect',  1,  8, 1, 0);

changeStatus(8, 'alive',  'faulty',   -1, 9, 0, 0);
changeStatus(8, 'alive',  'faulty',   0,  8, 0, 1);
changeStatus(8, 'alive',  'faulty',   1,  8, 0, 1);

changeStatus(8, 'suspect', 'alive',   -1, 8, 1, 0);
changeStatus(8, 'suspect', 'alive',   0,  8, 1, 0);
changeStatus(8, 'suspect', 'alive',   1,  9, 0, 0);

changeStatus(8, 'suspect', 'suspect', -1, 8, 1, 0);
changeStatus(8, 'suspect', 'suspect', 0,  8, 1, 0);
changeStatus(8, 'suspect', 'suspect', 1,  8, 1, 0);

changeStatus(8, 'suspect', 'faulty',  -1, 8, 1, 0);
changeStatus(8, 'suspect', 'faulty',  0,  8, 0, 1);
changeStatus(8, 'suspect', 'faulty',  1,  8, 0, 1);

changeStatus(8, 'faulty',  'alive',   -1, 8, 0, 1);
changeStatus(8, 'faulty',  'alive',   0,  8, 0, 1);
changeStatus(8, 'faulty',  'alive',   1,  9, 0, 0);

changeStatus(8, 'faulty',  'suspect', -1, 8, 0, 1);
changeStatus(8, 'faulty',  'suspect', 0,  8, 0, 1);
changeStatus(8, 'faulty',  'suspect', 1,  8, 1, 0);

changeStatus(8, 'faulty',  'faulty',  -1, 8, 0, 1);
changeStatus(8, 'faulty',  'faulty',  0,  8, 0, 1);
changeStatus(8, 'faulty',  'faulty',  1,  8, 0, 1);

