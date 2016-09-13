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

var dsl = require('./ringpop-assert');
var _ = require('lodash');
var TestCoordinator = require('./test-coordinator');
var getProgramPath = require('./it-tests').getProgramPath;
var getProgramInterpreter = require('./it-tests').getProgramInterpreter;
var main = require('./it-tests');
// test is like normal tape-catch test but also prints t.error.details if a fail occured.
// tape-catch catches JS exceptions and reports them as test failures.
var Test = require('tape-catch');

function test(msg, opts, cb) {
    var t = Test(msg, opts, cb);
    t.on('result', function(res) {
        if (!res.ok) {
            main.incrementFailureCount()
        }
        if(!res.ok && res.error.details !== undefined) {
            console.log('============== error details ===============');
            console.log();
            console.log(typeof res.error.details === 'object' ?
                JSON.stringify(res.error.details, null, 2) : res.error.details);
            console.log();
            console.log('============================================');
            console.log();
            if(t._tc) {
                console.log('============== node index : hostport ===============');
                console.log("sut: "+ t._tc.sutHostPort);
                t._tc.fakeNodes.forEach(function(fakeNode, i) {
                    console.log(i + " => " + fakeNode.host + ":" + fakeNode.port);
                });
                console.log('====================================================');
            }
        }
    });
}

// callback returns a list of closures, which will be validated at a later
// stage. For documentation on validation, see documentation of
// ringpop-assert.validate().
function test2(str, ns, deadline, init, callback) {
    if (typeof callback === 'undefined') {
        callback = init;
        init = function(t, tc, cb) { cb(); return; }
    }

    ns.forEach(function(n) {
        test('cluster-size ' + n + ': ' + str, function(t) {
            var tc = new TestCoordinator({
                sut: {
                    program: getProgramPath(),
                    interpreter: getProgramInterpreter(),
                },
                numNodes: n,
            });
            t._tc = tc;

            init(t, tc, function onInit() {
                tc.start(function onTCStarted() {
                    dsl.validate(t, tc, callback(t, tc, n), deadline);
                });
            });

        });
    });
}

// testStateTransitions tests state transitions from an initial state to a newState and
// asserts the final state. During the transition an relative incarnation number
// can be sent in the piggybacked ping to test different rules
//
// statusCounts is an hash in the following form:
// {
//   <status>: count
// }
//
// The alive status is treated as a relative number that is added to the size of the
// cluster being tested. eg:
// {
//   alive: -1
// }
// for a clustersize of 5 will assert that there will be 4 nodes alive after the test.
function testStateTransitions(ns, initial, newState, finalState, incNoDelta, statusCounts) {
    var ix = 1;
    test2('change status from ' + initial + ', to ' + newState + ' with incNoDelta ' + incNoDelta + ' via piggybacking',
        ns, 20000, prepareWithStatus(ix, initial, function(t, tc, n) {
            expectedMembers = {};
            expectedMembers[ix] = {status: finalState};

            // alive is a delta
            var counts = _.extend({}, statusCounts);
            counts.alive = (counts.alive || 0) + n;
            return [
                dsl.changeStatus(t, tc, 0, 1, newState, incNoDelta),
                dsl.waitForPingResponse(t, tc, 0),
                dsl.assertStats(t, tc, counts, expectedMembers),
            ];
        })
    );
}

function prepareCluster(insert_fns) {
    return function(t, tc, n) {
        return [
            dsl.waitForPing(t, tc, false),
            dsl.waitForJoins(t, tc, n),
            dsl.assertDetectChecksumMethod(t, tc),
            dsl.assertStats(t, tc, n+1, 0, 0),
            insert_fns(t, tc, n),
            dsl.expectOnlyPingsAndPingReqs(t, tc),
        ];
    };
}

function prepareWithStatus(ix, status, insert_fns) {
    var sourceIx = 0;
    if (ix == sourceIx) {
        sourceIx = 1;
    }

    return prepareCluster(function(t, tc, n) {
        return [
            dsl.changeStatus(t, tc, sourceIx, ix, status),
            dsl.waitForPingResponse(t, tc, sourceIx),
            insert_fns(t, tc, n),
        ];
    });
}


module.exports = {
    test: test,
    test2: test2,
    testStateTransitions: testStateTransitions,
    prepareCluster: prepareCluster,
    prepareWithStatus: prepareWithStatus,
};
