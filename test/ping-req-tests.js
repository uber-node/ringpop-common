// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var events = require('./events');
var dsl = require('./ringpop-assert');
var test2 = require('./test-util').test2;
var prepareCluster = require('./test-util').prepareCluster;
var prepareWithStatus = require('./test-util').prepareWithStatus;
var _ = require('lodash');
var clusterSizes = require('./test-util').clusterSizes;
clusterSizes = _.filter(clusterSizes, function(n) { return n > 1; });


test2('ping-req real-node with a disabled target', clusterSizes, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.disableNode(t, tc, 1),
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, false),
        // do not make suspect after ping status = false
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('ping-req real-node with enabled target', clusterSizes, 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, true),
        // safety check
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('become suspect through disabling ping response', clusterSizes, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.disableNode(t, tc, 1),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0, {1: {status: 'suspect'}}),
    ];})
);

test2('5-second suspect window', clusterSizes, 20000, 
    prepareWithStatus(1, 'suspect', function(t, tc, n) { return [
        dsl.assertStats(t, tc, n, 1, 0, {1: {status: 'suspect'}}),
        dsl.wait(4000),
        dsl.assertStats(t, tc, n, 1, 0, {1: {status: 'suspect'}}),
        dsl.wait(1100),
        dsl.assertStats(t, tc, n, 0, 1, {1: {status: 'faulty'}}),
        dsl.wait(5000),
        dsl.assertStats(t, tc, n, 0, 1, {1: {status: 'faulty'}}),
    ];})
);

function testSetStatusViaPiggyback(ns, status, deltaAlive, nSuspect, nFaulty) {
    test2('prepare node with status ' + status, ns, 20000, 
        prepareWithStatus(1, status, function(t, tc, n) { return [
                dsl.assertStats(t, tc, n + deltaAlive, nSuspect, nFaulty, {1: {status: status}}),
        ];})
    );
}

testSetStatusViaPiggyback(clusterSizes, 'alive',   1, 0, 0);
testSetStatusViaPiggyback(clusterSizes, 'suspect', 0, 1, 0);
testSetStatusViaPiggyback(clusterSizes, 'faulty',  0, 0, 1);

test2('change nodes status to suspect piggybacked on a ping-req', _.filter(clusterSizes, function(n) { return n > 2; }), 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPingReq(t, tc, 0, 1, 
            {sourceIx: 0, subjectIx: 2, status: 'suspect'}),
        dsl.waitForPingReqResponse(t, tc, 0, 1, true),
        // check if piggyback update has taken effect
        dsl.assertStats(t, tc, n, 1, 0, {2: {status: 'suspect'}}),
    ];})
);

function joinFrom(n, status, incNoDelta, deltaAlive, nSuspect, nFaulty) {
    test2('join from ' + status + ' with incNoDelta ' + incNoDelta, n, 20000, 
        prepareWithStatus(0, status, function(t, tc, n) {
            if (incNoDelta > 0) {
                status = 'alive';
            }
            return [
                dsl.disableNode(t, tc, 0),
                dsl.enableNode(t, tc, 0, tc.fakeNodes[0].incarnationNumber+incNoDelta),
                dsl.sendJoin(t, tc, 0),
                dsl.waitForJoinResponse(t, tc, 0),
                // we expect the node to get rejected if incNoDelta<0, 
                // so the actual incarnation number has to be set so that
                // assertStats compares to the expected incarnationNumbers
                function(list, cb) {
                    if (incNoDelta < 0) {
                        tc.fakeNodes[0].incarnationNumber -= incNoDelta;
                    }
                    cb(list);
                },
                dsl.assertStats(t, tc, n + deltaAlive, nSuspect, nFaulty, {0: {status: status}}),
            ];
        })
    );
}

joinFrom(clusterSizes, 'alive', -1, 1, 0, 0);
joinFrom(clusterSizes, 'alive',  0, 1, 0, 0);
joinFrom(clusterSizes, 'alive',  1, 1, 0, 0);

joinFrom(clusterSizes, 'suspect', -1, 0, 1, 0);
joinFrom(clusterSizes, 'suspect',  0, 0, 1, 0);
joinFrom(clusterSizes, 'suspect',  1, 1, 0, 0);

joinFrom(clusterSizes, 'faulty', -1, 0, 0, 1);
joinFrom(clusterSizes, 'faulty',  0, 0, 0, 1);
joinFrom(clusterSizes, 'faulty',  1, 1, 0, 0);

// piggyback {alive, suspect, faulty} status of fake-node
// who is {alive, suspect, faulty} with {lower, equal, higher}
// incarnation number than the fake-node (27 combinations)
function changeStatus(ns, initial, newState, finalState, incNoDelta, deltaAlive, nSuspect, nFaulty) {
    var ix = 1;
    test2('change status from ' + initial + ', to ' + newState + 
        ' with incNoDelta ' + incNoDelta + ' via piggybacking', 
        ns, 20000, prepareWithStatus(ix, initial, function(t, tc, n) {
            expectedMembers = {}
            expectedMembers[ix] = {status: finalState};
            return [
                dsl.sendPing(t, tc, 0, 
                    {sourceIx: 0, subjectIx: ix, status: newState, subjectIncNoDelta: incNoDelta}),
                dsl.waitForPingResponse(t, tc, 0),
                dsl.assertStats(t, tc, n + deltaAlive, nSuspect, nFaulty, expectedMembers),
            ];
        })
    );
}

changeStatus(clusterSizes, 'alive',  'alive', 'alive', -1, 1, 0, 0);
changeStatus(clusterSizes, 'alive',  'alive', 'alive',  0, 1, 0, 0);
changeStatus(clusterSizes, 'alive',  'alive', 'alive',  1, 1, 0, 0);

changeStatus(clusterSizes, 'alive',  'suspect', 'alive',  -1, 1, 0, 0);
changeStatus(clusterSizes, 'alive',  'suspect', 'suspect', 0, 0, 1, 0);
changeStatus(clusterSizes, 'alive',  'suspect', 'suspect', 1, 0, 1, 0);

changeStatus(clusterSizes, 'alive',  'faulty', 'alive', -1, 1, 0, 0);
changeStatus(clusterSizes, 'alive',  'faulty', 'faulty', 0, 0, 0, 1);
changeStatus(clusterSizes, 'alive',  'faulty', 'faulty', 1, 0, 0, 1);

changeStatus(clusterSizes, 'suspect', 'alive', 'suspect', -1, 0, 1, 0);
changeStatus(clusterSizes, 'suspect', 'alive', 'suspect',  0, 0, 1, 0);
changeStatus(clusterSizes, 'suspect', 'alive', 'alive',   1, 1, 0, 0);

changeStatus(clusterSizes, 'suspect', 'suspect', 'suspect', -1, 0, 1, 0);
changeStatus(clusterSizes, 'suspect', 'suspect', 'suspect', 0,  0, 1, 0);
changeStatus(clusterSizes, 'suspect', 'suspect', 'suspect', 1,  0, 1, 0);

changeStatus(clusterSizes, 'suspect', 'faulty', 'suspect', -1, 0, 1, 0);
changeStatus(clusterSizes, 'suspect', 'faulty', 'faulty',  0,  0, 0, 1);
changeStatus(clusterSizes, 'suspect', 'faulty', 'faulty',  1,  0, 0, 1);

changeStatus(clusterSizes, 'faulty',  'alive', 'faulty', -1, 0, 0, 1);
changeStatus(clusterSizes, 'faulty',  'alive', 'faulty', 0,  0, 0, 1);
changeStatus(clusterSizes, 'faulty',  'alive', 'alive',  1,  1, 0, 0);

changeStatus(clusterSizes, 'faulty',  'suspect', 'faulty', -1, 0, 0, 1);
changeStatus(clusterSizes, 'faulty',  'suspect', 'faulty',  0, 0, 0, 1);
changeStatus(clusterSizes, 'faulty',  'suspect', 'suspect', 1, 0, 1, 0);

changeStatus(clusterSizes, 'faulty',  'faulty', 'faulty', -1, 0, 0, 1);
changeStatus(clusterSizes, 'faulty',  'faulty', 'faulty',  0, 0, 0, 1);
changeStatus(clusterSizes, 'faulty',  'faulty', 'faulty',  1, 0, 0, 1);
