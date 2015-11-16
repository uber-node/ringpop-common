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
var util = require('util');
var test2 = require('./test-util').test2;
var dsl = require('./ringpop-assert');
var prepareCluster = require('./test-util').prepareCluster;
var prepareWithStatus = require('./test-util').prepareWithStatus;
var getClusterSizes = require('./it-tests').getClusterSizes;

function joinFakeCluster(n) {
    test2('join cluster of 1+' + n + ' nodes', [n], 20000, 
        prepareCluster(function(t, tc, n) { return [
            dsl.assertStats(t, tc, n+1, 0, 0),
            dsl.expectOnlyPings(t, tc),
        ];})
    );
}

var clusterSizes = getClusterSizes();
clusterSizes.forEach(function(n) {
    joinFakeCluster(n);
});

test2('join ringpop with fake node', getClusterSizes(), 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.joinNewNode(t, tc, n),
        dsl.waitForJoinResponse(t, tc, n),
        dsl.wait(100),
        // node is supposed to disseminate itself
        // remove this node to keep in sync with membership of real node
        dsl.removeFakeNode(t, tc),
        dsl.assertStats(t, tc, n+1, 0, 0),
        dsl.expectOnlyPings(t, tc),
    ];})
);

function joinFrom(n, status, incNoDelta, deltaAlive, nSuspect, nFaulty) {
    test2('join from ' + status + ' with incNoDelta ' + incNoDelta, n, 20000, 
        prepareWithStatus(0, status, function(t, tc, n) {
            return [
                dsl.disableNode(t, tc, 0),
                dsl.enableNode(t, tc, 0, tc.fakeNodes[0].incarnationNumber+incNoDelta),
                dsl.sendJoin(t, tc, 0),
                dsl.waitForJoinResponse(t, tc, 0),
                // We expect the node to not accept the join but not change it's own membership
                // A node is expected to disseminate its own existence
                function(list, cb) {
                    tc.fakeNodes[0].incarnationNumber -= incNoDelta;
                    cb(list);
                },
                dsl.assertStats(t, tc, n + deltaAlive, nSuspect, nFaulty, {0: {status: status}}),
            ];
        })
    );
}

joinFrom(getClusterSizes(), 'alive', -1, 1, 0, 0);
joinFrom(getClusterSizes(), 'alive',  0, 1, 0, 0);
joinFrom(getClusterSizes(), 'alive',  1, 1, 0, 0);

joinFrom(clusterSizes, 'suspect', -1, 0, 1, 0);
joinFrom(clusterSizes, 'suspect',  0, 0, 1, 0);
joinFrom(clusterSizes, 'suspect',  1, 0, 1, 0);

joinFrom(clusterSizes, 'faulty', -1, 0, 0, 1);
joinFrom(clusterSizes, 'faulty',  0, 0, 0, 1);
joinFrom(clusterSizes, 'faulty',  1, 0, 0, 1);

