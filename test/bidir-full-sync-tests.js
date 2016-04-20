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
var test2 = require('./test-util').test2;
var dsl = require('./ringpop-assert');
var prepareCluster = require('./test-util').prepareCluster;
var getClusterSizes = require('./it-tests').getClusterSizes;

var async = require('async');
var _ = require('lodash');

test2('bidirectional full sync test', getClusterSizes(5), 20000,
    prepareCluster(function(t, tc, n) {
	    return [
            dsl.assertStats(t, tc, n+1, 0, 0),
            dsl.waitForEmptyPing(t, tc),

            // create faulties so that the membership of the faulty nodes is
            // out of sync with the membership of the SUT
            makeThreeFakeNodesFaulty(t, tc),

            // this causes the SUT to full sync since the chechsums do not match
            dsl.sendPing(t, tc, 0),
            dsl.waitForPingResponse(t, tc, 0),

            // the SUT sends a join request to perform a bidirectional full sync
            dsl.waitForJoins(t, tc, 1),
            dsl.assertStats(t, tc, n+1-3, 0, 3),
	    ];
	})
);

// As a safety check, both the ringpop-go and ringpop-node limit the number
// (defaults to 5) of concurrent bidirectional full syncs.
//
// A bidirectional full sync is triggered by a ping to a node without outstanding
// membership changes where the checksum in the ping doesn't match the node's checksum.
// This results in the node sending it's full membership. At the same time, the node
// will send a join to the source of the ping request to get it's full membership list.
//
// This test pauses responding to the join request to make sure there are multiple
// joins happening at the same time. If the throttling is working, there should
// never be more than 5 joins in the queue.
test2('bidirectional full sync throttling test', getClusterSizes(3), 20000,
    prepareCluster(function(t, tc, n) {
        var numberOfFullSyncsToTrigger = Math.max(6, n*2);
        var expectedJoins = 5;
        return [
            dsl.assertStats(t, tc, n+1, 0, 0),
            dsl.waitForEmptyPing(t, tc),

            assertReverseFullSyncThrottling(t, tc, 0, numberOfFullSyncsToTrigger, expectedJoins),

            // wait for the joins to be handled.
            dsl.waitForJoins(t, tc, expectedJoins),
            dsl.expectOnlyPings(t, tc),
            dsl.assertStats(t, tc, n+1, 0, 0)
        ];
    })
);


function assertReverseFullSyncThrottling(t, tc, nodeIx, numberOfFullSyncsToTrigger, expectedJoins){

    var cachedJoins;
    var originalJoinHandler;

    return [
        //pause handling joins to stall reverse full syncs
        overwriteJoinHandlerWithPause(tc, nodeIx),

        // trigger the reverse full syncs
        _.times(numberOfFullSyncsToTrigger, function(){
            return [
                dsl.sendPing(t, tc, nodeIx, undefined, {checksum: 1}),
                dsl.waitForPingResponse(t, tc, nodeIx)
            ];
        }),

        // verify the number of (cached) join requests
        verifyCachedJoins(t, expectedJoins),

        // process the cached joins requests and restore the original join-handler.
        handleCachedJoinsAndRestoreJoinHandler(tc, nodeIx)
    ];

    function overwriteJoinHandlerWithPause(tc, idx) {
        return function overwriteJoinHandlerWithPause(list, cb) {
            var fakeNode = tc.fakeNodes[idx];

            cachedJoins = [];
            originalJoinHandler = fakeNode.endpoints['Join'].handler;
            fakeNode.endpoints['Join'].handler = function() {
                cachedJoins.push(arguments)
            };

            cb(list);
        }
    }

    function verifyCachedJoins(t, expectedJoins) {
        return function verifyCachedJoins(list, cb) {
            if (cachedJoins.length < expectedJoins) {
                cb(null);
                return;
            }
            t.equal(cachedJoins.length, expectedJoins);

            cb(list);
        }
    }

    function handleCachedJoinsAndRestoreJoinHandler(tc, idx) {
        return function handleCachedJoinsAndRestoreJoinHandler(list, cb) {
            var fakeNode = tc.fakeNodes[idx];
            fakeNode.endpoints['Join'].handler = originalJoinHandler;

            for(var i=0; i< cachedJoins.length; i++) {
                originalJoinHandler.apply(fakeNode, cachedJoins[i]);
            }

            cb(list);
        }
    }
}

// create partition marks some fake nodes as faulty but doesn't inform the SUT
// on the changes.
function makeThreeFakeNodesFaulty(t, tc) {
    var f = _.once(function (list, cb) {
        for (var i=0; i < 3; i++) {
            tc.fakeNodes[i].status = 'faulty';
        }

        cb(list)
    });
    f.callerName = 'changeStatus';
    return f;
}
