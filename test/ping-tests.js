var events = require('./events');
var test2 = require('./test-util').test2;
var dsl = require('./ringpop-assert');
var prepareCluster = require('./test-util').prepareCluster;
var clusterSizes = require('./test-util').clusterSizes;
var _ = require('lodash');

test2('fair round robin pings', _.filter(clusterSizes, function(n) { return n > 5; }) , 20000, 
    prepareCluster(function(t, tc, n) { return [
        dsl.assertRoundRobinPings(t, tc, 30, 6000),
    ];})
);

test2('ping ringpop from fake-nodes', clusterSizes, 20000, 
    prepareCluster(function(t, tc, n) { 
    	pingList = _.filter([0,1,1,1,5,6,7], function(i) { return i < n; });
	    return [
	        dsl.sendPings(t, tc, pingList),
	        dsl.waitForPingResponses(t, tc, pingList),
	    ];
	})
);
