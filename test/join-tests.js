var events = require('./events');
util = require('util');
var test2 = require('./test-util').test2;
var dsl = require('./ringpop-assert');
var prepareCluster = require('./test-util').prepareCluster;


function joinFakeCluster(n) {
    test2('join cluster of 1+' + n + ' nodes', n, 20000, 
        prepareCluster(function(t, tc, n) { return [
            dsl.assertStats(t, tc, n+1, 0, 0),
            dsl.expectOnlyPings(t, tc),
        ];})
    );
}

joinFakeCluster(1);
joinFakeCluster(2);
joinFakeCluster(3);
joinFakeCluster(4);
joinFakeCluster(5);
joinFakeCluster(6);
joinFakeCluster(7);
joinFakeCluster(8);
joinFakeCluster(10);
joinFakeCluster(20);
joinFakeCluster(30);


test2('join ringpop with fake node', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.joinNewNode(t, tc, n),
        dsl.waitForJoinResponse(t, tc, n),
        dsl.wait(1000),
        dsl.assertStats(t, tc, n+2, 0, 0),
        dsl.expectOnlyPings(t, tc),
    ];})
);


