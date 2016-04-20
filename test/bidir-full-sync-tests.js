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

test2('bidirectional full sync throttling test', getClusterSizes(3), 20000,
    prepareCluster(function(t, tc, n) {
        return [
            dsl.assertStats(t, tc, n+1, 0, 0),
            dsl.waitForEmptyPing(t, tc),

            assertReverseFullSyncThrottling(t, tc, 0, n*3, 5),

            dsl.assertStats(t, tc, n+1, 0, 0),
        ];
    })
);

// assert if the number of joins is throttled.
function assertReverseFullSyncThrottling(t, tc, idx, count, expectedJoins) {
    var functions = [];

    //pause handling joins to stall reverse full syncs
    functions.push(pauseHandlingJoins);
    functions.push(dsl.waitForEmptyPing(t, tc));

    // trigger the reverse full syncs
    functions.push(triggerReverseFullSyncs(tc, idx, count));

    // verify the number of join requests
    functions.push(verify);

    // handle the joins
    functions.push(resumeHandlingJoins);

    // the SUT sends a join request to perform a bidirectional full sync
    functions.push(dsl.waitForJoins(t, tc, expectedJoins));

    var joins = [];

    return functions;

    function triggerReverseFullSyncs(tc, nodeIx, count) {
        var f = function triggerFullSync(list, cb) {
            async.times(count, function triggerFullSync(i, next){
                tc.fakeNodes[nodeIx].requestPing(next, undefined, {checksum: 1}); //override checksum to trigger a fullsync
            }, function done() {
                cb(list);
            });
        };
        f.callerName = 'triggerReverseFullSyncs';

        return f;
    }

    function pauseHandlingJoins(list, cb) {
        var fakeNode = tc.fakeNodes[idx];

        fakeNode.endpoints['Join'].handler = function() {
            console.log('handling join');
            joins.push(arguments)
        };


        cb(list);
    }

    function verify(list, cb) {
        if (joins.length < expectedJoins) {
            cb(null);
            return;
        }
        t.equal(joins.length, expectedJoins);

        var pings = _.filter(list, {
            type: events.Types.Ping,
            direction: 'response'
        });

        pings = _.filter(pings, function(event) {
            return event.receiver === tc.fakeNodes[idx].getHostPort();
        });

        if (pings.length < count) {
            cb(null);
            return;
        }

        t.equals(pings.length, count);

        cb(_.reject(list, {type: events.Types.Ping, direction: 'response'}));
    }

    function resumeHandlingJoins(list, cb) {
        var fakeNode = tc.fakeNodes[idx];

        fakeNode.endpoints['Join'].handler = fakeNode.joinHandler;

        for(var i=0; i< joins.length; i++) {
            fakeNode.joinHandler.apply(fakeNode, joins[i]);
        }

        cb(list);
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
