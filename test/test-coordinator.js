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
        throw new Error('Test program ' + options.program + ' does not exist.')
    }
}

function TestCoordinator(options) {
    validateSetupOptions(options);

    var portBase = options.portBase || 0;

    this.fakeNodes = [];
    this.sutHostPort = makeHostPort('127.0.0.1', portBase || _.random(10000, 30000));
    this.sutProgram = options.sut.program;
    this.sutInterpreter = options.sut.interpreter;
    this.sutProc = undefined;
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
        this.createFakeNode(portBase ? portBase + i + 1 : 0);
    }
}

require('util').inherits(TestCoordinator, events.EventEmitter);

TestCoordinator.prototype.createFakeNode = function createFakeNode(port) {
    var node = new FakeNode({
        coordinator: this,
        host: '127.0.0.1',
        port: port,
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

TestCoordinator.prototype.start = function start() {
    var self = this;

    self.startAllFakeNodes(function onFakeNodesUp() {
        self.createHostsFile();
        self.startSUT();
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
        console.log('Error: ' + err.message + ', failed to spawn ' +  self.sutProgram + ' on ' + self.sutHostPort);
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

TestCoordinator.prototype.getMembership = function getMembership() {
    return this.getFakeNodes().map(function(node) {
        return node.toMemberInfo();
    });
}

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
}

module.exports = TestCoordinator;
