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

var _ = require('lodash');

var dsl = require('./ringpop-assert');
var events = require('./events');
var getClusterSizes = require('./it-tests').getClusterSizes;
var prepareCluster = require('./test-util').prepareCluster;
var prepareWithStatus = require('./test-util').prepareWithStatus;
var test2 = require('./test-util').test2;

test2('ringpop should accept labels that are present in the bootstrap list', getClusterSizes(2), 20000, function init(t, tc, callback) {
    // insert labels into the node before the sut is bootstrapped
    tc.fakeNodes[0].labels = {
        "hello": "world"
    };
    callback();
}, prepareCluster(function(t, tc, n) { return [
        dsl.assertStats(t, tc, n+1, 0, 0, {
            0: {
                labels: { "hello": "world" }
            }
        }),
    ];})
);

test2('ringpop should accept labels for a node with a higher incarnation number from the node itself', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) { return [
        // feed the sut with label information for nodeIx 0
        dsl.changeStatus(t, tc, 0, 0, {
            subjectIncNoDelta: +1,
            status: 'alive',
            labels: {
                "hello": "world"
            },
        }),
        dsl.waitForPingResponse(t, tc, 0, 0, true),

        // assert that nodeIx 0 has its labels set on the sut
        dsl.assertStats(t, tc, n+1, 0, 0, {
            0: {
                labels: {
                    "hello": "world"
                }
            }
        }),
    ];})
);

test2('ringpop should accept labels for a node with a higher incarnation number from another node', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) { return [
        // feed the sut with label information for nodeIx 0
        dsl.changeStatus(t, tc, 0, 1, {
            subjectIncNoDelta: +1,
            status: 'alive',
            labels: {
                "hello": "world"
            },
        }),
        dsl.waitForPingResponse(t, tc, 0, 0, true),

        // assert that nodeIx 0 has its labels set on the sut
        dsl.assertStats(t, tc, n+1, 0, 0, {
            1: {
                labels: {
                    "hello": "world"
                }
            }
        }),
    ];})
);

test2('ringpop should not accept labels for a node with a lower incarnation number', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) { return [
        // feed the sut with label information for nodeIx 0
        dsl.changeStatus(t, tc, 0, 1, {
            subjectIncNoDelta: -1,
            status: 'alive',
            labels: {
                "hello": "world"
            },
        }),
        dsl.waitForPingResponse(t, tc, 0, 0, true),

        // assert that nodeIx 0 has its labels set on the sut
        dsl.assertStats(t, tc, n+1, 0, 0, {
            1: {
                labels: undefined
            }
        }),
    ];})
);

// The most likely assert to fail will be the last assert in this test where the
// winning labels are compaired to the labels that were chosen after the first
// round of label gossipping
test2('ringpop should deterministically pick labels on conflict', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) {
        // keep track of the labels that won the first time around
        var winningLabels = {};

        // two pairs of labels
        var labels1 = { "hello": "world" };
        var labels2 = { "hello": "goodbey" };

        return [
            // send the sut the first pair of labels on inc+1, these will always
            // be accepted because the incarnation number is higher
            dsl.changeStatus(t, tc, 0, 1, {
                subjectIncNoDelta: +1,
                status: 'alive',
                labels: labels1,
            }),
            dsl.waitForPingResponse(t, tc, 0, 0, true),

            // make sure these labels are accepted
            dsl.assertMembership(t, tc, {
                1: {
                    labels: labels1
                }
            }),

            // send the sut the second pair of labels on the same inc # as before
            // these might or might not be accepted depending on the rules to be
            // determined for deterministically picking 1 pair of labels
            dsl.changeStatus(t, tc, 0, 1, {
                subjectIncNoDelta: +1,
                status: 'alive',
                labels: labels2,
            }),
            dsl.waitForPingResponse(t, tc, 0, 0, true),

            // use a function to get a reference back to the member status
            // returned for the node and store the labels that were chosen as
            // the winning labels
            dsl.assertMembership(t, tc, {
                1: function storeWinningLabels(memberStatus) {
                    // copy the winning labels into the placeholder object since
                    // it needs to be passed to the validator function below on
                    // test construction time.
                    _.extend(winningLabels, memberStatus.labels,{winning:true});

                    // to prevent the assertion happening in assert membership
                    // we return true to indicate the 'test' passed.
                    return true;
                }
            }),

            // ================
            //     MID WAY
            // ================
            // now that we have established which pair was chosen in the first
            // round we are going to do the same on a higher incarnation number
            // in the other order.

            // first send the second pair
            dsl.changeStatus(t, tc, 0, 1, {
                subjectIncNoDelta: +2,
                status: 'alive',
                labels: labels2,
            }),
            dsl.waitForPingResponse(t, tc, 0, 0, true),

            // make sure these labels are accepted
            dsl.assertMembership(t, tc, {
                1: {
                    labels: labels2
                }
            }),

            // sending the first pair
            dsl.changeStatus(t, tc, 0, 1, {
                subjectIncNoDelta: +2,
                status: 'alive',
                labels: labels1,
            }),
            dsl.waitForPingResponse(t, tc, 0, 0, true),

            // validate that the second iteration picked the same winning labels
            // as the first iteration to ensure convergence when there are
            // conflicting labels being gossipped around.
            dsl.assertMembership(t, tc, {
                1: {
                    labels: winningLabels
                }
            }),
        ];
    })
);

test2('different labels should be accepted on a higher incarnation number', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) {

        // two pairs of labels
        var labels1 = { "hello": "world" };
        var labels2 = { "hello": "goodbey" };

        return [
            // feed the sut with the first pair of labels
            dsl.changeStatus(t, tc, 0, 1, {
                subjectIncNoDelta: +1,
                status: 'alive',
                labels: labels1,
            }),
            dsl.waitForPingResponse(t, tc, 0, 0, true),

            // assert that the first pair is accepted
            dsl.assertMembership(t, tc, {
                1: { labels: labels1 }
            }),

             // feed the sut with the second pair of labels
            dsl.changeStatus(t, tc, 0, 1, {
                subjectIncNoDelta: +2,
                status: 'alive',
                labels: labels2,
            }),
            dsl.waitForPingResponse(t, tc, 0, 0, true),

            // assert that the second pair is accepted
            dsl.assertMembership(t, tc, {
                1: { labels: labels2 }
            }),
        ];
    })
);

// since nodes might miss updates on changes they should always accept labels if
// the status updates, even if these labels differ from the labels that were
// previously known to the node.
function testLabelOverrideOnStatusChange(firstStatus, secondStatus) {
    test2('different labels should be accepted on a state override from ' + firstStatus + ' to ' + secondStatus , getClusterSizes(2), 20000,
        prepareCluster(function(t, tc, n) {

            // two pairs of labels
            var labels1 = { "hello": "world" };
            var labels2 = { "hello": "goodbey" };

            return [
                // feed the sut with the first pair of labels
                dsl.changeStatus(t, tc, 0, 1, {
                    subjectIncNoDelta: +1,
                    status: firstStatus,
                    labels: labels1,
                }),
                dsl.waitForPingResponse(t, tc, 0, 0, true),

                // assert that the first pair is accepted
                dsl.assertMembership(t, tc, {
                    1: { labels: labels1 }
                }),

                // feed the sut with the second pair of labels
                dsl.changeStatus(t, tc, 0, 1, {
                    subjectIncNoDelta: +1,
                    status: secondStatus,
                    labels: labels2,
                }),
                dsl.waitForPingResponse(t, tc, 0, 0, true),

                // assert that the second pair is accepted
                dsl.assertMembership(t, tc, {
                    1: { labels: labels2 }
                }),
            ];
        })
    );
};

// begin with alive node
testLabelOverrideOnStatusChange('alive', 'suspect');
testLabelOverrideOnStatusChange('alive', 'faulty');
testLabelOverrideOnStatusChange('alive', 'leave');
testLabelOverrideOnStatusChange('alive', 'tombstone');

// begin with suspect node
testLabelOverrideOnStatusChange('suspect', 'faulty');
testLabelOverrideOnStatusChange('suspect', 'leave');
testLabelOverrideOnStatusChange('suspect', 'tombstone');

// begin with faulty node
testLabelOverrideOnStatusChange('faulty', 'leave');
testLabelOverrideOnStatusChange('faulty', 'tombstone');

// begin with leave node
testLabelOverrideOnStatusChange('leave', 'tombstone');
