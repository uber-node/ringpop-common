var events = require('./events');
var test2 = require('./test-util').test2;
var prepareCluster = require('./test-util').prepareCluster;
var dsl = require('./ringpop-assert');
var _ = require('lodash');
var clusterSizes = require('./test-util').clusterSizes;
clusterSizes = _.filter(clusterSizes, function(n) { return n > 2; });

test2('ringpop sends piggyback info in ping request', clusterSizes, 20000, prepareCluster(function(t, tc, n) {
    return [
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
                ping.body.changes.length === 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source === tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status === "suspect";
        })
    ];
}));

test2('ringpop updates its dissimination list on pingreq', clusterSizes, 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed via pingreq
        dsl.sendPingReq(t, tc, 0, 2, {
            sourceIx: 0,
            subjectIx: 1,
            status: 'suspect',
        }),
        dsl.waitForPingReqResponse(t, tc, 0, 2, true),

        // Wait for a ping from the SUT and validate that it has the piggybacked information in there
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'request'
        }, "Test if piggybacked information is in ping", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source === tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status === "suspect";
        })
    ];
}));

test2('ringpop sends piggyback info in ping-req response', clusterSizes, 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.sendPing(t, tc, 0, {
            sourceIx: 0,
            subjectIx: 1,
            status: 'suspect',
        }),
        dsl.waitForPingResponse(t, tc, 0),

        dsl.sendPingReq(t, tc, 1, 2),

        // Wait for a ping from the SUT and validate that it has the piggybacked information in there
        dsl.validateEventBody(t, tc, {
            type: events.Types.PingReq,
            direction: 'response'
        }, "Test if piggybacked information is in pingreq response", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source === tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status === "suspect";
        })
    ];
}));

test2('ringpop piggybacking decays', clusterSizes, 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.sendPing(t, tc, 0, {
            sourceIx: 0,
            subjectIx: 1,
            status: 'suspect',
        }),
        dsl.waitForPingResponse(t, tc, 0),

        // if the SUT decays the updates it will start pinging with 0 updates at some point
        // TODO do this with a set number of pings to the SUT to speed up the test
        dsl.waitForEmptyPing(t, tc)
    ];
}));

test2('ringpop piggybacking should ignore updates when it already knows about', clusterSizes, 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information that is already known to the SUT
        dsl.sendPing(t, tc, 0, {
            sourceIx: 0,
            subjectIx: 1,
            status: 'alive' // this information is already known to the SUT
        }),
        dsl.waitForPingResponse(t, tc, 0),

        // TODO speed this up by sending a ping with a correct checksum
        // Send ping and validate the body
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'request'
        }, "Test if piggybacked information is not in ping", function (ping) {
            return !ping.body ||
                !ping.body.changes ||
                ping.body.changes.length === 0;
        })
    ];
}));

test2('ringpop sends piggyback info in ping response', clusterSizes, 20000, prepareCluster(function(t, tc, n) {
    return [
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
                ping.body.changes.length === 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source === tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status === "suspect";
        })
    ];
}));

test2('ringpop sends piggyback info in ping-req request', clusterSizes, 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.sendPing(t, tc, 0, {
            sourceIx: 0,
            subjectIx: 1,
            status: 'suspect',
        }),
        dsl.waitForPingResponse(t, tc, 0),

        // cause the SUT to send a ping-req
        dsl.disableAllNodesPing(t, tc),

        // Wait for a ping from the SUT and validate that it has the piggybacked information in there
        dsl.validateEventBody(t, tc, {
            type: events.Types.PingReq,
            direction: 'request'
        }, "Test if piggybacked information is in ping", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source === tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status === "suspect";
        })
    ];
}));
