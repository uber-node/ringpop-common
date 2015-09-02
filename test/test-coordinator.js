var fs = require('fs');
var async = require('async');
var childProc = require('child_process');
//var logMsg = require('../util').logMsg;
var FakeNode = require('./fake-node');
var TChannel = require('tchannel');
var Journal = require('./journal');
var util = require('util');
var makeHostPort = require('../util').makeHostPort;
var _ = require('underscore');
var safeJSONParse = require('../util').safeParse;

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

	this.fakeNodes = [];
    this.sutHostPort = makeHostPort('127.0.0.1', _.random(10000, 30000))
    this.sutProgram = options.sut.program;
    this.sutInterpreter = options.sut.interpreter;
	this.sutProc = undefined;
	this.journal = new Journal();
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

TestCoordinator.prototype.checkJournal = function checkJournal(n, timeout, check) {
    // check if journal has n elements
    var timeoutTimer = setTimeout(function() {
        t.fail("test timed out");
    }, timeout);

    var self = this;
    // if timout is reached, test fails
    var interval = setInterval(function() {
        if(self.journal.length >= n) {
            clearTimeout(timeoutTimer);
            check();
            clearInterval(interval);
        }
    }, 20);
};

// A lot of work to be done in here.
////////////////////////////////////////////////////////

// The function array fns contains functions that check the journal for a certain condition
// if the condition is met, the function returns true indicating that it's done. The functions
// are run one by one sequentually. When all the functions are run and have returned true, the
// test is at an end and the callback is called 
function checkJournal(t, timeout, fns, cb) {
    var timer = setTimeout(function() {
        t.fail('Timeout');
    }, timeout);

    var i = 0;
    var interval = setInterval(function() {
        if(fns[i](journal) !== false) {
            return;
        }
        
        i++;
        if(i >= fns.length) {
            // test succes
            clearTimout(timer);
            clearInterval(interval);
            cb();
            return;
        }
    }, 20);
};
/////////////////////////////////////////////////////////////


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

TestCoordinator.prototype.getJournal = function getJournal() {
    return this.journal;
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
    var listenArg = util.format('--listen=%s', this.sutHostPort)

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
               // logMsg(who, output);
                output = '';
                totalOpenBraces = 0;
                totalCloseBraces = 0;
            }
        });
    }

    newProc.stdout.on('data', logOutput);
    newProc.stderr.on('data', logOutput);

    this.sutProc = newProc;
};

TestCoordinator.prototype.getAdminStats = function getAdminStats(callback) {
    var self = this;

    self.adminChannel.request({serviceName: 'ringpop'}).send('/admin/stats', null, null,
        function(err, res, arg2, arg3) {
            return callback(err, safeJSONParse(arg3));
        }
    );
};

TestCoordinator.prototype.shutdown = function shutdown() {
    this.adminChannel.topChannel.close();
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

TestCoordinator.prototype.waitForEvent = function waitForEvent(options, callback) {
    var type = options.type;
    var deadline = options.deadline;

    this.journal.waitForEvent(type, deadline, callback);
};

TestCoordinator.prototype.getFakeNodes = function getFakeNodes() {
    return this.fakeNodes;
};

TestCoordinator.prototype.getSUTHostPort = function getSUTHostPort() {
    return this.sutHostPort;
}

module.exports = TestCoordinator;