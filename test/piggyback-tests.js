var events = require('./events');
var test2 = require('./it-tests').test2;
var dsl = require('./ringpop-assert');

test2('ringpop sends piggyback info in ping request', 7, 20000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.sendPing(t, tc, 0, {
            sourceIx: 0,
            subjectIx: 1,
            status: 'suspect',
        }),
        dsl.waitForPingResponse(t, tc, 0),

        // Wait for a ping from the SUT and validate that it has the piggybacked information in there
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'request'
        }, "Test if piggybacked information is in ping", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length == 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source == tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status == "suspect";
        }),

        dsl.expectOnlyPings(t, tc),
    ];
});

test2('ringpop sends piggyback info in ping response', 7, 20000, function(t, tc, n) {
    return [
        dsl.waitForJoins(t, tc, n),
        dsl.assertStats(t, tc, n+1, 0, 0),
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.sendPing(t, tc, 0, {
            sourceIx: 0,
            subjectIx: 1,
            status: 'suspect',
        }),
        dsl.waitForPingResponse(t, tc, 0),


        // Send ping and validate the body
        dsl.sendPing(t, tc, 2),
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'response'
        }, "Test if piggybacked information is in ping response", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length == 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source == tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status == "suspect";
        }),

        dsl.expectOnlyPings(t, tc),
    ];
});

