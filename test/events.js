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
    AdminLookup: 'AdminLookup'
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
}



// function getEventType(event) {
//     if(event.direction == 'request') {
//         switch(event.endpoint) {
//             case '/protocol/join':
//                 return Types.Join;
//             case '/protocol/ping':
//                 return Types.Ping;
//             case '/protocol/ping-req':
//                 return Types.PingReq;
//             case '/proxy/req':
//                 return Types.ProxyReq;
//             default:
//                 return Types.UnknownRequest;
//         }
//     }

//     if(event.direction == 'response') {
//         switch(event.endpoint) {        
//             case '/protocol/join':
//                 return Types.JoinResponse;
//             case '/protocol/ping':
//                 return Types.PingResponse;
//             case '/protocol/ping-req':
//                 return Types.PingReqResponse;
//             // case '/proxy/req':
//             //     return Types.ProxyReq;
//             case '/admin/stats':
//                 return Types.StatsResponse;
//             default:
//                 return Types.UnknownRequest;
//         }
//     }
// }