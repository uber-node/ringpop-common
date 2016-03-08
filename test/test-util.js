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
var TestCoordinator = require('./test-coordinator');
var getProgramPath = require('./it-tests').getProgramPath;
var getProgramInterpreter = require('./it-tests').getProgramInterpreter;
var main = require('./it-tests');
// test is like normal tape test but also prints t.error.details if a fail occured
var Test = require('tape');
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
        }
    });
}

// callback returns a list of closures, which will be validated at a later
// stage. For documentation on validation, see documentation of
// ringpop-assert.validate().
function test2(str, ns, deadline, callback) {
    ns.forEach(function(n) {
        test('cluster-size ' + n + ': ' + str, function(t) {
            var tc = new TestCoordinator({
                sut: {
                    program: getProgramPath(),
                    interpreter: getProgramInterpreter(),
                },
                numNodes: n,
            });

            tc.start(function onTCStarted() {
                dsl.validate(t, tc, callback(t, tc, n), deadline);
            });
        });
    });
}

function prepareCluster(insert_fns) {
    return function(t, tc, n) {
        return [
            dsl.waitForJoins(t, tc, n),
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

    return prepareCluster(function(t, tc, n) { return [
        dsl.sendPing(t, tc, sourceIx, {sourceIx: sourceIx, subjectIx: ix, status: status }),
        dsl.waitForPingResponse(t, tc, sourceIx),
        insert_fns(t, tc, n),
    ];});
}


module.exports = {
    test: test,
    test2: test2,
    prepareCluster: prepareCluster,
    prepareWithStatus: prepareWithStatus,
};
