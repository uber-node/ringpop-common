var events = require('./events');
var dsl = require('./ringpop-assert');
var test2 = require('./test-util').test2;
var prepareCluster = require('./test-util').prepareCluster;
var prepareWithStatus = require('./test-util').prepareWithStatus;
var _ = require('lodash');
var clusterSizes = require('./test-util').clusterSizes;
clusterSizes = _.filter(clusterSizes, function(n) { return n > 1; });


test2('ringpop doesn\'t bump incarnation number after being piggybacked to alive', clusterSizes, 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPing(t, tc, 0, 
            {sourceIx: 0, subjectIx: 'sut', status: 'alive'}),
        dsl.waitForPingResponse(t, tc, 0, 1, true),
        // check if piggyback update has no effect on incarnation number
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('ringpop bumps incarnation number after being piggybacked to suspect', clusterSizes, 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPing(t, tc, 0, 
            {sourceIx: 0, subjectIx: 'sut', status: 'suspect'}),
        dsl.waitForPingResponse(t, tc, 0, 1, true),
        // check if piggyback update has taken effect
        // dsl.assertMembership(t, tc, {''})
        dsl.assertBumpedIncarnationNumber(t, tc),
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('ringpop bumps incarnation number after being piggybacked to faulty', clusterSizes, 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPing(t, tc, 0, 
            {sourceIx: 0, subjectIx: 'sut', status: 'faulty'}),
        dsl.waitForPingResponse(t, tc, 0, 1, true),
        // check if piggyback update has taken effect
        // dsl.assertMembership(t, tc, {''})
        dsl.assertBumpedIncarnationNumber(t, tc),
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

