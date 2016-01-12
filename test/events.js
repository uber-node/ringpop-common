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

var safeJSONParse = require('./util').safeParse;

var Types = {
    Join: 'Join',
    Ping: 'Ping',
    PingReq: 'PingReq',
    ProxyReq: 'ProxyReq',
    UnknownRequest: 'UnknownRequest',
    Stats: 'Stats',
    AdminGossipStart: 'AdminGossipStart',
    AdminGossipStop: 'AdminGossipStop',
    AdminGossipTick: 'AdminGossipTick',
    AdminLookup: 'AdminLookup',
    AdminMemberLeave: 'AdminMemberLeave',
    AdminMemberJoin: 'AdminMemberJoin'
};

function endpointToEventType(endpoint) {
    switch(endpoint) {
        case '/protocol/join':
            return Types.Join;
        case '/protocol/ping':
            return Types.Ping;
        case '/protocol/ping-req':
            return Types.PingReq;
        case '/proxy/req':
            return Types.ProxyReq;
        case '/admin/stats':
            return Types.Stats;
        case '/admin/gossip/start':
            return Types.AdminGossipStart;
        case '/admin/gossip/stop':
            return Types.AdminGossipStop;
        case '/admin/gossip/tick':
            return Types.AdminGossipTick;
        case '/admin/lookup':
            return Types.AdminLookup;
        case '/admin/member/leave':
            return Types.AdminMemberLeave;
        case '/admin/member/join':
            return Types.AdminMemberJoin;
        default:
            return Types.UnknownRequest;
    }
}

function RequestEvent(req, arg2, arg3, receiver) {
    this.type = endpointToEventType(req.endpoint);
    this.direction = 'request';
    this.endpoint = req.endpoint;
    this.time = Date.now();
    this.receiver = receiver;
    this.req = req;
    this.arg2 = arg2;
    this.arg3 = arg3;

    this.head = safeJSONParse(arg2);
    this.body = safeJSONParse(arg3);
}

function ResponseEvent(res, arg2, arg3, receiver) {
    this.type = endpointToEventType(res.span.name);
    this.direction = 'response';
    this.endpoint = res.span.name;
    this.time = Date.now();
    this.receiver = receiver;
    this.res = res;
    this.arg2 = arg2;
    this.arg3 = arg3;

    this.head = safeJSONParse(arg2);
    this.body = safeJSONParse(arg3);
}

module.exports = {
    Types: Types,
    RequestEvent: RequestEvent,
    ResponseEvent: ResponseEvent
};
