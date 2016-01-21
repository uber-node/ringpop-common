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

var color = require('cli-color');
var fs = require('fs');
var util = require('util');

function safeParse(data) {
    try {
        return JSON.parse(data);
    } catch (e) {
        return null;
    }
}

function parseArg(opt) {
    var args = Array.prototype.slice.call(process.argv, 2);

    var matches = args.filter(function(arg) {
        return arg.indexOf(opt) > -1;
    });

    if (Array.isArray(matches) && matches.length) {
        return matches[0].split('=')[1];
    }
}

function lpad(num, len) {
    var ret = String(num);
    while (ret.length < len) {
        ret = '0' + ret;
    }
    return ret;
}

function makeHostPort(host, port) {
    return util.format('%s:%d', host, port);
}

function formatDate() {
    var now = new Date();
        return lpad(now.getHours(), 2) + ':' + lpad(now.getMinutes(), 2) + ':' + lpad(now.getSeconds(), 2) + '.' + lpad(now.getMilliseconds(), 3);
}

function findLocalIP(interfaces) {
    interfaces = interfaces || os.networkInterfaces();

    function getIPv4Addr(iface) {
        var addresses = interfaces[iface];

        if (!Array.isArray(addresses)) {
            return null;
        }

        for (var i = 0; i < addresses.length; i++) {
            var address = addresses[i];

            if (address.family === 'IPv4' && !address.internal) {
                return address.address;
            }
        }

        return null;
    }

    return getIPv4Addr('en0') || getIPv4Addr('eth0') || '127.0.0.1';
}

function logMsg(who, msg) {
    console.log(color.blue('[' + who + '] ') + color.yellow(formatDate()) + ' ' + msg);
}

function range(start, end) {
    var res = [];
    for (var i = start; i <= end; i++) {
        res.push(i);
    }
    return res;
}

module.exports = {
    safeParse: safeParse,
    parseArg: parseArg,
    formatDate: formatDate,
    findLocalIP: findLocalIP,
    logMsg: logMsg,
    range: range,
    makeHostPort: makeHostPort,
};
