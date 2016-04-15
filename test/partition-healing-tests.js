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

var TestCoordinator = require('./test-coordinator');
var _ = require('lodash');
var async = require('async');
var dsl = require('./ringpop-assert');
var events = require('./events');
var getClusterSizes = require('./it-tests').getClusterSizes;
var prepareCluster = require('./test-util').prepareCluster;
var safeJSONParse = require('./util').safeParse;
var test2 = require('./test-util').test2;

// First stage of healing algorithm: forced reincarnation.
//
// Actors:
// ● a1, sut: partition A.
// ● b1, b2: partition B.
//
// 1. Create two partitions A and B by marking b1 and b2 failed in sut.
//    a1 and sut are failed according to B.
// 2. Trigger partition healing.
// 3. Verify sut tries to reincarnate both sides:
// 3.1. sut declares b1 and b2 as suspects to B.
// 3.2. sut declares a1 as suspect to A.
test2('reincarnating partitions A and B', [3], 20000,
        prepareCluster(function(t, tc, n) {

            return [
                dsl.changeStatus(t, tc, 1, 1, 'faulty', 0),
                dsl.changeStatus(t, tc, 2, 2, 'faulty', 0),
                dsl.waitForPingResponse(t, tc, 1),
                dsl.waitForPingResponse(t, tc, 2),
                dsl.assertStats(t, tc, 2, 0, 2),

                // According to B, a1 is faulty.
                makeAFaultyInB(t, tc),

                // Trigger partition heal
                dsl.callEndpoint(t, tc, "/admin/healpartition/disco", {},
                        function(eventBody) { validateHealRequest(t, tc, eventBody) }),
                waitForHealPartitionDiscoResponse(t, tc),

                // Verify join request came in to b1 or b2
                dsl.waitForJoins(t, tc, 1),

                // Verify b1 and b2 are declared suspects, but 'a' is not disseminated as alive.
                verifySuspects(t, tc, [1, 2], [0]),

                // SUT tries to reincarnate partition A -- send a ping to a1.
                // Also verify it didn't have information about b1: that means
                // sut didn't try to merge partitions yet.
                verifySuspects(t, tc, [0], [1, 2])
            ]
        }
        )
     );

// Assign names to nodes and update membership of B from test coordinator.
function makeAFaultyInB(t, tc) {
    return function makeAFaultyInB(list, cb) {
        tc.fakeNodes[1].status = 'alive';
        tc.fakeNodes[2].status = 'alive';

        var B = tc.getMembership();
        // According to B, a1 is faulty
        _.find(B, {port: tc.fakeNodes[0].port}).status = 'faulty';

        tc.fakeNodes[1].membership = _.cloneDeep(B);
        tc.fakeNodes[2].membership = _.cloneDeep(B);

        cb(list);
    }
}

function waitForHealPartitionDiscoResponse(t, tc) {
    return function waitForHealPartitionDiscoResponse(list, cb) {
        var d = _.find(list, { type: events.Types.AdminHealPartitionDisco });
        if (d === undefined) {
            cb(null);
        } else {
            list.splice(list.indexOf(d), 1);
            cb(list);
        }
    }
}

// verifySuspects waits for a ping from sut that contains the following changes:
// - all of 'nodes' are declared suspect, and
// - no nodes from 'nodes_inother_partition' are declared alive
function verifySuspects(t, tc, nodes, nodes_in_other_partition) {
    return function verifyBsuspects(list, cb) {
        // Which addresses should be declared suspects in the same message.
        var addresses = _.map(nodes, function(ix) {
            return tc.fakeNodes[ix].getHostPort();
        });

        var addresses_in_other_partition = _.map(nodes, function(ix) {
            return tc.fakeNodes[ix].getHostPort();
        });

        var pingRequests = _.filter(list, {
            type: events.Types.Ping,
            direction: 'request'
        });

        var found_all_suspects = false;
        _.forEach(pingRequests, function(pingRequest) {
            var suspects = [];
            _.forEach(pingRequest.body.changes, function(change) {
                if (change.status === 'suspect') {
                    suspects.push(change.address);
                } else if (change.status == 'alive') {
                    if (_.find(addresses_in_other_partition, change.address)) {
                        t.fail(change.source + " disseminated a change about " +
                                change.address + " being alive. Unexpected " +
                                "merge of partitions!");
                    }
                }
            });
            // Found all suspects we were looking for in this message
            if (_.isEqual(addresses.sort(), suspects.sort())) {
                t.ok(true, "Found " + nodes + " suspects (" + suspects + ") we were looking for");
                found_all_suspects = true;
            }
            _.remove(list, pingRequest);
        });

        if (found_all_suspects) {
            cb(list);
        } else {
            cb(null);
        }
    }
}

// Second stage of the healing algorithm, only after both sides have reincarnated.
//
// Actors:
// ● a1, sut: partition A.
// ● b1, b2: partition B.
// ● b ∈ {b1, b2}
//
// 1. Create two partitions A and B by marking b1 and b2 failed in sut.
// 2. Reincarnate a1.
// 3. Update B's state about a1.
// 4. Reincarnate b1, b2 by just bumping their internal incarnation number.
//
// Now cluster is ready to merge: the membership lists can merge without
// inducing faulties. Kick off the healing process:
//
// 1. invoke the partition healing endpoint on sut.
// 2. expect sut to send a join request to b.
// 3. expect a ping from sut to b saying 'sut and a1 are alive'.
// 4. sut has 4 alive members at the end.
test2('merge partitions A and B when reincarnated', [3], 20000,
        prepareCluster(function(t, tc, n) {
            return [
                // Indexes:
                // a1: 0
                // b1: 1
                // b2: 2

                // Make all memberships of fake nodes local.
                localizeMemberships(t, tc),

                // 1. Create two partitions A and B by marking b1 and b2 failed in sut.
                dsl.changeStatus(t, tc, 0, 1, 'faulty', 0),
                dsl.changeStatus(t, tc, 0, 2, 'faulty', 0),
                dsl.waitForPingResponse(t, tc, 0),
                dsl.waitForPingResponse(t, tc, 0),
                dsl.assertStats(t, tc, 2, 0, 2),

                // We now have a partition. To force a clean merge, we need to
                // mimic reincarnation on both sides. This is how we do this:
                // - B just increase their incarnation number, to be returned
                //   by /join. Also decrease sut's incarnation number to 1000.
                // - According to sut, A's incarnation number needs to be
                //   higher than according to B.  We do this by splitting A's
                //   and B's membership information.
                //
                // Mark b1 and b2 faulty in a1. Strictly for this test, there
                // is no need to update a1's membership, but we make it for
                // consistency/understandability.

                markBFaultyInA(t, tc),

                // Mark sut and a1 faulty in memberships of B.
                markSutA1FaultyInB(t, tc),

                // 2. Reincarnate a1. Also, sync a1's membership with it.
                dsl.changeStatus(t, tc, 0, 0, 'alive', 3),
                dsl.waitForPingResponse(t, tc, 0),

                // increase internal incarnation numbers of b1 and b2.
                increaseInternalIncB(t, tc),

                // Decrease the incarnation number of sut in B to 1000.
                decreaseIncOfSutInB(t, tc),

                // Clean up old pings before forcing the merge..
                dsl.consumePings(t, tc),

                // Now we have a clean partition with both sides reincarnated. According to sut:
                // ● a1: 1340 alive.
                // ● sut: current alive.
                // ● b1: 1337 faulty.
                // ● b2: 1337 faulty.
                //
                // Also, ∀ b ∈ B ⇔ {b1, b2}:
                // ● a1: 1337 faulty.
                // ● sut: 1000 faulty.
                // ● b1: 1340 alive.
                // ● b2: 1340 alive.

                // Force SUT to merge the partition.
                dsl.callEndpoint(t, tc, "/admin/healpartition/disco", {},
                        function(eventBody) { validateHealRequest(t, tc, eventBody) }),
                waitForHealPartitionDiscoResponse(t, tc),

                // SUT sends /join to b.
                dsl.waitForJoins(t, tc, 1),

                // Assert ping was sent to b with a1 and sut alive.
                checkSutMergedWithB(t, tc),

                // Make node membership global again, since partition is over.
                function(list, cb) {
                    delete tc.fakeNodes[0]['membership'];
                    delete tc.fakeNodes[1]['membership'];
                    delete tc.fakeNodes[2]['membership'];
                    cb(list);
                },
                dsl.assertStats(t, tc, 4, 0, 0),
            ]
        })
     );

test2('merge partitions A and B when reincarnated, while having an extra faulty node', [4], 20000, prepareCluster(function(t, tc, n) {
    // most of the test is equal to the test above:`merge partitions A and B when reincarnated`
    // however we have an extra node which we mark as faulty and shut down at the beginning of
    // the test to simulate a partition with a shared faulty node
    return [
        // mark the last node as faulty as well, this will be the shared faulty node
        dsl.changeStatus(t, tc, 0, 3, 'faulty', 0),
        dsl.waitForPingResponse(t, tc, 0),

        // disable the shared faulty node
        function disableSharedFaulty(list, cb) {
            tc.fakeNodes[3].shutdown();
            cb(list);
        },

        localizeMemberships(t, tc),
        dsl.changeStatus(t, tc, 0, 1, 'faulty', 0),
        dsl.changeStatus(t, tc, 0, 2, 'faulty', 0),
        dsl.waitForPingResponse(t, tc, 0),
        dsl.waitForPingResponse(t, tc, 0),
        dsl.assertStats(t, tc, 2, 0, 3),
        markBFaultyInA(t, tc),
        markSutA1FaultyInB(t, tc),
        dsl.changeStatus(t, tc, 0, 0, 'alive', 3),
        dsl.waitForPingResponse(t, tc, 0),
        increaseInternalIncB(t, tc),
        decreaseIncOfSutInB(t, tc),
        dsl.consumePings(t, tc),
        dsl.callEndpoint(t, tc, "/admin/healpartition/disco", {},
                function(eventBody) { validateHealRequest(t, tc, eventBody) }),
        waitForHealPartitionDiscoResponse(t, tc),
        dsl.waitForJoins(t, tc, 1),
        checkSutMergedWithB(t, tc),
        function(list, cb) {
            delete tc.fakeNodes[0]['membership'];
            delete tc.fakeNodes[1]['membership'];
            delete tc.fakeNodes[2]['membership'];
            cb(list);
        },
        // assert that the partition is resolved and the rougue member is still
        // marked as faulty
        dsl.assertMembership(t, tc, {
            0: /*a1*/ { incarnationNumber: 1340, status: 'alive' },
            1: /*b1*/ { incarnationNumber: 1340, status: 'alive' },
            2: /*b2*/ { incarnationNumber: 1340, status: 'alive' },
            3: { incarnationNumber: 1337, status: 'faulty' },
        }),
    ]
}));

test2('dont\'t merge partitions when B is not fully reincarnated', [3], 20000, prepareCluster(function(t, tc, n) {
    return [
        localizeMemberships(t, tc),

        dsl.changeStatus(t, tc, 1, 1, 'faulty', 0),
        dsl.changeStatus(t, tc, 2, 2, 'faulty', 0),
        dsl.waitForPingResponse(t, tc, 1),
        dsl.waitForPingResponse(t, tc, 2),
        dsl.assertStats(t, tc, 2, 0, 2),

        // According to B, a1 is faulty.
        markBFaultyInA(t, tc),

        // Mark sut and a1 faulty in memberships of B.
        markSutA1FaultyInB(t, tc),

        // simulate that we received the initial suspect message for healing,
        // but did not receive the new version of the other members of B
        midwayThroughReincarnatingB(t, tc),

        dsl.consumePings(t, tc),

        // Trigger partition heal
        dsl.callEndpoint(t, tc, "/admin/healpartition/disco", {},function(eventBody) {
            validateHealRequest(t, tc, eventBody);
        }),
        waitForHealPartitionDiscoResponse(t, tc),

        // Verify only 1 join request came for b1 or b2, if more responses came
        // in they will stay in the event list when this test ends which will
        // cause the test to fail
        dsl.waitForJoins(t, tc, 1),

        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'request'
        }, "ping after heal", function (ping) {
            var a1 = tc.fakeNodes[0].getHostPort();
            var b1 = tc.fakeNodes[1].getHostPort();
            var b2 = tc.fakeNodes[2].getHostPort();

            if (ping.receiver != b1 && ping.receiver != b2) {
                t.fail("expected a ping to partition B during healing");
                return false;
            }

            if (_.filter(ping.body.changes, {status: 'alive'}).length != 0) {
                t.fail("did not expect alive declarations in the ping sent to B");
                return false;
            }

            if (_.filter(ping.body.changes, {address: ping.receiver == b1 ? b2:b1, status: 'suspect'}).length != 1) {
                t.fail("expected a suspect declaration for the non-reincarnated member of B");
                return false;
            }

            return true;
        }),

        dsl.assertMembership(t, tc, {
            0: /*a1*/ { incarnationNumber: 1337, status: 'suspect' },
            1: /*b1*/ { incarnationNumber: 1337, status: 'faulty' },
            2: /*b2*/ { incarnationNumber: 1337, status: 'faulty' },
        }),
    ]
}));

function waitForPingResponseFromTarget(t, tc) {
    return function waitForPingResponseFromTarget(list, cb) {
        return dsl.waitForPingResponse(t, tc, tc.test_state['target_idx'])(list, cb);
    }
}

// Mark b1 and b2 faulty in a1.
function markBFaultyInA(t, tc) {
    return function markBFaultyInA(list, cb) {
        var b1_port = tc.fakeNodes[1].port,
            b2_port = tc.fakeNodes[2].port;
        _.find(tc.fakeNodes[0].membership, {port: b1_port}).status = 'faulty';
        _.find(tc.fakeNodes[0].membership, {port: b2_port}).status = 'faulty';
        cb(list);
    }
}

// Mark sut and a1 faulty in memberships of B.
function markSutA1FaultyInB(t, tc) {
    return function markSutA1FaultyInB(list, cb) {
        var a1_port  = tc.fakeNodes[0].port,
            sut_port = tc.test_state['sut'].port;
        _.find(tc.fakeNodes[1].membership, {port: a1_port}).status = 'faulty';
        _.find(tc.fakeNodes[1].membership, {port: sut_port}).status = 'faulty';
        _.find(tc.fakeNodes[2].membership, {port: a1_port}).status = 'faulty';
        _.find(tc.fakeNodes[2].membership, {port: sut_port}).status = 'faulty';
        cb(list);
    }
}

// Increase incarnation number of B, both in node and global test state.
function increaseInternalIncB(t, tc) {
    return function increaseInternalIncB(list, cb) {
        tc.fakeNodes[1].incarnationNumber += 3;
        tc.fakeNodes[2].incarnationNumber += 3;

        // keep the incarnation number in membership in sync with internal state
        var b1_port = tc.fakeNodes[1].port,
            b2_port = tc.fakeNodes[2].port;
        _.find(tc.fakeNodes[1].membership, {port: b1_port}).incarnationNumber += 3;
        _.find(tc.fakeNodes[1].membership, {port: b2_port}).incarnationNumber += 3;
        _.find(tc.fakeNodes[2].membership, {port: b1_port}).incarnationNumber += 3;
        _.find(tc.fakeNodes[2].membership, {port: b2_port}).incarnationNumber += 3;
        cb(list);
    }
}

// Put B in suspect states to simulate partition B in the process of reincarnating
// b1: [sut: f1, a1: f1, b1: a2, b2: s1]
// b2: [sut: f1, a1: f1, b1: s1, b2: a2]
function midwayThroughReincarnatingB(t, tc) {
    return function midwayThroughReincarnatingB(list, cb) {
        // make sure that both nodes see them self incarnated since we do not
        // control who the sut reaches out to
        tc.fakeNodes[1].incarnationNumber += 1;
        tc.fakeNodes[2].incarnationNumber += 1;

        var b1_port = tc.fakeNodes[1].port;
        var b2_port = tc.fakeNodes[2].port;
        // b1 -> b1
        _.find(tc.fakeNodes[1].membership, {port: b1_port}).incarnationNumber += 1;
        // b1 -> b2
        _.find(tc.fakeNodes[1].membership, {port: b2_port}).status = 'suspect';
        // b2 -> b1
        _.find(tc.fakeNodes[2].membership, {port: b1_port}).status = 'suspect';
        // b2 -> b2
        _.find(tc.fakeNodes[2].membership, {port: b2_port}).incarnationNumber += 1;

        cb(list);
    }
}

function decreaseIncOfSutInB(t, tc) {
    return function decreaseIncOfSutInB(list, cb) {
        var B1 = tc.fakeNodes[1].membership,
            B2 = tc.fakeNodes[2].membership;
        _.find(B1, {port: tc.test_state['sut'].port}).incarnationNumber = 1000;
        _.find(B2, {port: tc.test_state['sut'].port}).incarnationNumber = 1000;
        cb(list);
    }
}


function localizeMemberships(t, tc) {
    return function localizeMemberships(list, cb) {
        tc.test_state['sut'] = tc.getSUTAsMember();
        tc.fakeNodes[0].membership = tc.getMembership();
        tc.fakeNodes[1].membership = tc.getMembership();
        tc.fakeNodes[2].membership = tc.getMembership();
        cb(list);
    }
}

// Find a change: sut sends B where a1 and sut are alive.
function checkSutMergedWithB(t, tc) {
    return function checkSutMergedWithB(list, cb) {
        var pings = _.filter(list, {type: events.Types.Ping, direction: 'request'});
        _.forEach(pings, function(ping) {
            // TODO: there should be a better way to find out the destination hostport.
            var destination = ping.req.channel.hostPort, // destination of the ping: need b
                a1_hostport = tc.fakeNodes[0].getHostPort(),
                b1_hostport = tc.fakeNodes[1].getHostPort(),
                b2_hostport = tc.fakeNodes[2].getHostPort(),
                sut_hostport = tc.sutHostPort;
            if (destination == b1_hostport || destination == b2_hostport) {
                // target node index. We need to know where ping request was
                // sent to to discard the response later.
                tc.test_state['target_idx'] = destination == b1_hostport? 1 : 2;
                var changes = ping.body.changes;
                var found_a = _.find(changes, {address: a1_hostport, status: 'alive'});
                var found_sut = _.find(changes, {address: sut_hostport, status: 'alive'});
                if (found_a && found_sut) {
                    t.ok(true, "found alive a and sut");
                    // XXX a bit inappropriate to set incarnation number here, but hey.
                    tc.test_state['sutIncarnationNumber'] = found_sut.incarnationNumber
                }
                cb(_.without(list, ping));
            }
        });
        cb(null);
    }
}

function healerUnknownNodes(n) {
    // Spin up a real cluster of two nodes. Update SUT's host file. Expect a join.
    test2('partition healer kicks in to previously-unknown nodes', [1], 20000,
            prepareCluster(function(t, tc) {
                return [
                    addMoreFakeNodes(t, tc, n),
                    function createHostsFile(list, cb) {
                        tc.createHostsFile(); cb(list);
                    },
                    dsl.callEndpoint(t, tc, "/admin/healpartition/disco", {},
                            function(eventBody) { validateHealRequest(t, tc, eventBody) }),
                    waitForHealPartitionDiscoResponse(t, tc),

                    // Join request comes from sut to the other partition.
                    dsl.waitForJoins(t, tc, 1),

                    // Verify they converged in the end.
                    dsl.assertStats(t, tc, n+1, 0, 0)
                ]
            })
         );
}

getClusterSizes(2).forEach(function(n) {
    healerUnknownNodes(n);
});

function addMoreFakeNodes(t, tc, n) {
    return function addMoreFakeNodes(list, cb) {
        // Create n-1 new fake nodes.
        for (var i = 1; i < n; i++) {
            tc.createFakeNode();
        }
        // Start n-1 new fake nodes.
        async.each(tc.fakeNodes.slice(1), function startNode(node, nodeStarted) {
            node.start(nodeStarted);
        }, function() {
            cb(list);
        });
    }
}

function validateHealRequest(t, tc, eventBody) {
    t.equal(eventBody['targets'].length, 1,
            "expected 1 join target as part of the heal");
    tc.test_state['join_target'] = eventBody['targets'][0];
}
