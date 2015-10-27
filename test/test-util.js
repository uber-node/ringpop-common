dsl = require('./ringpop-assert');
TestCoordinator = require('./test-coordinator');
getProgramPath = require('./it-tests').getProgramPath;
getProgramInterpreter = require('./it-tests').getProgramInterpreter;

// test is like normal tape test but also prints t.error.details if a fail occured
var Test = require('tape');
function test(msg, opts, cb) {
    var t = Test(msg, opts, cb);
    t.on('result', function(res) {
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
        })
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
    }
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

var clusterSizes = [1, 2, 3, 4, 5, 6, 7, 10, 21, 25, 30];

module.exports = {
    test: test,
    test2: test2,
    clusterSizes: clusterSizes,
    prepareCluster: prepareCluster,
    prepareWithStatus: prepareWithStatus,
}