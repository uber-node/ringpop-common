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

            // Wait for a ping from the SUT and validate that it has the piggybacked information in there
            dsl.validateEventBody(t, tc, {
                type: events.Types.Ping,
                direction: 'request'
            }, "Check if node doesn't disseminate join list and only disseminates itself", function (ping) {
                return ping.body && ping.body.changes &&
                    ping.body.changes.length === 1 &&
                    ping.body.changes[0].status === 'alive' &&
                    ping.body.changes[0].address === tc.sutHostPort;
            }),

            dsl.expectOnlyPings(t, tc),
        ];})
    );
}

getClusterSizes().forEach(function(n) {
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
