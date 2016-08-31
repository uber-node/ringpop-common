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

var _ = require('lodash');
var async = require('async');
var glob = require('glob');
var jsonschema = require('jsonschema');
var events = require('./events');
var safeJSONParse = require('./util').safeParse;
var util = require('util');
var makeHostPort = require('./util').makeHostPort;
var detectChecksumMethod = require('./membership-checksum').detect;

function errDetails(details) {
    return {error:{details:details}};
}

function wait(millis) {
    var f = _.once(function wait(list, cb) {
            setTimeout(function() { cb(list); }, millis);
    });
    f.callerName = 'wait';
    return f;
}

function waitForJoins(t, tc, n) {
    n = _.min([6, n]);
    return function waitForJoins(list, cb) {
        var joins = _.filter(list, {type: events.Types.Join});
        if (joins.length < n) {
            cb(null);
            return;
        }

        t.equals(joins.length, n, 'check number of joins',
            errDetails({journal: _.pluck(list, 'endpoint')}));

        //XXX: a bit inappropriate to get sutIncarnationNumber like this
        tc.test_state['sutIncarnationNumber'] = safeJSONParse(joins[0].arg3).incarnationNumber;
        cb(_.reject(list, {type: events.Types.Join}));
    };
}

function waitForPingReqs(t, tc, n) {
    return function waitForPingReqs(list, cb) {
        var pingReqs = _.filter(list, {type: events.Types.PingReq});

        if (pingReqs.length < n) {
            cb(null);
            return;
        }

        t.equal(pingReqs.length, n, 'check number of ping-reqs',
            errDetails({pingReqs: pingReqs}));

        cb(_.reject(list, {type: events.Types.PingReq, direction: 'request'}));
    };
}

function waitForPing(t, tc) {
    return function waitForPing(list, cb) {
        var index = _.findIndex(list, {
            type: events.Types.Ping,
            direction: 'request'
        });

        if (index === -1) {
            // there is no ping, continue
            return cb(null);
        }

        list.splice(index, 1); // remove ping from list

        return cb(list);
    };
}

// drainDisseminator sends 30 pings to the SUT. The SUT responds with changes
// that it has to disseminate. After a change has been disseminated maxP times
// the SUT will remove that change from it's disseminator. maxP depends on
// cluster size. For clusters smaller than 10, maxP=15, for clusters smaller
// than 100, maxP=30 by default. After the 30 pings we call waitForEmptyPing
// to make sure that the disseminator is indeed drained.
function drainDisseminator(t, tc) {
    return [
        sendPings(t, tc, _.times(30, _.constant(0))),
        waitForPingResponses(t, tc, _.times(30, _.constant(0))),
        waitForEmptyPing(t, tc),
    ];
}

function waitForEmptyPing(t, tc) {
    // Waits for a ping with an empty changes list, and consumes all pings with changes in them
    // usefull to wait for a 'stable' SUT before doing piggyback tests. Given that decay works in the SUT
    return function waitForEmptyPing(list, cb) {
        var pings = _.filter(list, {
            type: events.Types.Ping,
            direction: 'request'
        });

        if (pings.length === 0) {
            // there is no ping, so by definition there will be no empty ping
            return cb(null);
        }

        var nonEmptyPings = pings.filter(function (ping) {
            return ping.body.changes && ping.body.changes.length > 0;
        });

        if (pings.length === nonEmptyPings.length) {
            // all pings are non-empty
            return cb(null);
        }

        // remove all pings
        list = _.reject(list, {
            type: events.Types.Ping,
            direction: 'request'
        });

        return cb(list);
    };
}

function validateEventBody(t, tc, selector, msg, testFn) {
    return function validateEventBody(list, cb) {
        var index = _.findIndex(list, selector);
        if (index < 0) return cb(null); // found no event

        t.ok(testFn(list[index]), msg, errDetails({
            body: list[index] && list[index].body
        }));
        list.splice(index, 1); // remove tested item from event list
        return cb(list);
    };
}

// prefered method since it should be faster, but need to send the correct checksum
// this has the benefit of having checksum validation as well.
function drainSUTDissemination(t, tc) {
    return function drainSUTDissemination(list, cb){
        var lastPing = null;
        // use the first fake node to send all the pings needed
        async.doWhilst(function sendPing(callback) {
            tc.fakeNodes[0].requestPing(function (err, res, arg2, arg3) {
                if (err) return callback(err);

                lastPing = safeJSONParse(arg3);
                console.dir(lastPing);
                if (!lastPing) return callback(new Error("No ping body received"));

                return callback();
            });
        }, function testIfPingIsEmpty() {
            return lastPing.changes.length === 0;
        }, function done(err) {
            // throw err for now when present since cb is not the typical err first callback right now
            if (err) throw err;

            console.log(list.length);
        });
    };
}

function joinNewNode(t, tc, nodeIx) {
    return [
        addFakeNode(t, tc),
        sendJoin(t, tc, nodeIx),
    ];
}

function removeFakeNode(t, tc) {
    var f = _.once(function addNode(list, cb) {
        var n = tc.fakeNodes.length;
        tc.fakeNodes[n-1].shutdown();
        tc.fakeNodes = tc.fakeNodes.slice(0, n-1);
        cb(list);
    });
    f.callerName = 'removeFakeNode';
    return f;
}

function addFakeNode(t, tc) {
    var f = _.once(function addNode(list, cb) {
        var node = tc.createFakeNode();
        node.start(cb.bind(null, list));
    });
    f.callerName = 'addFakeNode';
    return f;
}

function sendJoin(t, tc, nodeIx) {
    var f = _.once(function sendJoin(list, cb) {
        tc.fakeNodes[nodeIx].requestJoin(function() {
            cb(list);
        });
    });
    f.callerName = 'sendJoin';
    return f;
}

function sendPings(t, tc, nodeIxs) {
    return _.map(nodeIxs, function(ix) {
        return sendPing(t, tc, ix);
    });
}

function changeStatus(t, tc, sourceIx, subjectIx, statusOrOptions, subjectIncNoDelta) {
    if (typeof statusOrOptions !== 'object') {
        statusOrOptions = {
            status: statusOrOptions,
            subjectIncNoDelta: subjectIncNoDelta || 0,
        };
    }

    var ping = sendPing(t, tc, sourceIx, _.extend({
        sourceIx: sourceIx,
        subjectIx: subjectIx,
    }, statusOrOptions));

    var f = _.once(function (list, cb) {
        tc.fakeNodes[subjectIx].status = statusOrOptions.status;
        return ping(list, cb);
    });
    f.callerName = 'changeStatus';
    return f;
}

/**
 * Send a ping to the SUT from a fake node
 *
 * @param {Test} t The current running test
 * @param {TestCoordinator} tc The test coordinator.
 * @param {number} nodeIx The index of the fakeNode that should send the ping.
 * @param {object} piggybackOpts The changes to piggy back on the ping.
 * @param {object} bodyOverrides Overwrite specific ping body parameters (checksum, source, sourceIncarnationNumber, changes)
 * @returns {Function} Returns the function that'll be invoked when running the integration test.
 */
function sendPing(t, tc, nodeIx, piggybackOpts, bodyOverrides) {
    var f = _.once(function sendPing(list, cb) {
        var piggybackData = piggyback(tc, piggybackOpts);

        tc.fakeNodes[nodeIx].requestPing(function() {
            cb(list);
        }, piggybackData, bodyOverrides);
    });
    f.callerName = 'sendPing';
    return f;
}

function waitForPingResponses(t, tc, nodeIxs) {
    return _.map(nodeIxs, function(ix) {
        return waitForPingResponse(t, tc, ix);
    });
}

function waitForPingResponse(t, tc, nodeIx) {
    return function waitForPingResponse(list, cb) {
        var pings = _.filter(list, {type: events.Types.Ping, direction: 'response'});
        pings = _.filter(pings, function(event) {
            return event.receiver === tc.fakeNodes[nodeIx].getHostPort();
        });

        if(pings.length === 0) {
            cb(null);
            return;
        }

        _.pullAt(list, _.indexOf(list, pings[0]));
        cb(list);
    };
}

function waitForJoinResponse(t, tc, nodeIx) {
    return function waitForJoinResponse(list, cb) {
        var joins = _.filter(list, {type: events.Types.Join, direction: 'response'});
        joins = _.filter(joins, function(event) {
            return event.receiver === tc.fakeNodes[nodeIx].getHostPort();
        });

        if(joins.length === 0) {
            cb(null);
            return;
        }

        _.pullAt(list, _.indexOf(list, joins[0]));
        cb(list);
    };
}

function sendPingReq(t, tc, nodeIx, targetIx, piggybackOpts) {
    var f = _.once(function sendPing(list, cb) {
        var piggybackData = piggyback(tc, piggybackOpts);
        var target = tc.fakeNodes[targetIx].getHostPort();
        tc.fakeNodes[nodeIx].requestPingReq(target, function() {
            cb(list);
        }, piggybackData);
    });
    f.callerName = 'sendPingReq';
    return f;
}

function waitForPingReqResponse(t, tc, nodeIx, targetIx, status) {
    return function waitForPingReqResponse(list, cb) {
        var pingReqs = _.filter(list, {type: events.Types.PingReq, direction: 'response'});
        pingReqs = _.filter(pingReqs, function(event) {
            return event.receiver === tc.fakeNodes[nodeIx].getHostPort();
        });

        if(pingReqs.length === 0) {
            cb(null);
            return;
        }

        // TODO(wieger): validate pingReqs[0]
        var arg3 = safeJSONParse(pingReqs[0].arg3);
        t.equal(arg3.target, tc.fakeNodes[targetIx].getHostPort(),
            'check target of the response',
            errDetails({"ping-req-response": arg3}));
        t.equal(arg3.pingStatus, status,
            'check target ping status of the response',
            errDetails({"ping-req-response": arg3}));

        _.pullAt(list, _.indexOf(list, pingReqs[0]));
        cb(list);
    };
}

// TODO(wieger): make general request for ping, pingreqs, join
// with a callback that manipulates the requested object
// function waitForResponse(t, tc, type, nodeIx, validateResponseCB) {}

// count is optional, when a number it will fail if there are pings

function expectOnlyPings(t, tc, count) {
    return function expectOnlyPings(list, cb) {
        var pings = _.filter(list, {type: events.Types.Ping, direction: 'request'});
        t.equal(pings.length, list.length,
            'check if all remaining events are Pings',
            errDetails({eventTypes:
                _.zip(_.pluck(list, 'type'), _.pluck(list, 'direction'))
            })
        );

        if (typeof count === 'number') {
            t.equal(pings.length, count, "Checking the number of pings", errDetails({
                pings: _.zip(
                    _.pluck(list, 'type'),
                    _.pluck(list, 'direction')
                )
            }));
        }

        cb(_.reject(list, {type: events.Types.Ping, direction: 'request'}));
    };
}

function expectOnlyPingsAndPingReqs(t, tc) {
    return function expectOnlyPingsAndPingReqs(list, cb) {
        var pings = _.filter(list, {type: events.Types.Ping, direction: 'request'});
        var pingReqs = _.filter(list, {type: events.Types.PingReq, direction: 'request'});
        t.equal(pings.length + pingReqs.length, list.length,
            'check if all remaining events are pings or ping-reqs',
            errDetails({eventTypes:
                _.zip(_.pluck(list, 'type'), _.pluck(list, 'direction'))
            })
        );

        var result = list;
        result = _.reject(result, {type: events.Types.Ping, direction: 'request'});
        result = _.reject(result, {type: events.Types.PingReq, direction: 'request'});
        cb(result);
    };
}

function consumePings(t, tc) {
    return consumeRequests(t, tc, events.Types.Ping);
}

function consumeRequests(t, tc, type) {
    return function consumeRequests(list, cb) {
        cb(_.reject(list, {type: type, direction: 'request'}));
    };
}

function callEndpoint(t, tc, endpoint, body, validateEvent) {
    return function callEndpoint(list, cb) {
        tc.callEndpoint(endpoint, body, function (event) {
            // optional validate the event
            if (validateEvent && typeof validateEvent === 'function') {
                validateEvent(event.body);
            }

            return cb(list);
        });
    };
}

function assertCorrectIncarnationNumbers(t, tc) {
    return [
        requestAdminStats(tc),
        waitForStatsAssertCorrectIncarnationNumbers(t, tc),
    ];
}

function waitForStatsAssertCorrectIncarnationNumbers(t, tc) {
    return function waitForStatsAssertCorrectIncarnationNumbers(list, cb) {
        var ix = _.findIndex(list, {type: events.Types.Stats});
        if (ix === -1) {
            cb(null);
            return;
        }

        var stats = safeJSONParse(list[ix].arg3);
        var statsMembers = stats.membership.members;
        tc.fakeNodes.forEach(function(fakeNode) {
            // find member i in statsMembers
            var ix = _.findIndex(statsMembers, {address: fakeNode.getHostPort()});
            t.equal(statsMembers[ix].incarnationNumber, fakeNode.incarnationNumber,
                'same incarnationNumber ' + fakeNode.incarnationNumber,
                errDetails({ expected: fakeNode.incarnationNumber, received: statsMembers[ix]}));
        });

        _.pullAt(list, ix);
        cb(list);
    };
}

function assertDetectChecksumMethod(t, tc) {
    return [
        requestAdminStats(tc),
        waitForStatsAssertDetectChecksumMethod(t, tc),
    ];
}

function waitForStatsAssertDetectChecksumMethod(t, tc) {
    return function waitForStatsAssertDetectChecksumMethod(list, cb) {
        var ix = _.findIndex(list, {type: events.Types.Stats});
        if (ix === -1) {
            cb(null);
            return;
        }

        var stats = safeJSONParse(list[ix].arg3);
        t.ok(stats, 'parse stats response');
        t.ok(stats.membership, 'get membership info');
        t.ok(stats.membership.members, 'membership info has members');
        t.ok(stats.membership.checksum, 'membership info has a checksum');
        var checksumMethod = detectChecksumMethod(stats.membership.members, stats.membership.checksum);
        t.ok(checksumMethod, 'checksum method detected');
        tc.checksum = checksumMethod;

        cb(_.reject(list, {type: events.Types.Stats}));
    };
}

// members = {ix: {expected_field: 'expected_value', ...}, ix2: {...}, ... }
function assertMembership(t, tc, members) {
    return [
        requestAdminStats(tc),
        waitForStatsAssertMembership(t, tc, members),
    ];
}

function waitForStatsAssertMembership(t, tc, members) {
    return function waitForStatsAssertMembership(list, cb) {
        var ix = _.findIndex(list, {type: events.Types.Stats});
        if (ix === -1) {
            cb(null);
            return;
        }

        var stats = safeJSONParse(list[ix].arg3);
        var statsMembers = stats.membership.members;
        _.forEach(members, function(member, i) {
            // find member i in statsMembers
            var ix = _.findIndex(statsMembers, {address: tc.fakeNodes[i].getHostPort()});
            var received = statsMembers[ix];

            if (typeof member === 'function') {
                // use the function to test the received member object
                t.ok(member(received), 'assert membership via closure: ' + (member.name||'<anonymous>'));
            } else {
                // test the received object to the expected object field by field
                var expected = member;
                _.forEach(member, function(value, field) {
                    t.deepEqual(statsMembers[ix][field], value, 'assert membership', errDetails({ expected: expected, received: received}));
                });
            }
        });

        _.pullAt(list, ix);
        cb(list);
    };
}

// t, tc, statusCounts, members
// t, tc, a, s, f, members
function assertStats(t, tc, statusCountsOralive, suspect, faulty, members) {
    var statusCounts;
    if (typeof statusCountsOralive === 'number') {
        statusCounts = {
            alive: statusCountsOralive,
            suspect: suspect,
            faulty: faulty,
        };
    } else {
        statusCounts = statusCountsOralive;
        members = suspect;
    }

    var result = [
        requestAdminStats(tc),
        waitForStatsAssertStatus(t, tc, statusCounts),
    ];

    if (members !== undefined) {
        result.push(assertMembership(t, tc, members));
    }

    return result;
}


function requestAdminStats(tc) {
    var f = _.once(function reuqestAdminStats(list, cb) {
        tc.getAdminStats(function(event) {
            cb(list);
        });
    });
    f.callerName = 'requestAdminStats';
    return f;
}

// iterate through all the statusses of actual and expected. Assert that the
// counts are the same. If a count is missing a count of 0 will be assumed.
function assertStatusCounts(t, actual, expected) {
    var keys = _.union(_.keys(actual), _.keys(expected));
    var failed = false;
    _.each(keys, function (status) {
        t.equal(actual[status] || 0, expected[status] || 0, 'check number of ' + status + ' nodes');
        failed |= (actual[status] || 0) !== (expected[status] || 0);
    });

    return !failed;
}

function waitForStatsAssertStatus(t, tc, statusCounts) {
    return function waitForStatsAssertStatus(list, cb) {
        var ix = _.findIndex(list, {type: events.Types.Stats});
        if (ix === -1) {
            cb(null);
            return;
        }

        var stats = safeJSONParse(list[ix].arg3);
        var members = stats.membership.members;

        var countedStatusses = _.countBy(members, 'status');

        if(!assertStatusCounts(t, countedStatusses, statusCounts)) {
            t.fail('full stats check', errDetails(members));
        }

        // check inc no of fakeNodes agains admin/stats
        tc.fakeNodes.forEach(function(fakeNode) {
            if (['alive','suspect','faulty'].indexOf(fakeNode.status) < 0) {
                return; // continue;
            }

            // find member i in members
            var memberIx = _.findIndex(members, {address: fakeNode.getHostPort()});
            // check memberIx != -1
            if(memberIx === -1) {
                t.fail('member not found in membership');
                return;
            }
            var member = members[memberIx];
            t.equal(member.incarnationNumber, fakeNode.incarnationNumber,
                'same incarnationNumber ' + fakeNode.incarnationNumber,
                errDetails({ expected: fakeNode.incarnationNumber, received: member}));
        });

        // check inc no of real-node against admin/stats
        var memberIx = _.findIndex(members, {address: tc.sutHostPort});

        var member = members[memberIx];
        t.equal(member.incarnationNumber, tc.test_state['sutIncarnationNumber'],
                'same incarnationNumber as sut ' + tc.test_state['sutIncarnationNumber'],
                errDetails({ expected: tc.test_state['sutIncarnationNumber'], received: member}));

        _.pullAt(list, ix);
        cb(list);
    };
}

function assertBumpedIncarnationNumber(t, tc) {
    return [
        requestAdminStats(tc),
        waitForStatsAssertBumpedIncarnationNumber(t, tc),
    ];
}

function waitForStatsAssertBumpedIncarnationNumber(t, tc) {
    return function waitForStatsAssertBumpedIncarnationNumber(list, cb) {
        var ix = _.findIndex(list, {type: events.Types.Stats});
        if (ix === -1) {
            cb(null);
            return;
        }

        var stats = safeJSONParse(list[ix].arg3);
        var members = stats.membership.members;
        var memberIx = _.findIndex(members, {address: tc.sutHostPort});
        var member = members[memberIx];
        t.true(member.incarnationNumber > tc.test_state['sutIncarnationNumber'],
            'sut bumped incarnation number to ' + member.incarnationNumber,
            errDetails({ old: tc.test_state['sutIncarnationNumber'], new: member.incarnationNumber}));
        tc.test_state['sutIncarnationNumber'] = member.incarnationNumber;

        _.pullAt(list, ix);
        cb(list);
    };
}

function assertRoundRobinPings(t, tc, pings, millis) {
    return [
        wait(millis),
        expectRoundRobinPings(t, tc, pings),
    ];
}

// imidiately checks for n-1, n or n+1 pings
function expectRoundRobinPings(t, tc, n) {
    return function expectRoundRobinPings(list, cb) {
        var pings = _.filter(list, {type: events.Types.Ping});
        pings = _.pluck(pings, "req.channel.hostPort");

        // expect ping every 200 ms
        if (pings.length  < n - 1 || pings.length > n + 1) {
            t.fail(util.format('not the right amount of Pings, got %d expected %d +/- 1', pings.length, n),
                errDetails({pings: pings}));
        } else {
            t.pass('check amount of pings received');
        }

        // check if pings are distributed evenly over the membership
        var hostPortFreqs = _.countBy(pings);
        var min = _.min(_.values(hostPortFreqs));
        var max = _.max(_.values(hostPortFreqs));
        t.ok(min == max || min + 1 == max,
            'pings distributed evenly',
            errDetails({hostPortFreqs: hostPortFreqs}));

        // check if pingrounds are randomized
        var rounds = _.chunk(pings, tc.fakeNodes.length);
        var sliceFreqs = _.countBy(rounds);
        t.ok(_.every(sliceFreqs, function(v, k) { return v === 1; }),
            'ping rounds should be randomized',
            errDetails({sliceFreqs: sliceFreqs}));

        cb(_.reject(list, {type: events.Types.Ping}));
    };
}

function disableNode(t, tc, ix) {
    var f = _.once(function(list, cb) {
        tc.fakeNodes[ix].shutdown();
        cb(list);
    });
    f.callerName = 'disableNode';
    return f;
}

function disableAllNodes(t, tc) {
    return function disableAllNodes(list, cb) {
        tc.fakeNodes.forEach(function (fn) {
            fn.shutdown();
        });
        cb(list);
    };
}

function disableAllNodesPing(t, tc) {
    return function disableAllNodesPing(list, cb) {
        tc.fakeNodes.forEach(function (fn) {
            fn.disable();
        });
        cb(list);
    };
}

function enableNode(t, tc, ix, incarnationNumber) {
    var f = _.once(function(list, cb) {
        tc.fakeNodes[ix].start();
        tc.fakeNodes[ix].incarnationNumber = incarnationNumber;
        cb(list);
    });
    f.callerName = 'enableNode';
    return f;
}

function createEventValidator(t) {
    var validator = new jsonschema.Validator();

    // load all json schema files and add them to the validator
    var schemaFiles = glob.sync("../schema/*.json",{cwd:__dirname});
    schemaFiles.forEach(function (schemaFile) {
        validator.addSchema(require(schemaFile));
    });

    function bodyVerification(name, schema) {
        return function verifyBodyForEvent(event, body) {
            var result = validator.validate(body, schema, { propertyName: name.replace(' ','-') });
            t.equals(result.errors.length, 0, "JSON Validation: " + name, errDetails({
                errors: _.pluck(result.errors, "stack"),
                body: body
            }));
        };
    }

    var validators = {
        request: {},
        response: {}
    };

    // /protocol/join
    validators.request[events.Types.Join] = bodyVerification("join request", "/JoinRequest");
    validators.response[events.Types.Join] = bodyVerification("join response", "/JoinResponse");

    // /protocol/ping
    validators.request[events.Types.Ping] = bodyVerification("ping request", "/PingRequest");
    validators.response[events.Types.Ping] = bodyVerification("ping response", "/PingResponse");

    // /protocol/ping-req
    validators.request[events.Types.PingReq] = bodyVerification("ping-req request", "/PingReqRequest");
    validators.response[events.Types.PingReq] = bodyVerification("ping-req response", "/PingReqResponse");

    // /admin/stats
    validators.response[events.Types.Stats] = bodyVerification("admin-status response", "/StatsResponse");

    // /admin/lookup
    validators.response[events.Types.AdminLookup] = bodyVerification("admin-lookup response", "/AdminLookupResponse");

    // TODO endpoints to specify and test
    // /admin/debugClear
    // /admin/debugSet
    // /admin/gossip
    // /admin/join
    // /admin/leave
    // /admin/tick

    return function validateIncomingEvent(event) {
        var type = event.type;
        var direction = event.direction;

        var validator = validators[direction][type];
        if (!validator) return; // nothing to test here

        validator(event, event.body);
    };
}

// validates a scheme on incoming events send by the real-node. A scheme is a
// collection of functions from ringpop-assert.js. On every incoming event we
// try to progress through the scheme further. When all the functions in the
// scheme have ran, the test is a success.
//
// A scheme is the list of functions passed by the caller. Every function in
// the list will be called like this:
// - fun(eventlist, callback)
//
// fun needs to verify if eventlist is what it is expecting to be. If it is,
// fun calls `cb(list)`, where list is a subset of the original list. The
// discarded items are no longer necessary in the test, so the other validation
// functions are called with the (possibly) reduced list. For example, a
// closure which checks for 3 ping requests finds three ping requests, removes
// them from the list, and calls the callback. If the callback is called with a
// list, the test will go on to the next closure.
//
// If the list is not complete, call `cb(null)`; then the fun will be called
// again when more elements are added to the list.
//
// Failures should be asserted in the ordinary way by using the tap object `t`.
function validate(t, tc, scheme, deadline) {
    var fns = scheme;
    var cursor = 0;
    var allEvents = [];
    var eventList = [];

    var timer = setTimeout(function() {
        t.fail('timeout');
        tc.removeAllListeners('event');
        tc.removeAllListeners('sut-died');
        tc.shutdown();
        t.end();
    }, deadline);

    tc.on('sut-died', function(code) {
        clearTimeout(timer);
        t.fail('SUT crashed (code: ' + code + ')');
        tc.removeAllListeners('event');
        tc.removeAllListeners('sut-died');
        tc.shutdown();
        t.end();
    });

    // flatten so arrays gets expanded and fns becomes one-dimensional
    fns = _.flatten(fns, true);

    // try to run the fn that the cursor points to. The function indicates that it has
    // succeeded by yielding an updated eventList. If succeeded the cursor progresses
    // to the next function.
    var inProgress = false;
    var progressFromCursor = function() {
        if (inProgress) return;
        inProgress = true;

        if(cursor >= fns.length) {
            progressionComplete();

            inProgress = false;
            return;
        }

        if(!fns[cursor].isPrinted) {
            fns[cursor].isPrinted = true;
            var name = fns[cursor].name || fns[cursor].callerName;
            console.log('* starting ' + name);
        }

        fns[cursor](eventList, function(result) {
            if (result === null) {
                //wait for more events
                inProgress = false;
                return;
            }

            eventList = result;
            cursor++;

            inProgress = false;
            progressFromCursor(true);
        });
    };

    tc.on('event', function(event) {
        eventList.push(event);
        allEvents.push(event);
        progressFromCursor();
    });

    function progressionComplete() {
        clearTimeout(timer);
        t.ok(true, 'validate done: all functions passed');
        tc.shutdown();
        tc.removeAllListeners('event');
        tc.removeAllListeners('sut-died');

        /* Validate all events */
        var jsonValidator = createEventValidator(t);
        _.each(allEvents, jsonValidator);

        t.end();
    }
}

var uuid = require('node-uuid');

// example opts = {
//    sourceIx: 0,
//    subjectIx: 1,
//    status: 'alive',
//    id: 'abcd-1234',
//    sourceIncNoDelta: 1,
//    subjectIncNoDelta: 1,
//    tombstone: false,
// }
function piggyback(tc, opts) {
    if (opts === undefined) {
        return undefined;
    }
    update = {};
    update.id = opts.id || uuid.v4();
    update.status = opts.status;
    update.tombstone = opts.tombstone || false;

    // copy labels to the piggybacked ping when present
    if (opts.labels) {
        update.labels = opts.labels;
    }

    if(opts.sourceIx === 'sut') {
        update.source = tc.sutHostPort;
        update.sourceIncarnationNumber = tc.test_state['sutIncarnationNumber'];
    } else {
        update.source = tc.fakeNodes[opts.sourceIx].getHostPort();
        update.sourceIncarnationNumber = tc.fakeNodes[opts.sourceIx].incarnationNumber;
    }

    if (opts.sourceIncNoDetla !== undefined) {
        update.sourceIncarnationNumber += opts.sourceIncNoDelta;
    }

    if(opts.subjectIx === 'sut') {
        update.address = tc.sutHostPort;
        update.incarnationNumber = tc.test_state['sutIncarnationNumber'];
    } else if(opts.subjectIx === 'new') {
        // address from test network
        update.address = "192.0.2.0:1234";
        update.incarnationNumber = 42;
    } else {
        update.address = tc.fakeNodes[opts.subjectIx].getHostPort();
        update.incarnationNumber = tc.fakeNodes[opts.subjectIx].incarnationNumber;
    }

    if(opts.subjectIncNoDelta !== undefined) {
        update.incarnationNumber += opts.subjectIncNoDelta;
        if(opts.subjectIncNoDelta > 0) {
            tc.fakeNodes[opts.subjectIx].incarnationNumber += opts.subjectIncNoDelta;
        }
    }

    return update;
}


module.exports = {
    validate: validate,
    wait: wait,

    waitForJoins: waitForJoins,
    waitForPingReqs: waitForPingReqs,
    waitForPing: waitForPing,

    // waitForEmptyPing is slow. If possible, use drainDisseminator instead.
    drainDisseminator: drainDisseminator,

    validateEventBody: validateEventBody,

    callEndpoint: callEndpoint,
    consumePings: consumePings,
    consumeRequests: consumeRequests,

    sendJoin: sendJoin,
    sendPing: sendPing,
    sendPingReq: sendPingReq,

    expectOnlyPings: expectOnlyPings,
    expectOnlyPingsAndPingReqs: expectOnlyPingsAndPingReqs,

    assertRoundRobinPings: assertRoundRobinPings,
    assertStats: assertStats,
    assertMembership: assertMembership,
    assertCorrectIncarnationNumbers: assertCorrectIncarnationNumbers,
    assertBumpedIncarnationNumber: assertBumpedIncarnationNumber,

    disableNode: disableNode,
    disableAllNodes: disableAllNodes,
    disableAllNodesPing: disableAllNodesPing,
    enableNode: enableNode,

    changeStatus: changeStatus,
    sendPings: sendPings,
    waitForPingResponse: waitForPingResponse,
    waitForPingResponses: waitForPingResponses,

    addFakeNode: addFakeNode,
    joinNewNode: joinNewNode,
    removeFakeNode: removeFakeNode,
    waitForJoinResponse: waitForJoinResponse,

    waitForPingReqResponse: waitForPingReqResponse,

    piggyback: piggyback,

    assertDetectChecksumMethod: assertDetectChecksumMethod,
};
