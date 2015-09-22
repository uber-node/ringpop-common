var TChannel = require('tchannel');
var safeParse = require('./util').safeParse;
var makeHostPort = require('./util').makeHostPort;
var handleJoin = require('./protocol-join').handleJoin;
var handlePing = require('./protocol-ping').handlePing;
var handlePingReq = require('./protocol-ping-req').handlePingReq;
var events = require('./events');
var checksum = require('./membership-checksum').checksum;

function FakeNode(options) {
    this.coordinator = options.coordinator;
    this.host = options.host;
    this.port = undefined; // set at listen time
    this.incarnationNumber = 1337;
    
    this.tchannel = undefined;
    this.channel = undefined;

    this.endpoints = {};
    this.enableEndpoints();
}

FakeNode.prototype.enableEndpoints = function enableEndpoints() {
    this.endpoints[events.Types.Join] = {
        path: '/protocol/join',
        handler: this.joinHandler.bind(this)
    };
    this.endpoints[events.Types.Ping] = {
        path: '/protocol/ping',
        handler: this.pingHandler.bind(this)
    };
    this.endpoints[events.Types.PingReq] = {
        path: '/protocol/ping-req',
        handler: this.pingReqHandler.bind(this)
    };
    this.endpoints[events.Types.ProxyReq] = {
        path: '/proxy/req',
        handler: this.proxyReqHandler.bind(this)
    };    
}

FakeNode.prototype.start = function start(callback) {
    var self = this;
    self.enabled = true;
    self.tchannel = new TChannel();
    self.channel = this.tchannel.makeSubChannel({
        serviceName: 'ringpop'
    });

    self._registerEndpoints();

    callback = callback || function() {};
    var port = self.port || 0;
    self.channel.listen(port, self.host, function onListen() {
        self.port = self.channel.address().port;
        return callback();
    });
};

FakeNode.prototype.getHostPort = function getHostPort() {
    return makeHostPort(this.host, this.port);
};

FakeNode.prototype._registerEndpoints = function _registerEndpoints() {
    var self = this;

    Object.keys(self.endpoints).forEach(function register(endpointType) {
        var path = self.endpoints[endpointType].path;

        self.channel.register(path, function handleRequest(req, res, arg2, arg3) {
            var event = new events.RequestEvent(req, arg2, arg3);
            self.coordinator.emit('event', event);
            self.endpoints[endpointType].handler(req, res, arg2, arg3);
        });
    });
};

FakeNode.prototype.shutdown = function shutdown() {
    this.enabled = false;
    if(this.channel.destroyed === false) {
        this.tchannel.close();
    }
};

FakeNode.prototype.toMemberInfo = function toMemberInfo() {
    return {
        host: this.host,
        port: this.port,
        status: 'alive',
        incarnationNumber: this.incarnationNumber,
    }
}

FakeNode.prototype.changeEndpoint = function modifyEndpoint(endpoint, handler) {
    this.endpoints[endpoint].handler = handler;
}

FakeNode.prototype.joinHandler = function joinHandler(req, res, arg2, arg3) {
    var membership = this.coordinator.getMembership(); 
    return handleJoin(req, res, this.toMemberInfo(), membership);
};

FakeNode.prototype.pingHandler = function pingHandler(req, res, arg2, arg3) {
    return handlePing(res);
};

FakeNode.prototype.pingReqHandler = function pingReqHandler(req, res, arg2, arg3) {
    // is the target alive?
    var target = safeParse(arg3).target;
    var status = true;
    this.coordinator.fakeNodes.forEach(function (node) {
        if (require('util').format('%s:%s', node.host, node.port) === target) {
            status = node.enabled;
        }
    });

    return handlePingReq(req, res, status);
};

FakeNode.prototype.requestJoin = function requestJoin(callback) {
    var self = this;

    var body = JSON.stringify({
        app: 'ringpop',
        source: self.getHostPort(),
        incarnationNumber: self.incarnationNumber,
    });

    self.channel.waitForIdentified({
        host: self.coordinator.sutHostPort
    }, function onIdentified(err) {
        if (err) {
            callback(err);
            return;
        }

        self.channel.request({
            serviceName: 'ringpop',
            host: self.coordinator.sutHostPort,
            timeout: 10000,
            hasNoParent: true,
            trace: false,
            headers: {
                'as': 'raw',
                'cn': 'ringpop'
            }
        }).send('/protocol/join', null, body,
            function(err, res, arg2, arg3) {
                if (err) {
                    console.log("TChannel Response Error", err, res);
                    callback();
                    return;
                }

                var event = new events.ResponseEvent(res, arg2, arg3, self.getHostPort());
                callback();
                self.coordinator.emit('event', event);
            }
        );

    });
}

FakeNode.prototype.requestPing = function requestPing(callback, piggybackData) {
    var self = this;

    var changes = [];
    if (piggybackData !== undefined) {
        changes.push(piggybackData);
    }

    var body = JSON.stringify({
        source: self.getHostPort(),
        checksum: checksum(self.coordinator.getMembership()),
        changes: changes,
        sourceIncarnationNumber: self.incarnationNumber,
    });

    
    self.channel.waitForIdentified({
        host: self.coordinator.sutHostPort
    }, function onIdentified(err) {
        if (err) {
            callback(err);
            return;
        }

        self.channel.request({
            serviceName: 'ringpop',
            host: self.coordinator.sutHostPort,
            timeout: 10000,
            hasNoParent: true,
            trace: false,
            headers: {
                'as': 'raw',
                'cn': 'ringpop'
            }
        }).send('/protocol/ping', null, body,
            function(err, res, arg2, arg3) {
                if (err) {
                    console.log("TChannel Response Error", err, res);
                    // callback();
                    return;
                }

                var event = new events.ResponseEvent(res, arg2, arg3, self.getHostPort());
                self.coordinator.emit('event', event);
                callback();
            }
        );        
    });
}

FakeNode.prototype.requestPingReq = function requestPingReq(target, callback, piggybackData) {
    var self = this;

    var body = JSON.stringify({
        source: self.getHostPort(),
        checksum: checksum(this.coordinator.getMembership()),
        changes: [],
        sourceIncarnationNumber: self.incarnationNumber,
        target: target,
    });

    if (piggybackData !== undefined) {
        body.changes.push(piggybackData);
    }
    
    self.channel.waitForIdentified({
        host: self.coordinator.sutHostPort
    }, function onIdentified(err) {
        if (err) {
            callback(err);
            return;
        }

        self.channel.request({
            serviceName: 'ringpop',
            host: self.coordinator.sutHostPort,
            timeout: 10000,
            hasNoParent: true,
            trace: false,
            headers: {
                'as': 'raw',
                'cn': 'ringpop'
            }
        }).send('/protocol/ping-req', null, body,
            function(err, res, arg2, arg3) {
                if (err) {
                    console.log("TChannel Response Error", err, res);
                    // callback();
                    return;
                }
                
                var event = new events.ResponseEvent(res, arg2, arg3, self.getHostPort());
                self.coordinator.emit('event', event);
                callback();
            }
        );        
    });
}

//TODO(wieger): combine requestPing, requestPingReq and requestJoin into one function

FakeNode.prototype.proxyReqHandler = function proxyReqHandler(req, res, arg2, arg3) {

};

function createLogger(name) {
    return {
        debug: function noop() {},
        info: enrich('info', 'log'),
        warn: enrich('warn', 'error'),
        error: enrich('error', 'error')
    };

    function enrich(level, method) {
        return function log() {
            var args = [].slice.call(arguments);
            args[0] = name + ' ' + level + ' ' + args[0];
            console[method].apply(console, args);
        };
    }
}

module.exports = FakeNode
