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
var getClusterSizes = require('./it-tests').getClusterSizes;
var prepareCluster = require('./test-util').prepareCluster;
var test2 = require('./test-util').test2;

test2('ringpop full lookup returns correct values', getClusterSizes(1), 20000, prepareCluster(function(t, tc, n) {
    var membership = tc.getMembership();
    var hostPorts = _.map(membership, function(member) {
        return member.host + ':' + member.port;
    });

    // Loop through all hostPorts
    return _.map(hostPorts, function eachHostPort(hostPort) {
        // And all replica points
        return _.times(tc.replicaPoints, function eachReplicaPoint(index) {
            var replicaPoint = hostPort + index;

            // And validate if a lookup on it results in the right hostPort
            return dsl.assertLookup(t, tc, replicaPoint, hostPort);
        });
    });
}));

test2('ringpop lookup of faulty member should return different member', getClusterSizes(2), 20000, prepareCluster(function(t, tc){
    // pick a node
    var hostPort = tc.getFakeNodes()[0].getHostPort();
    // replica point 0
    var key = hostPort + '0';
    return [
        // validate if lookup hashes to the node
        dsl.assertLookup(t, tc, key, hostPort),

        // change it to faulty so it should be removed from the ring
        dsl.changeStatus(t, tc, 1, 0, 'faulty'),
        dsl.waitForPingResponse(t, tc, 1),

        // assert that it does not hash to the node anymore
        dsl.assertLookup(t, tc, key, function(dest){
            return dest !== hostPort;
        })
    ];
}));


validateLookupAfterStatusChange('suspect', true);
validateLookupAfterStatusChange('faulty', false);
validateLookupAfterStatusChange('tombstone', false);
validateLookupAfterStatusChange('leave', false);

function validateLookupAfterStatusChange(newStatus, shouldStayInRing) {
    test2('ringpop lookup after changing status to ' + newStatus + ' is correct', getClusterSizes(2), 20000, prepareCluster(function(t, tc) {
        // pick a node
        var hostPort = tc.getFakeNodes()[0].getHostPort();
        // replica point 0
        var key = hostPort + '0';
        return [
            // validate if lookup hashes to the node
            dsl.assertLookup(t, tc, key, hostPort),

            // change it to faulty so it should be removed from the ring
            dsl.changeStatus(t, tc, 1, 0, newStatus),
            dsl.waitForPingResponse(t, tc, 1),

            // assert that the node
            dsl.assertLookup(t, tc, key, function validateLookup(dest) {
                if (shouldStayInRing) {
                    // dest is still the same member
                    return dest === hostPort;
                } else {
                    // dest is now a different member
                    return dest !== hostPort;
                }
            })
        ];
    }));
}
