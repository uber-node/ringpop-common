// Copyright (c) 2016 Uber Technologies, Inc.
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
var getClusterSizes = require('./it-tests').getClusterSizes;

test2('ping-req real-node with a disabled target', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) { return [
        // Our goal in this test is to make a Fake node (F1) do a ping-req
        // through the Real node (R) to another Fake node (F2), and see if R
        // correctly performs the ping-req: returns not-ok since F2 is disabled.

        // However, it's possible that R will determine that F2 is dead trough
        // it's own separate indirect ping mechanism. This will cause R to
        // declare F2 as suspect, which will interfere with the test.

        // To avoid R declaring F2 a suspect, we disable ping and ping-req in
        // all Fake nodes, so that R can never perform a successful indirect
        // health check itself.

        dsl.disableAllNodesPing(t, tc),
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, false),
        // do not make suspect after ping status = false
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('ping-req real-node with enabled target', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPingReq(t, tc, 0, 1),
        dsl.waitForPingReqResponse(t, tc, 0, 1, true),
        // safety check
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('become suspect through disabling ping response', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) { return [
        dsl.disableNode(t, tc, 1),
        dsl.waitForPingReqs(t, tc, 3),
        dsl.wait(100),
        dsl.assertStats(t, tc, n, 1, 0, {1: {status: 'suspect'}}),
    ];})
);

test2('5-second suspect to faulty window', getClusterSizes(2), 20000,
    prepareWithStatus(1, 'suspect', function(t, tc, n) { return [
        dsl.assertStats(t, tc, n, 1, 0, {1: {status: 'suspect'}}),
        dsl.assertStateChange(t, tc, 1, 'faulty', 5000),
    ];})
);


function testSetStatusViaPiggyback(ns, status, deltaAlive, nSuspect, nFaulty) {
    test2('prepare node with status ' + status, ns, 20000,
        prepareWithStatus(1, status, function(t, tc, n) { return [
                dsl.assertStats(t, tc, n + deltaAlive, nSuspect, nFaulty, {1: {status: status}}),
        ];})
    );
}

testSetStatusViaPiggyback(getClusterSizes(2), 'alive',   1, 0, 0);
testSetStatusViaPiggyback(getClusterSizes(2), 'suspect', 0, 1, 0);
testSetStatusViaPiggyback(getClusterSizes(2), 'faulty',  0, 0, 1);

test2('change nodes status to suspect piggybacked on a ping-req', _.filter(getClusterSizes(), function(n) { return n > 2; }), 20000,
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPingReq(t, tc, 0, 1,
            {sourceIx: 0, subjectIx: 2, status: 'suspect'}),
        dsl.waitForPingReqResponse(t, tc, 0, 1, true),
        // check if piggyback update has taken effect
        dsl.assertStats(t, tc, n, 1, 0, {2: {status: 'suspect'}}),
    ];})
);
