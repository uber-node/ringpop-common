var events = require('./events');
var util = require('util');
var test2 = require('./test-util').test2;
var dsl = require('./ringpop-assert');
var prepareCluster = require('./test-util').prepareCluster;
var clusterSizes = require('./test-util').clusterSizes;

function joinFakeCluster(n) {
    test2('join cluster of 1+' + n + ' nodes', [n], 20000, 
        prepareCluster(function(t, tc, n) { return [
            dsl.assertStats(t, tc, n+1, 0, 0),
            dsl.expectOnlyPings(t, tc),
        ];})
    );
}

clusterSizes.forEach(function(n) {
    joinFakeCluster(n);
});

test2('join ringpop with fake node', clusterSizes, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.joinNewNode(t, tc, n),
        dsl.waitForJoinResponse(t, tc, n),
        dsl.wait(100),
        dsl.assertStats(t, tc, n+2, 0, 0),
        dsl.expectOnlyPings(t, tc),
    ];})
);


