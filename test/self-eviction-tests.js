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
var test2 = require('./test-util').test2;


test2('self eviction changes state to faulty and pings members', getClusterSizes(2), 20000, prepareCluster(function(t, tc, n) {
    return [

        // disable pinging from fake nodes and stop gossip on the SUT
        // this is necessary to make sure all the pings assert later on
        // are sent from the graceful shutdown.
        dsl.disableAllNodesPing(t, tc),
        dsl.stopGossip(t, tc),

        // graceful shutdown SUT (sent SIGTERM and wait till exit)
        dsl.waitForGracefulShutdown(t, tc),

        // assert pings
        assertValidPings(t, tc, n)
    ];
}));

/**
 * Validate the pings. Assert that:
 * - the number of pings doesn't exceed 40% of the cluster
 * - the pings are all to different members
 * - the pings should declare the SUT faulty and originate from the SUT itself
 *
 * @param t the current test suite
 * @param tc the test coordinated
 * @param n the number of servers in the cluster
 * @return {assertValidPings} the assert functions
 */
function assertValidPings(t, tc, n) {
    return function assertValidPings(list, cb) {
        var pings = _.filter(list, {
            type: events.Types.Ping,
            direction: 'request'
        });
        if (pings.length === 0) {
            return cb(null);
        }

        var maxPings = Math.ceil(n * 0.4);
        t.ok(pings.length <= maxPings, 'number of pings does not exceed 40% of cluster');

        var receivers = _.pluck(pings, 'receiver');
        t.ok(_.uniq(receivers).length === receivers.length, 'all pings are to unique members');

        _.each(pings, function validatePing(ping) {
            t.equal(ping.body.changes.length, 1);

            var change = ping.body.changes[0];
            t.equal(change.source, tc.sutHostPort);
            t.equal(change.status, 'faulty');
            t.equal(ping.body.source, tc.sutHostPort);
        });

        cb(_.reject(list, pings));
    }
}
