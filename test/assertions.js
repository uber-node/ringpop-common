var _ = require('lodash');
var events = require('./events');
var safeJSONParse = require('./util').safeParse;
var util = require('util');

function wait(millis) {
    return _.once(function wait(list, cb) {
            setTimeout(function() { cb(list); }, millis);
    });
}

function assertStats(t, tc, a, s, f) {
    return [requestAdminStats(tc),
            consumeStats(t, tc, a, s, f)];
}

function requestAdminStats(tc) {
    return _.once(function reuqestAdminStats(list, cb) {
        tc.getAdminStats(function(event) {
            cb(list);
        });
    });
}

function consumeStats(t, tc, alive, suspect, faulty) {
    return function consumeStats(list, cb) {
        var ix = _.findIndex(list, {type: events.Types.Stats});
        if (ix === -1) {
            cb(null);
            return;
        }

        var stats = safeJSONParse(list[ix].arg3);
        var a = _.filter(stats.membership.members, {status: 'alive'}).length;
        var s = _.filter(stats.membership.members, {status: 'suspect'}).length;
        var f = _.filter(stats.membership.members, {status: 'faulty'}).length;

        t.equal(a, alive, 'check number of alive nodes', {error: {stats: stats}});
        t.equal(s, suspect, 'check number of suspect nodes', {error: {stats: stats}});
        t.equal(f, faulty, 'check number of faulty nodes', {error: {stats: stats}});

        _.pullAt(list, ix);
        cb(list);
    }
}

function requestPing(tc, nodeIx) {
    return _.once(function requestPing(list, cb) {
        tc.fakeNodes[nodeIx].requestPing(function() {
            cb(list);
        });
    });
}

function consumeJoins(t, tc, n) {
    return function consumeJoins(list, cb) {
        var joins = _.filter(list, {type: events.Types.Join});
        if (joins.length < n) {
            cb(null);
            return;
        }
        
        t.equals(joins.length, n, 'check number of joins', 
            {error: {journal: _.pluck(list, 'endpoint')}});


        cb(_.reject(list, {type: events.Types.Join}));
    }
}

function assertRoundRobinPings(t, tc, pings, millis) {
    return [
        wait(millis),
        consumeRoundRobinPings(t, tc, pings)
    ];
}

function consumeRoundRobinPings(t, tc, n) {
    return function consumeRoundRobinPings(list, cb) {
        var pings = _.filter(list, {type: events.Types.Ping});
        pings = _.pluck(pings, "req.channel.hostPort");

        // expect ping every 200 ms
        if (pings.length  < n - 1 || pings.length > n + 1) {
            t.fail(util.format('not the right amount of Pings, got %d expected %d +/- 1', pings.length, n),
                {error: {pings: pings}});
        } else {
            t.pass('check amount of pings received');
        }

        // check if pings are distributed evenly over the membership
        var hostPortFreqs = _.countBy(pings);
        var min = _.min(_.values(hostPortFreqs));
        var max = _.max(_.values(hostPortFreqs));
        t.ok(min == max || min + 1 == max, 
            'pings distributed evenly', 
            {error: {hostPortFreqs: hostPortFreqs}});
        
        // check if pingrounds are randomized
        var rounds = _.chunk(pings, tc.fakeNodes.length);
        var sliceFreqs = _.countBy(rounds);
        t.ok(_.every(sliceFreqs, function(v, k) { return v === 1; }), 
            'ping rounds should be randomized',
            {error: {sliceFreqs: sliceFreqs}});

        cb(_.reject(list, {type: events.Types.Ping}));
    }
}

function consumePingResponse(t, tc, nodeIx) {
    return function consumePingResponse(list, cb) {
        var ix = _.findIndex(list, {type: events.Types.Ping, direction: 'response'});
        if (ix == -1) {
            cb(null);
            return;
        }
        // console.log(list[ix]);
        _.remove(list, ix);
        return cb(list);
    }
}

function consumeOnlyPings(t, tc) {
    return function consumeOnlyPings(list, cb) {
        var pings = _.filter(list, {type: 'Ping', direction: 'request'})
        t.equal(pings.length, list.length, 'check if all remaining events are Pings',
            {error: {eventTypes: 
                _.zip(_.pluck(list, 'type'), _.pluck(list, 'direction'))
            }});

        cb(_.reject(list, {type: 'Ping', direction: 'request'}));
    }
}


// function consumeValidAdminStats(t, stats) {
//     t.ok(stats, 'Stats should be present');
//     t.ok(stats.membership && stats.membership.members, 'And should contain a membership list');
// }

// // XXX make this much richer
// function consumeMembership(t, adminStats, expectedMembership) {
//     var reportedMembership = adminStats.membership.members.map(_.property('address'))
//     expectedMembership = expectedMembership.sort();
//     t.deepEqual(reportedMembership, expectedMembership, 'Membership is ' + expectedMembership);
// }

module.exports = {
    wait: wait,
    consumeJoins: consumeJoins,
    consumeOnlyPings: consumeOnlyPings,
    assertRoundRobinPings: assertRoundRobinPings,
    assertStats: assertStats,
    requestPing: requestPing,
    consumePingResponse: consumePingResponse,
}
