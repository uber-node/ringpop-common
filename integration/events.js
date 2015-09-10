var Types = {
    Join: 'Join',
    Ping: 'Ping',
    PingReq: 'PingReq',
    ProxyReq: 'ProxyReq',
    UnknownRequest: 'UnknownRequest',
    Stats: 'Stats'
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
        default:
            return Types.UnknownRequest;
    }
}

function createRequestEvent(req, arg2, arg3) {
    this.type = endpointToEventType(req.endpoint);
    this.direction = 'request';
    this.endpoint = req.endpoint;
    this.time = Date.now();
    this.req = req;
    this.arg2 = arg2;
    this.arg3 = arg3;
}

function createResponseEvent(res, arg2, arg3) {
    // console.log(res, arg2, require('./util').safeParse(arg3));
    this.type = endpointToEventType(res.span.name);
    this.direction = 'response';
    this.endpoint = res.span.name;
    this.time = Date.now();
    this.res = res;
    this.arg2 = arg2;
    this.arg3 = arg3;
}

module.exports = {
    Types: Types,
    createRequestEvent: createRequestEvent,
    createResponseEvent: createResponseEvent
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