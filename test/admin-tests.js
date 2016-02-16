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
var prepareCluster = require('./test-util').prepareCluster;
var dsl = require('./ringpop-assert');
var getClusterSizes = require('./it-tests').getClusterSizes;

// TODO endpoints
//   /admin/debugClear (NOOP in go, toggle between ping logs in node2)
//   /admin/debugSet
// node only:
//   /admin/reload

test2('endpoint: /admin/gossip/stop', getClusterSizes(), 5000, prepareCluster(function(t,tc,n) {
    return [
        dsl.callEndpoint(t, tc, '/admin/gossip/stop'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipStop,
            direction: 'response'
        }, "Wait for AdminGossipStop response", function (response) {
            return true;
        }),

        dsl.wait(10), // racecondition if a ping was inbound during stopping
        dsl.consumePings(t, tc),
        dsl.wait(1000), // normally you would expect pings to be transfered in this time

        dsl.expectOnlyPings(t, tc, 0)
    ];
}));

test2('endpoint: /admin/gossip/start', getClusterSizes(), 5000, prepareCluster(function(t, tc, n) {
    return [
        dsl.callEndpoint(t, tc, '/admin/gossip/stop'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipStop,
            direction: 'response'
        }, "Wait for AdminGossipStop response", function (response) {
            return true;
        }),

        dsl.wait(10), // racecondition if a ping was inbound during stopping
        dsl.consumePings(t, tc),

        dsl.callEndpoint(t, tc, '/admin/gossip/start'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipStart,
            direction: 'response'
        }, "Wait for AdminGossipStart response", function (response) {
            return true;
        }),

        dsl.waitForPing(t, tc)
    ];
}));

test2('endpoint: /admin/gossip/tick', getClusterSizes(), 5000, prepareCluster(function(t, tc, n) {
    return [
        // stop gossip before invoking tick to make sure the tick is from the invocation
        dsl.callEndpoint(t, tc, '/admin/gossip/stop'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipStop,
            direction: 'response'
        }, "Wait for AdminGossipStop response", function (response) {
            return true;
        }),

        dsl.wait(10), // racecondition if a ping was inbound during stopping
        dsl.consumePings(t, tc),

        dsl.callEndpoint(t, tc, '/admin/gossip/tick'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipTick,
            direction: 'response'
        }, "Wait for AdminGossipTick response", function (response) {
            console.log("responded!");
            return true;
        }),

        dsl.wait(1000), // make sure it only send 1 ping

        dsl.expectOnlyPings(t, tc, 1)
    ];
}));

var lookupKey = 'Hello World ' + Math.random();
test2('endpoint: /admin/lookup ('+lookupKey+')', getClusterSizes(), 5000, prepareCluster(function(t, tc, n) {
    return [
        dsl.callEndpoint(t, tc, '/admin/lookup', { key: lookupKey}),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminLookup,
            direction: 'response'
        }, "Wait for AdminLookup response", function (response) {
            var should = tc.lookup(lookupKey);
            t.equal(response.body.dest, should, "Testing chosen dest");
            return true;
        })
    ];
}));

test2('endpoint: /admin/stats', getClusterSizes(), 5000, prepareCluster(function(t, tc, n) {
    return [
        dsl.callEndpoint(t, tc, '/admin/stats'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.Stats,
            direction: 'response'
        }, "Wait for Stats response", function (response) {
            // TODO do validation of specific values, the payload structure is already validated
            return true;
        })
    ];
}));

test2('endpoint: /admin/member/leave', getClusterSizes(), 10000, prepareCluster(function(t, tc, n) {
    return [
        // this makes testing the piggy backed status easier
        dsl.waitForEmptyPing(t, tc),

        // instruct node to leave cluster
        dsl.callEndpoint(t, tc, '/admin/member/leave'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminMemberLeave,
            direction: 'response'
        }, "Waiting /admin/member/leave response", function (response) {
            return response.arg3.toString() === 'ok' ||  (response.body && response.body.status === 'ok');
        }),

        // check status in ping
        dsl.sendPing(t, tc, 0),
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'response'
        }, "Test if ping contains leave message for SUT", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0].address === tc.sutHostPort &&
                ping.body.changes[0].status === 'leave';
        })
    ];
}));

test2('endpoint: /admin/member/join', getClusterSizes(), 10000, prepareCluster(function(t, tc, n) {
    return [
        // this makes testing the piggy backed status easier
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // instruct node to leave cluster
        dsl.callEndpoint(t, tc, '/admin/member/leave'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminMemberLeave,
            direction: 'response'
        }, "Waiting /admin/member/leave response", function (response) {
            return response.arg3.toString() === 'ok' || (response.body && response.body.status === 'ok');
        }),

        // check status in ping
        dsl.sendPing(t, tc, 0),
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'response'
        }, "Test if ping contains leave message for SUT", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0].address === tc.sutHostPort &&
                ping.body.changes[0].status === 'leave';
        }),

        // rejoin
        dsl.callEndpoint(t, tc, '/admin/member/join'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminMemberJoin,
            direction: 'response'
        }, "Waiting /admin/member/join response", function (response) {
            return response.arg3.toString() === 'rejoined' || (response.body && response.body.status === 'rejoined');
        }),

        // check status in ping
        dsl.sendPing(t, tc, 0),
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'response'
        }, "Test if ping contains alive message for SUT", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0].address === tc.sutHostPort &&
                ping.body.changes[0].status === 'alive';
        })
    ];
}));
