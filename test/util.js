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
