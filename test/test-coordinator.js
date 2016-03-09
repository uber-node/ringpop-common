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

var fs = require('fs');
var async = require('async');
var childProc = require('child_process');
var logMsg = require('./util').logMsg;
var FakeNode = require('./fake-node');
var TChannel = require('tchannel');
var util = require('util');
var makeHostPort = require('./util').makeHostPort;
var _ = require('underscore');
var safeJSONParse = require('./util').safeParse;
var events = require('events');
var nodeEvents = require('./events');
var nodeToMemberInfo = require('./fake-node').nodeToMemberInfo;
var farmhash = require('farmhash');

function validateSetupOptions(options) {
    if (!options.sut) {
        throw new Error('No SUT options ("sut" field) specified');
    }

    if (!options.sut.program) {
        throw new Error('Test program not specified');
    }

    if (options.numNodes === undefined) {
        throw new Error('Must specify a number of fake nodes');
    }

    if (!fs.existsSync(options.sut.program)) {
        throw new Error('Test program ' + options.program + ' does not exist.');
    }
}



function TestCoordinator(options) {
    validateSetupOptions(options);

    this.extraMembers = [];

    this.replicaPoints = 100; // default from node implementation

    this.fakeNodes = [];
    this.sutHostPort = makeHostPort('127.0.0.1', _.random(10000, 30000));
    this.sutProgram = options.sut.program;
    this.sutInterpreter = options.sut.interpreter;
    this.sutProc = undefined;
    this.sutIncarnationNumber = undefined;
    this.hostsFile = '/tmp/ringpop-integration-test-hosts.json';

    this.adminChannel = new TChannel().makeSubChannel({
        serviceName: 'ringpop',
        peers: [this.sutHostPort],
        requestDefaults: {
            headers: {
                'as': 'raw',
                'cn': 'ringpop-integration-test'
            },
            timeout: 4000,
            hasNoParent: true
        }
    });

    for (var i = 0; i < options.numNodes; i++) {
        this.createFakeNode();
    }
}

require('util').inherits(TestCoordinator, events.EventEmitter);

TestCoordinator.prototype.lookup = function(key) {
    var self = this;

    var matchingNode;
    var matchingHash;

    var hash = farmhash.fingerprint32(key);

    function isBetterMatch(newHash) {
        if (!matchingNode) return true; // 1 node is better than no node

        if (hash <= newHash && newHash < matchingHash) return true; // new hash is closer to the current best match
        if (matchingHash <= hash && hash <= newHash) return true; // the matchingHash wraps around, and new hash is a better match to hash

        return false;
    }

    var hostPorts = this.fakeNodes.map(function (fn) {
        return fn.getHostPort();
    });
    hostPorts.push(this.sutHostPort);

    // iterate over all hosts
    hostPorts.forEach(function (hostPort) {
        // iterate over all vnodes for that host
        for (var i=0; i<self.replicaPoints; i++) {
            var currentHash = farmhash.fingerprint32(hostPort + i);

            if (isBetterMatch(currentHash)) {
                matchingNode = hostPort;
                matchingHash = currentHash;
            }
        }
    });

    console.log("hash:", hash, "matchingHash:", matchingHash);

    return matchingNode;
};

TestCoordinator.prototype.createFakeNode = function createFakeNode() {
    // Uses random ephemeral port
    var node = new FakeNode({
        coordinator: this,
        host: '127.0.0.1'
    });

    this.fakeNodes.push(node);
    return node;
};

TestCoordinator.prototype.startAllFakeNodes = function startAllFakeNodes(callback) {
    var self = this;

    async.each(self.fakeNodes, function startNode(node, nodeStarted) {
        node.start(nodeStarted);
    }, callback);
};

TestCoordinator.prototype.start = function start(callback) {
    var self = this;
    callback = callback || function(){};

    self.startAllFakeNodes(function onFakeNodesUp() {
        self.createHostsFile();
        self.startSUT();
        callback();
    });
};

TestCoordinator.prototype.startSUT = function startSUT() {
    var self = this;
    var newProc;
    var hostsFileArg = util.format('--hosts=%s', this.hostsFile);
    var listenArg = util.format('--listen=%s', this.sutHostPort);
    console.log(this.sutProgram, listenArg, hostsFileArg);
    if (this.sutInterpreter) {
        newProc = childProc.spawn(this.sutInterpreter, [this.sutProgram, listenArg, hostsFileArg]);
    } else {
        newProc = childProc.spawn(this.sutProgram, [listenArg, hostsFileArg]);
    }

    newProc.on('error', function(err) {
        console.error('Error: ' + err.message + ', failed to spawn ' +  self.sutProgram + ' on ' + self.sutHostPort);
    });

    var who = util.format('sut:%s', this.sutHostPort);
    function logOutput(data) {
        var lines = data.toString('utf8').split('\n');

        var totalOpenBraces = 0;
        var totalCloseBraces = 0;
        var output = '';

        lines.forEach(function (line) {
            if (line.length === 0) {
                return;
            }

            var matchedOpenBraces = line.match(/{/g);
            var matchedCloseBraces = line.match(/}/g);

            totalOpenBraces += matchedOpenBraces && matchedOpenBraces.length || 0;
            totalCloseBraces += matchedCloseBraces && matchedCloseBraces.length || 0;

            output += line.replace(/^\s+/g, ' ');

            if (totalOpenBraces === totalCloseBraces) {
                logMsg(who, output);
                output = '';
                totalOpenBraces = 0;
                totalCloseBraces = 0;
            }
        });
    }

    newProc.stdout.on('data', function() {});
    newProc.stderr.on('data', logOutput);

    this.sutProc = newProc;
};

TestCoordinator.prototype.getAdminStats = function getAdminStats(callback) {
    var self = this;

    self.adminChannel.request({serviceName: 'ringpop'}).send('/admin/stats', null, null,
        function(err, res, arg2, arg3) {
            if (err) {
                console.log("GET ADMIN STATS ERROR", err, res);
                return;
            }

            var event = new nodeEvents.ResponseEvent(res, arg2, arg3);
            callback(event);
            self.emit('event', event);
        }
    );
};

TestCoordinator.prototype.callEndpoint = function callEndpoint(endpoint, body, callback) {
    var self = this;

    self.adminChannel.request({serviceName: 'ringpop'}).send(endpoint, null, (typeof body === 'object')?JSON.stringify(body):body,
        function(err, res, arg2, arg3) {
            if (err) {
                console.log("CALL ENDPOINT ERROR", err, res);
                return;
            }

            var event = new nodeEvents.ResponseEvent(res, arg2, arg3);
            callback(event);
            self.emit('event', event);
        }
    );
};

TestCoordinator.prototype.getMembership = function getMembership() {
    return this.getFakeNodes().map(function(node) {
        return node.toMemberInfo();
    }).concat(this.extraMembers);
};

TestCoordinator.prototype.addMembershipInformation = function(address, status, incarnationNumber) {
    var parts = address.split(':', 2);
    var host = parts[0];
    var port = parts[1];

    this.extraMembers.push({
        host: host,
        port: port,
        status: status,
        incarnationNumber: incarnationNumber,
    });
};

TestCoordinator.prototype.shutdown = function shutdown() {
    if(this.adminChannel.topChannel.destroyed === false) {
        this.adminChannel.topChannel.close();
    }
    this.sutProc.kill();
    this.fakeNodes.forEach(function shutdownNode(node) {
        node.shutdown();
    });
};

TestCoordinator.prototype.getFakeNodeHostPortList = function getFakeNodeHostPortList() {
    return this.fakeNodes.map(function toHostPort(node) {
        return node.getHostPort();
    });
};

// All fake nodes and SUT
TestCoordinator.prototype.getStandardHostPortList = function getStandardHostPortList() {
    var result = this.getFakeNodeHostPortList();
    result.push(this.sutHostPort);
    return result;
};

TestCoordinator.prototype.createHostsFile = function createHostsFile(hostPortList) {
    if (!hostPortList) {
        hostPortList = this.getStandardHostPortList();
    }
    fs.writeFileSync(this.hostsFile, JSON.stringify(hostPortList));
};

TestCoordinator.prototype.getFakeNodes = function getFakeNodes() {
    return this.fakeNodes;
};

TestCoordinator.prototype.getSUTHostPort = function getSUTHostPort() {
    return this.sutHostPort;
};

module.exports = TestCoordinator;
