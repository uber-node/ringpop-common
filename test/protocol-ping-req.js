
function pingReqHandler() {
	return function(req, res, arg2, arg3) {
		res.headers.as = 'raw';
		res.sendOk(null, '{"changes": []}');
	}
}

module.exports = {
	pingReqHandler: pingReqHandler,
}


// PING-REQ REQUEST (arg3)
// {
//     "checksum": 2281494811,
//     "changes": [
//         {
//             "id": "e713e71f-2299-4753-ac3a-8b296df247d3",
//             "source": "10.80.134.35:3000",
//             "sourceIncarnationNumber": 1440006862476,
//             "address": "10.80.134.35:3001",
//             "status": "suspect",
//             "incarnationNumber": 1337
//         }
//     ],
//     "source": "10.80.134.35:3000",
//     "sourceIncarnationNumber": 1440006862476,
//     "target": "10.80.134.35:3001"
// 	   },
// 	   "hostInfo": "10.80.134.35:53811",
// 	   "time": 2752
// }
