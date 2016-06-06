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
var events = require('./events');
var test2 = require('./test-util').test2;
var testStateTransitions = require('./test-util').testStateTransitions;
var prepareCluster = require('./test-util').prepareCluster;
var prepareWithStatus = require('./test-util').prepareWithStatus;
var dsl = require('./ringpop-assert');
var getClusterSizes = require('./it-tests').getClusterSizes;


test2('respond join requests with tombstone flag', getClusterSizes(2), 20000,
    prepareWithStatus(1, 'tombstone', function(t, tc, n) { return [
            dsl.sendJoin(t, tc, 1),
            dsl.validateEventBody(t, tc, {
                type: events.Types.Join,
                direction: 'response'
            }, "The membership list should contain a flagged tombstone", function (join) {
                return _.filter(join.body.membership, { status: 'faulty', tombstone: true }).length === 1
                    && _.filter(join.body.membership, { status: 'tombstone' }).length === 0;
            }),
    ];})
);


test2('join cluster with tombstone in memberlist', getClusterSizes(2), 20000, function init(t,tc, callback) {
    tc.addMembershipInformation('192.0.2.100:1234', 'tombstone', 127);
    callback();
}, prepareCluster(function(t, tc, n) { return [
        // Wait for a ping from the SUT and validate that it does not gossip about the tombstone
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'request'
        }, "The tombstone should not be gossiped around by the SUT after joining an existing cluster with a tombstone", function (ping) {
            // check tombstone state
            return _.filter(ping.body.changes, { status:'tombstone' }).length === 0
                && _.filter(ping.body.changes, { status:'faulty', tombstone: true }).length === 0;
        }),

        // confirm that the tombstone has not been added to the membership list
        dsl.assertStats(t, tc, {
            alive: n + 1,
            tombstone: 0,
        }),
    ];
}));

test2('join cluster with tombstone flag in memberlist', getClusterSizes(2), 20000, function init(t,tc, callback) {
    tc.addMembershipInformation('192.0.2.100:1234', 'faulty', 127, {'tombstone': true});
    callback();
}, prepareCluster(function(t, tc, n) { return [
        // Wait for a ping from the SUT and validate that it does not gossip about the tombstone
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'request'
        }, "The tombstone should not be gossiped around by the SUT after joining an existing cluster with a tombstone", function (ping) {
            // check tombstone state
            return _.filter(ping.body.changes, { status:'tombstone' }).length === 0
                && _.filter(ping.body.changes, { status:'faulty', tombstone: true }).length === 0;
        }),

        // confirm that the tombstone has not been added to the membership list
        dsl.assertStats(t, tc, {
            alive: n + 1,
            tombstone: 0,
        }),
    ];
}));

test2('5-second faulty to tombstone window', getClusterSizes(2), 20000,
    prepareWithStatus(1, 'faulty', function(t, tc, n) { return [
        dsl.assertStats(t, tc, {alive: n, faulty: 1}, {1: {status: 'faulty'}}),
        dsl.wait(4000),
        dsl.assertStats(t, tc, {alive: n, faulty: 1}, {1: {status: 'faulty'}}),
        dsl.wait(1100),
        dsl.assertStats(t, tc, {alive: n, tombstone: 1}, {1: {status: 'tombstone'}}),
    ];})
);

test2('5-second tombstone to evicted window', getClusterSizes(2), 20000,
    prepareWithStatus(1, 'tombstone', function(t, tc, n) { return [
        dsl.assertStats(t, tc, {alive: n, tombstone: 1}, {1: {status: 'tombstone'}}),
        dsl.wait(4000),
        dsl.assertStats(t, tc, {alive: n, tombstone: 1}, {1: {status: 'tombstone'}}),
        dsl.wait(1100),
        // by now the tombstone should be removed from the list
        dsl.assertStats(t, tc, {alive: n}),
    ];})
);

testStateTransitions(getClusterSizes(2), 'alive',  'tombstone', 'alive', -1, {alive: 1, tombstone: 0});
testStateTransitions(getClusterSizes(2), 'alive',  'tombstone', 'tombstone', 0, {alive: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'alive',  'tombstone', 'tombstone', 1, {alive: 0, tombstone: 1});

testStateTransitions(getClusterSizes(2), 'suspect',  'tombstone', 'suspect', -1, {suspect: 1, tombstone: 0});
testStateTransitions(getClusterSizes(2), 'suspect',  'tombstone', 'tombstone', 0, {alive: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'suspect',  'tombstone', 'tombstone', 1, {alive: 0, tombstone: 1});

testStateTransitions(getClusterSizes(2), 'faulty',  'tombstone', 'faulty', -1, {faulty: 1, tombstone: 0});
testStateTransitions(getClusterSizes(2), 'faulty',  'tombstone', 'tombstone', 0, {alive: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'faulty',  'tombstone', 'tombstone', 1, {alive: 0, tombstone: 1});

testStateTransitions(getClusterSizes(2), 'tombstone',  'alive', 'tombstone', -1, {alive: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'tombstone',  'alive', 'tombstone', 0, {alive: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'tombstone',  'alive', 'alive', 1, {alive: 1, tombstone: 0});

testStateTransitions(getClusterSizes(2), 'tombstone',  'suspect', 'tombstone', -1, {suspect: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'tombstone',  'suspect', 'tombstone', 0, {suspect: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'tombstone',  'suspect', 'suspect', 1, {suspect: 1, tombstone: 0});

testStateTransitions(getClusterSizes(2), 'tombstone',  'faulty', 'tombstone', -1, {faulty: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'tombstone',  'faulty', 'tombstone', 0, {faulty: 0, tombstone: 1});
testStateTransitions(getClusterSizes(2), 'tombstone',  'faulty', 'faulty', 1, {faulty: 1, tombstone: 0});

testStateTransitions(getClusterSizes(2), 'tombstone',  'tombstone', 'tombstone', -1, {tombstone: 1});
testStateTransitions(getClusterSizes(2), 'tombstone',  'tombstone', 'tombstone', 0, {tombstone: 1});
testStateTransitions(getClusterSizes(2), 'tombstone',  'tombstone', 'tombstone', 1, {tombstone: 1});

test2('tombstone should not be applied when gossiped about but unknown to the SUT', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) {
        return [
            dsl.sendPing(t, tc, 0, {
                sourceIx: 0,
                subjectIx: 'new',
                status: 'tombstone'
            }),
            dsl.waitForPingResponse(t, tc, 0),

            // confirm that the tombstone has not been added to the membership list
            dsl.assertStats(t, tc, {
                alive: n + 1,
                tombstone: 0,
            }),

            // clear all pings that happened before we gossiped the tombstone
            dsl.consumePings(t, tc),

            // Wait for a ping from the SUT and validate that it does not gossip about the tombstone
            dsl.validateEventBody(t, tc, {
                type: events.Types.Ping,
                direction: 'request'
            }, "The tombstone should not be gossiped around when the SUT didn't knew about the node before", function (ping) {
                return _.filter(ping.body.changes, { status: 'tombstone' }).length === 0;
            }),
        ];
    })
);

test2('test /admin/reap endpoint', getClusterSizes(2), 20000,
    prepareWithStatus(1, 'faulty', function(t, tc, n) { return [
        dsl.assertStats(t, tc, {alive: n, faulty: 1}, {1: {status: 'faulty'}}),

        dsl.callEndpoint(t, tc, '/admin/reap'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminReap,
            direction: 'response'
        }, 'Wait for AdminReap response', function (response) {
            var correctCount = true;
            if (response.body.reaped !== undefined) {
                correctCount = response.body.reaped === 1;
            }
            return response.body.status === 'ok' && correctCount;
        }),

        dsl.assertStats(t, tc, {alive: n, tombstone: 1}, {1: {status: 'tombstone'}}),
    ];})
);

test2('tombstone should be applied when sent as a state', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) {
        return [
            dsl.sendPing(t, tc, 0, {
                sourceIx: 0,
                subjectIx: 1,
                status: 'tombstone'
            }),
            dsl.waitForPingResponse(t, tc, 0),

            // confirm that the tombstone has not been added to the membership list
            dsl.assertStats(t, tc, {
                alive: n,
                tombstone: 1,
            }),
        ];
    })
);

test2('tombstone should be gossiped with flag when applied as state', getClusterSizes(3), 20000,
    prepareCluster(function(t, tc, n) {
        return [
            dsl.sendPing(t, tc, 0, {
                sourceIx: 0,
                subjectIx: 1,
                status: 'tombstone'
            }),
            dsl.waitForPingResponse(t, tc, 0),

            // Wait for a ping with tombstone, see function doc.
            pingNotTombstoneState(t, tc)
        ];
    })
);

test2('tombstone should be applied when sent as a flag', getClusterSizes(2), 20000,
    prepareCluster(function(t, tc, n) {
        return [
            dsl.sendPing(t, tc, 0, {
                sourceIx: 0,
                subjectIx: 1,
                status: 'faulty',
                tombstone: true
            }),
            dsl.waitForPingResponse(t, tc, 0),

            // confirm that the tombstone has not been added to the membership list
            dsl.assertStats(t, tc, {
                alive: n,
                tombstone: 1,
            }),
        ];
    })
);

test2('tombstone should be gossiped with flag when applied as a flag', getClusterSizes(3), 20000,
    prepareCluster(function(t, tc, n) {
        return [
            dsl.sendPing(t, tc, 0, {
                sourceIx: 0,
                subjectIx: 1,
                status: 'faulty',
                tombstone: true
            }),
            dsl.waitForPingResponse(t, tc, 0),

            // Wait for a ping with tombstone, see function doc.
            pingNotTombstoneState(t, tc)
        ];
    })
);

// Wait for a ping from the SUT and validate that it does not gossip about the
// tombstone as a state, but does gossip as a flag.
//
// Since we pinged SUT from nodeIx=0, the node filters that changes, therefore
// the conditional to skip it's ping request below.
//
// We also ignore ping requests that gossip 'alive' status.  That can happen
// because, at least in ringpop-node, a ping request before disseminator update
// could have been executed after the ping response above is sent over the
// wire.
function pingNotTombstoneState(t, tc) {
    // Checks if a given ping contains a single 'alive' message
    function isASingleAliveMessage(ping) {
        return ping.body.changes.length == 1
            && ping.body.changes[0].status === 'alive'
    }

    return dsl.validateEventBody(t, tc, function(ping) {
        return ping.type === events.Types.Ping
            && ping.direction === 'request'
            && ping.receiver !== tc.fakeNodes[0].getHostPort() // ignore nodeIx=0
            && ! isASingleAliveMessage(ping) // race in ringpop-node, described above
    }, "The gossip should contain a flagged tombstone", function (ping) {
        return _.filter(ping.body.changes, { status: 'faulty', tombstone: true }).length === 1
            && _.filter(ping.body.changes, { status: 'tombstone' }).length === 0;
    })
}
