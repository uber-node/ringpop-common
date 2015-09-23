var events = require('./events');
test2 = require('./it-tests').test2;
var dsl = require('./ringpop-assert');

function prepareCluster(insert_fns) {
    return function(t, tc, n) {
        return [
            dsl.waitForJoins(t, tc, n),
            dsl.assertStats(t, tc, n+1, 0, 0),
            insert_fns(t, tc, n),
            dsl.expectOnlyPingsAndPingReqs(t, tc),
        ];
    }
}

function prepareWithStatus(ix, status, insert_fns) {
    var sourceIx = 0;
    if (ix == sourceIx) {
        sourceIx = 1;
    }

    return prepareCluster(function(t, tc, n) { return [
        dsl.sendPing(t, tc, sourceIx, {sourceIx: sourceIx, subjectIx: ix, status: status }),
        dsl.waitForPingResponse(t, tc, sourceIx),
        insert_fns(t, tc, n),
    ];});
}

test2('ping-req real-node with a disabled target', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.disableNode(t, tc, 1),
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, false),
        // do not make suspect after ping status = false
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('ping-req real-node with enabled target', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, true),
        // safety check
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('become suspect through disabling ping response', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.disableNode(t, tc, 1),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0),
    ];})
);

test2('5-second suspect window', 8, 20000, 
    prepareWithStatus(1, 'suspect', function(t, tc, n) { return [
        dsl.assertStats(t, tc, 8, 1, 0),
        dsl.wait(4000),
        dsl.assertStats(t, tc, 8, 1, 0),
        dsl.wait(1100),
        dsl.assertStats(t, tc, 8, 0, 1),
        dsl.wait(5000),
        dsl.assertStats(t, tc, 8, 0, 1),
    ];})
);
test2('ping-req real-node with a disabled target', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.disableNode(t, tc, 1),
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, false),
        // do not make suspect after ping status = false
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('ping-req real-node with enabled target', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, true),
        // safety check
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('become suspect through disabling ping response', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.disableNode(t, tc, 1),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0),
    ];})
);

test2('5-second suspect window', 8, 20000, 
    prepareWithStatus(1, 'suspect', function(t, tc, n) { return [
        dsl.assertStats(t, tc, 8, 1, 0),
        dsl.wait(4000),
        dsl.assertStats(t, tc, 8, 1, 0),
        dsl.wait(1100),
        dsl.assertStats(t, tc, 8, 0, 1),
        dsl.wait(5000),
        dsl.assertStats(t, tc, 8, 0, 1),
    ];})
);

function testSetStatusViaPiggyback(n, status, nAlive, nSuspect, nFaulty) {
    test2('prepare node with status ' + status, n, 20000, 
        prepareWithStatus(1, status, function(t, tc, n) { return [
                dsl.assertStats(t, tc, nAlive, nSuspect, nFaulty),
        ];})
    );
}

testSetStatusViaPiggyback(8, 'alive',   9, 0, 0);
testSetStatusViaPiggyback(8, 'suspect', 8, 1, 0);
testSetStatusViaPiggyback(8, 'faulty',  8, 0, 1);


function joinFrom(n, status, incNoDelta, nAlive, nSuspect, nFaulty) {
    test2('join from ' + status + ' with incNoDelta ' + incNoDelta, n, 20000, 
        prepareWithStatus(0, status, function(t, tc, n) { return [
            dsl.disableNode(t, tc, 0),
            dsl.enableNode(t, tc, 0, tc.fakeNodes[0].incarnationNumber+incNoDelta),
            dsl.sendJoin(t, tc, 0),
            dsl.waitForJoinResponse(t, tc, 0),
            dsl.assertStats(t, tc, nAlive, nSuspect, nFaulty),
        ];})
    );
}

joinFrom(8, 'alive', -1, 9, 0, 0);
joinFrom(8, 'alive',  0, 9, 0, 0);
joinFrom(8, 'alive',  1, 9, 0, 0);


joinFrom(8, 'suspect', -1, 8, 1, 0);
joinFrom(8, 'suspect',  0, 8, 1, 0);
joinFrom(8, 'suspect',  1, 9, 0, 0);


joinFrom(8, 'faulty', -1, 8, 0, 1);
joinFrom(8, 'faulty',  0, 8, 0, 1);
joinFrom(8, 'faulty',  1, 9, 0, 0);


// piggyback {alive, suspect, faulty} status of fake-node
// who is {alive, suspect, faulty} with {lower, equal, higher}
// incarnation number than the fake-node (27 combinations)
function changeStatus(n, initial, finalS, incNoDelta, nAlive, nSuspect, nFaulty) {
    var ix = 1;
    test2('change status from ' + initial + ', to ' + finalS + 
        ' with incNoDelta ' + incNoDelta + ' via piggybacking', 
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
