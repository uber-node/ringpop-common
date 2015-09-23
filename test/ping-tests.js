var events = require('./events');
var test2 = require('./test-util').test2;
var dsl = require('./ringpop-assert');
var prepareCluster = require('./test-util').prepareCluster;

test2('fair round robin pings', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.assertRoundRobinPings(t, tc, 30, 6000),
    ];})
);

test2('ping ringpop from fake-nodes', 8, 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.sendPings(t, tc, [0,1,1,1,5,6,7]),
        dsl.waitForPingResponses(t, tc, [0,1,1,1,5,6,7]),
    ];})
);
