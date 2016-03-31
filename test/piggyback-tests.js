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
var _ = require('lodash');
var getClusterSizes = require('./it-tests').getClusterSizes;

test2('ringpop sends piggyback info in ping request', getClusterSizes(3), 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        dsl.changeStatus(t, tc, 0, 1, 'suspect'),
        dsl.waitForPingResponse(t, tc, 0),

        // Wait for a ping from the SUT and validate that it has the piggybacked information in there
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'request'
        }, "Test if piggybacked information is in ping request", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source === tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status === "suspect";
        })
    ];
}));

test2('ringpop updates its dissimination list on pingreq', getClusterSizes(3), 20000, prepareCluster(function(t, tc, n) {
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
        }, "Test if piggybacked information is in ping request", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source === tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status === "suspect";
        })
    ];
}));

test2('ringpop sends piggyback info in ping-req response', getClusterSizes(3), 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.changeStatus(t, tc, 0, 1, 'suspect'),
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

test2('ringpop piggybacking decays', getClusterSizes(3), 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.changeStatus(t, tc, 0, 1, 'suspect'),
        dsl.waitForPingResponse(t, tc, 0),

        // if the SUT decays the updates it will start pinging with 0 updates at some point
        // TODO do this with a set number of pings to the SUT to speed up the test
        dsl.waitForEmptyPing(t, tc)
    ];
}));

test2('ringpop piggybacking should ignore updates when it already knows about', getClusterSizes(3), 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information that is already known to the SUT
        dsl.changeStatus(t, tc, 0, 1, 'alive'),
        dsl.waitForPingResponse(t, tc, 0),

        // TODO speed this up by sending a ping with a correct checksum
        // Send ping and validate the body
        dsl.validateEventBody(t, tc, {
            type: events.Types.Ping,
            direction: 'request'
        }, "Test if piggybacked information is not in ping request", function (ping) {
            return !ping.body ||
                !ping.body.changes ||
                ping.body.changes.length === 0;
        })
    ];
}));

test2('ringpop sends piggyback info in ping response', getClusterSizes(3), 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.changeStatus(t, tc, 0, 1, 'suspect'),
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

test2('ringpop sends piggyback info in ping-req request', getClusterSizes(3), 20000, prepareCluster(function(t, tc, n) {
    return [
        // TODO clear the dissemination information from the SUT by flooding it with pings instead of waiting for it
        dsl.waitForEmptyPing(t, tc), // problem is that if decay is not working you might never get to this point

        // send information to be piggy backed
        dsl.changeStatus(t, tc, 0, 1, 'suspect'),
        dsl.waitForPingResponse(t, tc, 0),

        // cause the SUT to send a ping-req
        dsl.disableAllNodesPing(t, tc),

        // Wait for a ping from the SUT and validate that it has the piggybacked information in there
        dsl.validateEventBody(t, tc, {
            type: events.Types.PingReq,
            direction: 'request'
        }, "Test if piggybacked information is in pingreq request", function (ping) {
            return ping.body &&
                ping.body.changes &&
                ping.body.changes.length === 1 &&
                ping.body.changes[0] &&
                ping.body.changes[0].source === tc.fakeNodes[0].getHostPort() &&
                ping.body.changes[0].status === "suspect";
        })
    ];
}));
