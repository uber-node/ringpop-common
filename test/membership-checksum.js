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

// hashing algorithm might change upon ringpop implementation
var _ = require('lodash');
var farmhash = require('farmhash');

// entries must have address (hostport), status (e.g. "alive"), and incarnation numbers
module.exports.checksum = function checksum(members) {
    checksumString = _
        .chain(members)
        .filter(function (member) {
            // remove members that are in the tombstone state
            return ['tombstone'].indexOf(member.status) < 0;
        })
        .sortBy('address')
        .map(function (member){
            return member.address +
                member.status +
                member.incarnationNumber;
        })
        .join(';')
        .value();

    return farmhash.hash32(checksumString);
};
