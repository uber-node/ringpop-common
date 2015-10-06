var events = require('./events');
var test2 = require('./test-util').test2;
var dsl = require('./ringpop-assert');

// endpoints
// /admin/debugClear
// /admin/debugSet
// /admin/lookup
// /admin/stats

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