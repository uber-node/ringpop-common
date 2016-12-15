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
var prepareWithStatus = require('./test-util').prepareWithStatus;
var test2 = require('./test-util').test2;

test2('ringpop should set it\'s identity during bootstrap', getClusterSizes(2), 20000, function init(t, tc, callback) {
        tc.sutIdentity = 'identity';

        callback();
    }, prepareCluster(function(t, tc, n) {
        return [
            dsl.assertStats(t, tc, n + 1, 0, 0, {
                'sut': {
                    labels: {"__identity": "identity"}
                }
            })
        ];
    })
);

test2('ringpop - with identity - full lookup returns correct values', getClusterSizes(1), 20000, function init(t, tc, callback) {
    tc.sutIdentity = 'sut';
    tc.fakeNodes[0].labels = {'__identity' : 'fake-node'}

    callback();
}, prepareCluster(function(t, tc, n) {
    return dsl.assertFullHashring(t, tc, {0: 'fake-node', 'sut': 'sut'});
}));

test2('ringpop - when identity changes, hashring is updated', getClusterSizes(1), 20000, prepareCluster(function(t, tc, n) {
    return [
        dsl.assertFullHashring(t, tc),
        dsl.changeStatus(t, tc, 0, 0, {
            subjectIncNoDelta: +1,
            status: 'alive',
            labels: {
                '__identity': 'identity'
            }
        }),
        dsl.waitForPingResponse(t, tc, 0),
        dsl.assertFullHashring(t, tc, {0: 'identity'}), // validate change from no identity to 'identity'
        dsl.changeStatus(t, tc, 0, 0, {
            subjectIncNoDelta: +1,
            status: 'alive',
            labels: {
                '__identity': 'identity2'
            }
        }),
        dsl.waitForPingResponse(t, tc, 0),
        dsl.assertFullHashring(t, tc, {0: 'identity2'}), // validate change from 'identity' to 'identity2'

        dsl.changeStatus(t, tc, 0, 0, {
            subjectIncNoDelta: +1,
            status: 'alive',
            labels: {}
        }),
        dsl.waitForPingResponse(t, tc, 0),
        dsl.assertFullHashring(t, tc) // validate change from 'identity2' to no identity
    ]
}));
