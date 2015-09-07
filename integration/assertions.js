var _ = require('lodash');
var events = require('./events');
var safeJSONParse = require('./util').safeParse;

function assertJoins(t, tc, n) {
    return function assertJoins(list) {
        var joins = _.filter(list, {type: events.Types.Join});
        if (joins.length < n) {
            return null;
        }
        
        t.equals(joins.length, n, 'check number of joins', 
            {error: {journal: _.pluck(list, 'endpoint')}});

        return _.reject(list, {type: events.Types.Join});
    }
}

function assertRoundRobinPings(t, tc, n) {
    return function assertRoundRobinPings(list) {
        var pings = _.filter(list, {type: events.Types.Ping});
        pings = _.pluck(pings, "req.channel.hostPort");

        // expect ping every 200 ms
        if (pings.length  < n - 1 || pings.length > n + 1) {
            t.fail(sprintf('not the right amount of Pings, got %d expected %d +/- 1', pings.length, n),
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

        return _.reject(list, {type: events.Types.Ping});
    }
}

function requestAdminStats(tc) {
    return function requestAdminStats(list) {
        tc.getAdminStats(function() { /* emit stats */ });
        return list;
    }
}

function assertStats(t, tc, alive, suspect, faulty) {
    return function assertAliveSuspectDead(list) {
        var ix = _.findIndex(list, {type: events.Types.Stats});
        if (ix === -1)
            return null;

        var stats = safeJSONParse(list[ix].arg3);
        var a = _.filter(stats.membership.members, {status: 'alive'}).length;
        var s = _.filter(stats.membership.members, {status: 'suspect'}).length;
        var f = _.filter(stats.membership.members, {status: 'faulty'}).length;

        t.equal(a, alive, 'check number of alive nodes', {error: {stats: stats}});
        t.equal(s, suspect, 'check number of suspect nodes', {error: {stats: stats}});
        t.equal(f, faulty, 'check number of faulty nodes', {error: {stats: stats}});

        _.pullAt(list, ix);
        return list
    }
}

function assertOnlyPings(t, tc) {
    return function assertOnlyPings(list) {
        var pings = _.filter(list, {type: 'Ping'})
        t.equal(pings.length, list.length, 
            'check if all remaining events are Pings',
            {error: {eventTypes: _.pluck(list, 'type')}});

        return _.reject(list, {type: 'Ping'});
    }
}

function wait(millis) {
    var done = false;
    var timeout = _.once(function() {
        setTimeout(function() { done = true; }, millis);
    });
    return function wait(list) {
        timeout();
        if (done === false) {
            return null;
        }
        return list;
    }
}

function clear() {
    return function clear(list) {
        return [];
    }
}

// function assertValidAdminStats(t, stats) {
//     t.ok(stats, 'Stats should be present');
//     t.ok(stats.membership && stats.membership.members, 'And should contain a membership list');
// }

// // XXX make this much richer
// function assertMembership(t, adminStats, expectedMembership) {
//     var reportedMembership = adminStats.membership.members.map(_.property('address'))
//     expectedMembership = expectedMembership.sort();
//     t.deepEqual(reportedMembership, expectedMembership, 'Membership is ' + expectedMembership);
// }

module.exports = {
    wait: wait,
    assertJoins: assertJoins,
    assertOnlyPings: assertOnlyPings,
    assertRoundRobinPings: assertRoundRobinPings,
    requestAdminStats: requestAdminStats,
    assertStats: assertStats,
    clear: clear,
}