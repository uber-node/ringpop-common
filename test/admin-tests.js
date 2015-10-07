var events = require('./events');
var test2 = require('./test-util').test2;
var dsl = require('./ringpop-assert');

// TODO endpoints
//   /admin/debugClear (NOOP in go, toggle between ping logs in node2)
//   /admin/debugSet
// node only:
//   /admin/join
//   /admin/leave
//   /admin/reload

test2('endpoint: /admin/gossip/stop', 7, 5000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),

        dsl.callEndpoint(t, tc, '/admin/gossip/stop'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipStop,
            direction: 'response'
        }, "Wait for AdminGossipStop response", function (response) {
            return true;
        }),

        dsl.consumePings(t, tc),
        dsl.wait(1000), // normally you would expect pings to be transfered in this time

        dsl.expectOnlyPings(t, tc, 0)
    ];
});

test2('endpoint: /admin/gossip/start', 7, 5000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),

        dsl.callEndpoint(t, tc, '/admin/gossip/stop'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipStop,
            direction: 'response'
        }, "Wait for AdminGossipStop response", function (response) {
            return true;
        }),

        dsl.consumePings(t, tc),
        dsl.wait(1000), // normally you would expect pings to be transfered in this time

        dsl.expectOnlyPings(t, tc, 0),

        dsl.callEndpoint(t, tc, '/admin/gossip/start'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipStart,
            direction: 'response'
        }, "Wait for AdminGossipStart response", function (response) {
            return true;
        }),

        dsl.waitForPing(t, tc),
        dsl.expectOnlyPings(t, tc)
    ];
});

test2('endpoint: /admin/gossip/tick', 7, 5000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),

        // stop gossip before invoking tick to make sure the tick is from the invocation
        dsl.callEndpoint(t, tc, '/admin/gossip/stop'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminGossipStop,
            direction: 'response'
        }, "Wait for AdminGossipStop response", function (response) {
            return true;
        }),

        dsl.consumePings(t, tc),
        dsl.wait(1000), // normally you would expect pings to be transfered in this time

        dsl.expectOnlyPings(t, tc, 0),

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
});

var lookupKey = 'Hello World ' + Math.random();
test2('endpoint: /admin/lookup ('+lookupKey+')', 7, 5000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),

        dsl.callEndpoint(t, tc, '/admin/lookup', lookupKey),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminLookup,
            direction: 'response'
        }, "Wait for AdminLookup response", function (response) {
            var should = tc.lookup(lookupKey);
            t.equal(response.body.dest, should, "Testing chosen dest");
            return true;
        }),

        dsl.expectOnlyPings(t, tc)
    ];
});

test2('endpoint: /admin/stats', 7, 5000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),

        dsl.callEndpoint(t, tc, '/admin/stats'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.Stats,
            direction: 'response'
        }, "Wait for Stats response", function (response) {
            // TODO do validation of specific values, the payload structure is already validated
            return true;
        }),

        dsl.expectOnlyPings(t, tc)
    ];
});

test2('endpoint: /admin/member/leave', 7, 5000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),

        // this makes testing the piggy backed status easier
        dsl.waitForEmptyPing(t, tc),

        // instruct node to leave cluster
        dsl.callEndpoint(t, tc, '/admin/member/leave'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminMemberLeave,
            direction: 'response'
        }, "Wait for Stats response", function (response) {
            return response.arg3.toString() === 'ok';
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

        dsl.expectOnlyPings(t, tc)
    ];
});

test2('endpoint: /admin/member/join', 7, 10000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),

        // this makes testing the piggy backed status easier
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // instruct node to leave cluster
        dsl.callEndpoint(t, tc, '/admin/member/leave'),
        dsl.validateEventBody(t, tc, {
            type: events.Types.AdminMemberLeave,
            direction: 'response'
        }, "Wait for Stats response", function (response) {
            return response.arg3.toString() === 'ok';
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
        }, "Wait for Stats response", function (response) {
            return response.arg3.toString() === 'rejoined';
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
        }),

        dsl.expectOnlyPings(t, tc)
    ];
});
