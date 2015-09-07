var TChannel = require('tchannel');
var safeParse = require('./util').safeParse;
var makeHostPort = require('./util').makeHostPort;
var handleJoin = require('./protocol-join').handleJoin;
var handlePing = require('./protocol-ping').handlePing;
var handlePingReq = require('./protocol-ping-req').handlePingReq;

function FakeNode(options) {
	this.coordinator = options.coordinator;
    this.host = options.host;
    this.port = undefined; // set at listen time
    this.journal = this.coordinator.getJournal();
	this.tchannel = new TChannel();
	this.channel = this.tchannel.makeSubChannel({
        serviceName: 'ringpop'
    });

    this.endpoints = {
        join: {
            path: '/protocol/join',
            handler: this.joinHandler.bind(this)
        },
        ping: {
            path: '/protocol/ping',
            handler: this.pingHandler.bind(this)
        },
        pingReq: {
            path: '/protocol/ping-req',
            handler: this.pingReqHandler.bind(this)
        },
        proxyReq: {
            path: '/proxy/req',
            handler: this.proxyReqHandler.bind(this)
        }
    };

    this._registerEndpoints();
}

FakeNode.prototype.start = function start(callback) {
    var self = this;

    self.channel.listen(0, self.host, function onListen() {
        self.port = self.channel.address().port;
        return callback();
    })
};

FakeNode.prototype.getHostPort = function getHostPort() {
    return makeHostPort(this.host, this.port);
};

FakeNode.prototype._registerEndpoints = function _registerEndpoints() {
    var self = this;

    Object.keys(self.endpoints).forEach(function register(endpointType) {
        var path = self.endpoints[endpointType].path;

        self.channel.register(path, function handleRequest(req, res, arg2, arg3) {
            var event = self.journal.recordRequest(req, arg2, arg3);
            self.coordinator.emit('event', event);
            self.endpoints[endpointType].handler(req, res, arg2, arg3);
        });
    });
};

FakeNode.prototype.shutdown = function shutdown() {
    this.tchannel.close();
};

FakeNode.prototype.toMemberInfo = function toMemberInfo() {
    return {
        host: this.host,
        port: this.port,
        status: 'alive',
        incarnationNumber: 1337
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
    return handlePingReq(req);
};

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
