
function pingHandler() {
    return function(req, res, arg2, arg3) {
        // TODO (wieger): validate request
        res.headers.as = 'raw';
        res.sendOk(null, '{"changes": []}');
    }
}


function pingNotOkHandler() {
    return function(req, res, arg2, arg3) {
        // TODO (wieger): validate request
        res.headers.as = 'raw';
        res.sendNotOk(null, 'I am a fake node who does\'t like pings');
    }
}


module.exports = {
	pingHandler: pingHandler,
	pingNotOkHandler: pingNotOkHandler
}

// PING REQUEST
// just call the endpoint (empty arg3)

// PING RESPONSE (arg3)
// { changes: [] }
// 
// where changes is array of these:
// { source: '10.80.134.35:3000',
//   address: '10.80.134.35:3006',
//   status: 'alive',
//   incarnationNumber: 1337 }
