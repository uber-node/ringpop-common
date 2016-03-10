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
var safeJSONParse = require('./util').safeParse;
var dsl = require('./ringpop-assert');
var events = require('./events');
var fs = require('fs');
var getProgramInterpreter = require('./it-tests').getProgramInterpreter;
var getProgramPath = require('./it-tests').getProgramPath;
var prepareCluster = require('./test-util').prepareCluster;
var test2 = require('./test-util').test2;

test2('reincarnating partitions A and B', [3], 20000,
        prepareCluster(function(t, tc, n) {

            return [
                dsl.changeStatus(t, tc, 1, 1, 'faulty', 0),
                dsl.changeStatus(t, tc, 2, 2, 'faulty', 0),
                dsl.waitForPingResponse(t, tc, 1),
                dsl.waitForPingResponse(t, tc, 2),
                dsl.assertStats(t, tc, 2, 0, 2),

                // Update local membership info, so join response is right
                updateBmembership(t, tc),

                // Trigger partition heal
                dsl.callEndpoint(t, tc, "/admin/healpartition/disco", {},
                        function(eventBody) { validateHealRequest(t, tc, eventBody) }),

                // Verify join request came in to b1 or b2
                dsl.waitForJoins(t, tc, 1),

                // Verify b1 and b2 are declared suspects, but 'a' is not disseminated as alive.
                verifySuspects(t, tc, ['b1', 'b2'], ['a']),

                // c likely to ping a1, skip that.
                dsl.waitForPing(t, tc),

                // SUT tries to reincarnate partition A -- send a ping to a1.
                // Also verify it didn't have information about b1: that means
                // sut didn't try to merge partitions yet.
                verifySuspects(t, tc, ['a1'], ['b1', 'b2']),

                removeHealPartitionDiscoResponse(t, tc)
            ]
        }
        )
     );

function removeHealPartitionDiscoResponse(t, tc) {
    return function removeHealPartitionDiscoResponse(list, cb) {
        var d = _.find(list, { type: events.Types.AdminHealPartitionDisco });
        if (d === undefined) {
            cb(null);
        } else {
            list.splice(list.indexOf(d), 1);
            cb(list);
        }
    }
}

// Assign names to nodes and update membership of B from test coordinator.
function updateBmembership(t, tc) {
    return function updateBMembership(list, cb) {
        // Assign names to fake nodes
        _.extend(tc.test_state, {
            a1: tc.fakeNodes[0],
            b1: tc.fakeNodes[1],
            b2: tc.fakeNodes[2]
        });

        var a1 = tc.test_state['a1'],
            b1 = tc.test_state['b1'],
            b2 = tc.test_state['b2'];

        console.log("a1:  ", a1.getHostPort());
        console.log("sut: ", tc.sutHostPort);
        console.log("b1:  ", b1.getHostPort());
        console.log("b2:  ", b2.getHostPort());

        b1.status = 'alive';
        b2.status = 'alive';
        B = tc.getMembership();
        // According to B, a1 is faulty
        _.find(B, {port: a1.port}).status = 'faulty';
        _.find(B, {port: a1.port}).incarnationNumber = 1337;

        b1.membership = B;
        b2.membership = B;

        cb(list);
    }
}

// Verify 'nodes' are treated as suspects by sut. Also, verify sut is not
// sending 'nodes' information that 'nodes_in_other_partition' are alive.
function verifySuspects(t, tc, nodes, nodes_in_other_partition) {
    return function verifyBsuspects(list, cb) {
        // Which addresses should be declared suspects in the same message.
        var addresses = _.map(nodes, function(nodename) {
            return tc.test_state[nodename].getHostPort();
        });

        var addresses_in_other_partition = _.map(nodes, function(nodename) {
            return tc.test_state[nodename].getHostPort();
        });


        var p = _.find(list, {
            type: events.Types.Ping,
            direction: 'request'
        });
        if (p === undefined) {
            return cb(null);
        }
        var suspects = [];
        _.forEach(list, function(msg) {
            _.forEach(safeJSONParse(msg.arg3).changes, function(change) {
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
            // We found all suspects we were looking for in this message
            if (_.isEqual(addresses.sort(), suspects.sort())) {
                t.ok(true, "Found " + nodes + " suspects (" + suspects + ") we were looking for");
                _.remove(list, msg);
                return cb(list);
            }
        });
        return cb(null);
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
// inducing faulties.  Kick off the healing process:
//
// ● invoke the partition healing endpoint on sut.
// ● expect sut to send a join request to b.
// ● expect a ping from sut to b saying 'sut and a1 are alive'.
// ● sut has 4 alive members at the end.
test2('merge partitions A and B when reincarnated', [3], 20000,
        prepareCluster(function(t, tc, n) {
            return [
                // Indexes:
                // a1: 0
                // b1: 1
                // b2: 2

                // Make all memberships of fake nodes local.
                splitMemberships(t, tc),

                // 1. Create two partitions A and B by marking b1 and b2 failed in sut.
                dsl.changeStatus(t, tc, 0, 1, 'faulty', 0),
                dsl.changeStatus(t, tc, 0, 2, 'faulty', 0),
                dsl.waitForPingResponse(t, tc, 0),
                dsl.waitForPingResponse(t, tc, 0),
                dsl.assertStats(t, tc, 2, 0, 2),

                // We now have a partition. To force a clean merge, we need to
                // mimic reincarnation on both sides. This is how we do this:
                // - B just increase their incarnation number, to be returned by /join. Also decrease
                //   sut's incarnation number to 1000.
                // - According to sut, A's incarnation number needs to be higher than according to B.
                //   We do this by splitting A's and B's membership information.

                // Mark b1 and b2 faulty in a1. Strictly for this test, there is no need to update
                // a1's membership, but we make it for consistency/understandability.
                markBFaultyInA(t, tc),

                // Mark sut and a1 faulty in memberships of B. b1.membership and b2.membership
                // are referring to the same list.
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
                dsl.waitForJoins(t, tc, 1),

                // Assert ping was sent to b with a1 and sut alive.
                checkSutMergedWithB(t, tc),

                function(list, cb) {
                    delete tc.test_state['a1']['membership'];
                    delete tc.test_state['b1']['membership'];
                    delete tc.test_state['b2']['membership'];
                    cb(list);
                },
                dsl.assertStats(t, tc, 4, 0, 0),

                removeHealPartitionDiscoResponse(t, tc)
            ]
        })
     );


function waitForPingResponseFromTarget(t, tc) {
    return function waitForPingResponseFromTarget(list, cb) {
        return dsl.waitForPingResponse(t, tc, tc.test_state['target_idx'])(list, cb);
    }
}

function markBFaultyInA(t, tc) {
    return function markBFaultyInA(list, cb) {
        var b1_port = tc.test_state['b1'].port,
        b2_port = tc.test_state['b2'].port;
        _.find(tc.test_state['a1'].membership, {port: b1_port}).status = 'faulty';
        _.find(tc.test_state['a1'].membership, {port: b2_port}).status = 'faulty';
        cb(list);
    }
}

function markSutA1FaultyInB(t, tc) {
    return function markSutA1FaultyInB(list, cb) {
        var a1_port  = tc.test_state['a1'].port,
        sut_port = tc.test_state['sut'].port;
        _.find(tc.test_state['b1'].membership, {port: a1_port}).status = 'faulty';
        _.find(tc.test_state['b1'].membership, {port: sut_port}).status = 'faulty';
        cb(list);
    }
}

function reincarnateSyncA1(t, tc) {
    return function reincarnateSyncA1(list, cb) {
        var a1_port  = tc.test_state['a1'].port;
        _.find(tc.test_state['a1'].membership, {port: a1_port}).incarnationNumber += 3;
        cb(list);
    }
}

function increaseInternalIncB(t, tc) {
    return function increaseInternalIncB(list, cb) {
        tc.test_state['b1'].incarnationNumber += 3;
        tc.test_state['b2'].incarnationNumber += 3;

        // keep the incarnation number in membership in sync with internal state
        // XXX: would be nicer just to ask for the node to update it's state
        var b1_port = tc.test_state['b1'].port,
            b2_port = tc.test_state['b2'].port;
        _.find(tc.test_state['b1'].membership, {port: b1_port}).incarnationNumber += 3;
        _.find(tc.test_state['b1'].membership, {port: b2_port}).incarnationNumber += 3;
        cb(list);
    }
}

function decreaseIncOfSutInB(t, tc) {
    return function decreaseIncOfSutInB(list, cb) {
        var B = tc.test_state['b1'].membership,
        sut_port = tc.test_state['sut'].port;
        _.find(B, {port: sut_port}).incarnationNumber = 1000;
        cb(list);
    }
}


function splitMemberships(t, tc) {
    return function splitMemberships(list, cb) {
        var sut = {
            host: tc.getSUTHostPort().split(':', 2)[0],
            port: tc.getSUTHostPort().split(':', 2)[1],
            status: 'alive',
            incarnationNumber: tc.test_state['sutIncarnationNumber']
        };

        _.extend(tc.test_state, {
            a1: tc.fakeNodes[0],
            b1: tc.fakeNodes[1],
            b2: tc.fakeNodes[2],
            sut: sut
        });
        console.log("a1:  ", tc.test_state['a1'].getHostPort());
        console.log("sut: ", tc.sutHostPort);
        console.log("b1:  ", tc.test_state['b1'].getHostPort());
        console.log("b2:  ", tc.test_state['b2'].getHostPort());


        var A = tc.getMembership().concat([sut]);
        var B = tc.getMembership().concat([sut]);
        tc.test_state['a1'].membership = A;
        tc.test_state['b1'].membership = B;
        tc.test_state['b2'].membership = B;
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
                a1_hostport = tc.test_state['a1'].getHostPort(),
                b1_hostport = tc.test_state['b1'].getHostPort(),
                b2_hostport = tc.test_state['b2'].getHostPort(),
                sut_hostport = tc.sutHostPort;
            if (destination == b1_hostport || destination == b2_hostport) {
                // target node index. We need to know where ping request was
                // sent to to discard the response later.
                tc.test_state['target_idx'] = destination == b1_hostport? 1 : 2;
                var changes = safeJSONParse(ping.arg3).changes;
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

function validateHealRequest(t, tc, eventBody) {
    t.equal(1, eventBody['targets'].length,
            "/join was sent to one node as part of heal");
    tc.test_state['join_target'] = eventBody['targets'][0];
}
