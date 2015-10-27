// Copyright (c) 2015 Uber Technologies, Inc.
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

var farmhash = require('farmhash');
var makeHostPort = require('./util').makeHostPort;
var checksum = require('./membership-checksum').checksum;

// send and handle join requests (check bottom of file for example request)

// Responding node and allNodes must have host, port, status, and incarnationNumber fields
function handleJoin(req, res, respondingNode, membershipList) {
    res.headers.as = 'raw';
    res.sendOk(null, JSON.stringify(getJoinResponsePayload(respondingNode, membershipList)));
}

// Responding node and allNodes must have host, port, status, and incarnationNumber fields
function getJoinResponsePayload(respondingNode, membershipList) {
    // add fake nodes to membership
    var responderHostPort = makeHostPort(respondingNode.host, respondingNode.port);

    var membership = membershipList.map(function(member) {
        return {
            source: responderHostPort,
            address: makeHostPort(member.host, member.port),
            status: member.status,
            incarnationNumber: member.incarnationNumber
        };
    });

    return {
        app: 'ringpop',
        coordinator:  responderHostPort,
        membershipChecksum: checksum(membership),
        membership: membership
    };
}

module.exports = {
    handleJoin: handleJoin,
    getJoinResponsePayload: getJoinResponsePayload
};


// protocol/join

// JOIN REQUEST (arg3)
// { "app": "ringpop",
// "source": "10.80.134.35.3010",
// "incarnationNumber": 12236}

// JOIN RESPONSE (arg3)
// { app: 'ringpop',
//   coordinator: '10.80.134.35:3002',
//   membership:
//    [ { source: '10.80.134.35:3002',
//        address: '10.80.134.35:3000',
//        status: 'alive',
//        incarnationNumber: 1439642728689 },
//      { source: '10.80.134.35:3002',
//        address: '10.80.134.35:3004',
//        status: 'alive',
//        incarnationNumber: 1439642728722 },
//      { source: '10.80.134.35:3002',
//        address: '10.80.134.35:3001',
//        status: 'alive',
//        incarnationNumber: 1439642728720 },
//      { source: '10.80.134.35:3002',
//        address: '10.80.134.35:3002',
//        status: 'alive',
//        incarnationNumber: 1439642728707 },
//      { source: '10.80.134.35:3002',
//        address: '10.80.134.35.3010',
//        status: 'alive',
//        incarnationNumber: 12236 },
//      { source: '10.80.134.35:3002',
//        address: '10.80.134.35:3003',
//        status: 'alive',
//        incarnationNumber: 1439642728674 } ],
//   membershipChecksum: 3982923156 }

