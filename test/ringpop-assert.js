var _ = require('lodash');
var events = require('./events');
var safeJSONParse = require('./util').safeParse;
var util = require('util');
var makeHostPort = require('./util').makeHostPort;

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

        //XXX: a bit wonky to get sutIncarnationNumber like this
        tc.sutIncarnationNumber = safeJSONParse(list[0].arg3).incarnationNumber;
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
    }
}

function joinNewNode(t, tc, nodeIx) {
    return [
        addFakeNode(t, tc),
        sendJoin(t, tc, nodeIx),
    ];
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

function sendPing(t, tc, nodeIx, piggybackOpts) {
    var f = _.once(function sendPing(list, cb) {
        var piggybackData = piggyback(tc, piggybackOpts);
        
        tc.fakeNodes[nodeIx].requestPing(function() {
            cb(list);
        }, piggybackData);
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

        t.ok(arg3.changes, "check presence of changes in pingReq response");
        arg3.changes.forEach(verifyChange.bind(null, t, tc));

        _.pullAt(list, _.indexOf(list, pingReqs[0]));
        cb(list);
    }
}

// TODO(wieger): make general request for ping, pingreqs, join
// with a callback that manipulates the requested object
// function waitForResponse(t, tc, type, nodeIx, validateResponseCB) {}

function expectOnlyPings(t, tc) {
    return function expectOnlyPings(list, cb) {
        var pings = _.filter(list, {type: events.Types.Ping, direction: 'request'});
        t.equal(pings.length, list.length, 
            'check if all remaining events are Pings',
            errDetails({eventTypes: 
                _.zip(_.pluck(list, 'type'), _.pluck(list, 'direction'))
            })
        );

        cb(_.reject(list, {type: events.Types.Ping, direction: 'request'}));
    }
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

        var result = list
        result = _.reject(result, {type: events.Types.Ping, direction: 'request'});
        result = _.reject(result, {type: events.Types.PingReq, direction: 'request'});
        cb(result);
    }
}


// function assertUpToDateIncarnationNumbers(t, tc) {
//     return [
//         requestAdminStats(tc),
//         waitForStatsCheckIncarnationNumbers(t, tc),
//     ];
// }

// function waitForStatsCheckIncarnationNumber(t, tc) {
//     return function waitForStatsCheckIncarnationNumber(list, cb) {
//         var ix = _.findIndex(list, {type: events.Types.Stats});
//         if (ix === -1) {
//             cb(null);
//             return;
//         }

//         var stats = safeJSONParse(list[ix].arg3);
//         var members = stats.membership.members;

//         members.forEach(function(member) {
//             var found = false;
//             tc.fakeNodes.forEach(function(fakeNode)) {
//                 if (member.address === fakeNode.getHostPort()) {
//                     found = true;

//                 }
//             }
//             if (!found) {
//                 f.fail('member not found in fake nodes', errDetails(members));
//                 return;
//             }
//         });
        
//         _.pullAt(list, ix);
//         cb(list);
//     }
// }

function assertStats(t, tc, a, s, f) {
    return [
        requestAdminStats(tc),
        waitForStatsCheckStatus(t, tc, a, s, f),
    ];
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

function waitForStatsCheckStatus(t, tc, alive, suspect, faulty) {
    return function waitForStatsCheckStatus(list, cb) {
        var ix = _.findIndex(list, {type: events.Types.Stats});
        if (ix === -1) {
            cb(null);
            return;
        }

        var stats = safeJSONParse(list[ix].arg3);
        var members = stats.membership.members;
        var a = _.filter(members, {status: 'alive'}).length;
        var s = _.filter(members, {status: 'suspect'}).length;
        var f = _.filter(members, {status: 'faulty'}).length;

        t.equal(a, alive, 'check number of alive nodes');
        t.equal(s, suspect, 'check number of suspect nodes');
        t.equal(f, faulty, 'check number of faulty nodes');
        if(a !== alive || s !== suspect || f !== faulty) {
            t.fail('full stats check', errDetails(members));
        }

        _.pullAt(list, ix);
        cb(list);
    }
}

function assertRoundRobinPings(t, tc, pings, millis) {
    return [
        wait(millis),
        expectRoundRobinPings(t, tc, pings)
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
    }
}

function disableNode(t, tc, ix) {
    var f = _.once(function(list, cb) {
        tc.fakeNodes[ix].shutdown();
        cb(list);
    });
    f.callerName = 'disableNode';
    return f;
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

function createValidateEvent(t, tc) {
    var validators = {
        'request': {},
        'response': {}
    };

    var Validator = require('jsonschema').Validator;
    var validator = new Validator();

    // /Change
    validator.addSchema({
        id: "/Change",
        title: "Change",
        type: "object",
        properties: {
            address: { type: "string" },
            status: { type: "string" },
            incarnationNumber: { type: "number" },
            source: { type: "string" },

            id: { type: "string" },
            sourceIncarnationNumber: { type: "number" },

            timestamp: { type: "number" }
        },
        required: [
            "address",
            "status",
            "incarnationNumber",
            "source"
        ],
        additionalProperties: false
    });

    // /JoinRequest
    validator.addSchema({
        id: "/JoinRequest",
        title: "Join Request",
        type: "object",
        properties: {
            app: { type: "string" },
            source: { type: "string" },
            incarnationNumber: { type: "number" },
            timeout: { type: "number" }
        },
        required: [
            "app",
            "source",
            "incarnationNumber"
        ],
        additionalProperties: false
    });

    // /JoinResponse
    validator.addSchema({
        id: "/JoinResponse",
        title: "Join Response",
        type: "object",
        properties: {
            app: { type: "string" },
            coordinator: { type: "string" },
            membership: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        source: { type: "string" },
                        address: { type: "string" },
                        status: { type: "string" },
                        incarnationNumber: { type: "number" },

                        timestamp: { type: "number" },
                        sourceIncarnationNumber: { type: "number" }
                    },
                    required: [
                        "source",
                        "address",
                        "status",
                        "incarnationNumber"
                    ],
                    additionalProperties: false
                }
            },
            membershipChecksum: { type: "number" }
        },
        required: [
            "app",
            "coordinator",
            "membership",
            "membershipChecksum"
        ],
        additionalProperties: false
    });

    // /PingRequest
    validator.addSchema({
        id: "/PingRequest",
        title: "Ping Request",
        type: "object",
        properties: {
            checksum: { type: "number" },
            changes: {
                type: "array",
                items: {
                    $ref: "/Change"
                }
            },
            source: { type: "string" },
            sourceIncarnationNumber: { type: "number" }
        },
        required: [
            "checksum",
            "changes",
            "source",
            "sourceIncarnationNumber"
        ],
        additionalProperties: false
    });

    // /PingResponse
    validator.addSchema({
        id: "/PingResponse",
        title: "Ping Response",
        type: "object",
        properties: {
            changes: {
                type: "array",
                items: {
                    $ref: "/Change"
                }
            }
        },
        required: [
            "changes",
        ],
        additionalProperties: false
    });

    // /PingReqRequest
    validator.addSchema({
        id: "/PingReqRequest",
        title: "PingReq Request",
        type: "object",
        properties: {
            checksum: { type: "number" },
            changes: {
                type: "array",
                items: {
                    $ref: "/Change"
                }
            },
            source: { type: "string" },
            sourceIncarnationNumber: { type: "number" },
            target: { type: "string" }
        },
        required: [
            "checksum",
            "changes",
            "source",
            "sourceIncarnationNumber",
            "target"
        ],
        additionalProperties: false
    });

    function bodyVerification(name, schema) {
        return function (event, body) {
            var result = validator.validate(body, schema, { propertyName: name.replace(' ','-') });
            if (result.errors.length > 0) {
                t.fail(name, errDetails({
                    errors: _.pluck(result.errors, "stack"),
                    body: body
                }));
            }
        };
    }

    validators.request[events.Types.Join] = bodyVerification("join request", "/JoinRequest");
    validators.response[events.Types.Join] = bodyVerification("join response", "/JoinResponse");

    validators.request[events.Types.Ping] = bodyVerification("ping request", "/PingRequest");
    validators.response[events.Types.Ping] = bodyVerification("ping response", "/PingResponse");

    validators.request[events.Types.PingReq] = bodyVerification("ping-req request", "/PingReqRequest");

    return function (event) {
        var type = event.type;
        var direction = event.direction;


        var validator = validators[direction][type];
        if (!validator) return; // nothing to test here

        validator(event, safeJSONParse(event.arg3));
    }; 
}

// validates a scheme on incoming events send by the real-node. A scheme is a collection of
// functions from scheme.js. On every incoming event we try to progress through the scheme. 
// further. When all the functions in the scheme have ran, the test is a success.
function validate(t, tc, scheme, deadline) {
    var fns = scheme;
    var cursor = 0;
    var eventList = [];

    tc.on('event', createValidateEvent(t, tc));

    timer = setTimeout(function() {
        t.fail('timeout');
        tc.removeAllListeners('event');
        tc.shutdown();
        t.end();
    }, deadline);

    // flatten so arrays gets expanded and fns becomes one-dimensional
    fns = _.flatten(fns, true);

    // try to run the fn that the cursor points to. The function indicates that it has
    // succeeded by yielding an updated eventList. If succeeded the cursor progresses 
    // to the next function.
    var progressFromCursor = function() {
        if(cursor >= fns.length) {
            clearTimeout(timer);
            t.ok(true, 'validate done: all functions passed');
            tc.shutdown();
            tc.removeAllListeners('event');
            t.end();
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
                return;
            }
            
            eventList = result;
            cursor++;
            progressFromCursor(true);
        });
    }

    tc.on('event', function(event) {
        eventList.push(event);
        progressFromCursor();
    });
}

var uuid = require('node-uuid');

// function piggyback(tc, sourceIx, subjectIx, status, id) {
//     return function() {
//         update = {};
//         update.id = id || uuid.v4();
       
//         if(sourceIx === 'sut') { 
//             update.source = tc.sutHostPort;
//             update.sourceIncarnationNumber = 99999999;
//         } else {
//             update.source = tc.fakeNodes[sourceIx].getHostPort();    
//             update.sourceIncarnationNumber = tc.fakeNodes[sourceIx].incarnationNumber;
//         }

//         if(subjectIx === 'sut') {
//             update.address = tc.sutHostPort;
//             update.sourceIncarnationNumber = 99999999;
//         } else {
//             update.address = tc.fakeNodes[subjectIx].getHostPort();
//             update.incarnationNumber = tc.fakeNodes[subjectIx].incarnationNumber;
//         }
        
//         update.status = status;

//         console.log(update);
//         return update;
//     }
// }

// example opts = {
//    sourceIx: 0,
//    subjectIx: 1,
//    status: 'alive',
//    id: 'abcd-1234',
//    sourceIncNoDelta: 1,
//    subjectIncNoDelta: 1,
// }
function piggyback(tc, opts) { 
    if (opts === undefined) {
        return undefined;
    }
    update = {};
    update.id = opts.id || uuid.v4();
    update.status = opts.status;
    
    if(opts.sourceIx === 'sut') { 
        update.source = tc.sutHostPort;
        update.sourceIncarnationNumber = tc.sutIncarnationNumber;
    } else {
        update.source = tc.fakeNodes[opts.sourceIx].getHostPort();    
        update.sourceIncarnationNumber = tc.fakeNodes[opts.sourceIx].incarnationNumber;
    }

    if (opts.sourceIncNoDetla !== undefined) {
        update.sourceIncarnationNumber += opts.sourceIncNoDelta;
    }

    if(opts.subjectIx === 'sut') {
        update.address = tc.sutHostPort;
        update.sourceIncarnationNumber = tc.sutIncarnationNumber;
    } else {
        update.address = tc.fakeNodes[opts.subjectIx].getHostPort();
        update.incarnationNumber = tc.fakeNodes[opts.subjectIx].incarnationNumber;
    }

    if(opts.subjectIncNoDelta !== undefined) {
        update.incarnationNumber += opts.subjectIncNoDelta;
    }

    return update;
}


module.exports = {
    validate: validate,
    wait: wait,
    
    waitForJoins: waitForJoins,
    waitForPingReqs: waitForPingReqs,
    
    sendJoin: sendJoin,
    sendPing: sendPing,
    sendPingReq: sendPingReq,
    
    expectOnlyPings: expectOnlyPings,
    expectOnlyPingsAndPingReqs: expectOnlyPingsAndPingReqs,
    
    assertRoundRobinPings: assertRoundRobinPings,
    assertStats: assertStats,
    
    disableNode: disableNode,
    enableNode: enableNode,

    sendPings: sendPings,
    waitForPingResponse: waitForPingResponse,
    waitForPingResponses: waitForPingResponses,

    addFakeNode: addFakeNode,
    joinNewNode: joinNewNode,
    waitForJoinResponse: waitForJoinResponse,

    waitForPingReqResponse: waitForPingReqResponse,

    piggyback: piggyback,
};
