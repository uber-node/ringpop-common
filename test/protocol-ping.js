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
};

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
