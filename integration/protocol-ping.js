
function handlePing(res) {
    // TODO (wieger): validate request
    res.headers.as = 'raw';
    res.sendOk(null, JSON.stringify({changes: []}));
}


function pingNotOkHandler() {
    // TODO (wieger): validate request
    console.log('pingNotOkHandler');
    res.headers.as = 'raw';
    res.sendNotOk(null, 'I am a fake node who does\'t like pings');
}

function noResponseHandler() {
    console.log('noResponseHandler');
}

module.exports = {
	handlePing: handlePing,
	pingNotOkHandler: pingNotOkHandler,
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
