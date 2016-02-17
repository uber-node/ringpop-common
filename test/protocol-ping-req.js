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

function handlePingReq(req, res, pingStatus) {
	var request = safeJSONParse(req.arg3);
    res.headers.as = 'raw';
    var response = {
    	changes: [],
		pingStatus: pingStatus,
		target: request.target,
	};

	res.sendOk(null, JSON.stringify(response));
}

module.exports = {
    handlePingReq: handlePingReq,
};


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
// }

//{
//     changes: ringpop.dissemination.issueAsReceiver(source,
//         sourceIncarnationNumber, checksum),
//     pingStatus: isOk,
//     target: target
// }
