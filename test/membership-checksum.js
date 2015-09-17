// hashing algorithm might change upon ringpop implementation
var farmhash = require('farmhash');

// entries must have address (hostport), status (e.g. "alive"), and incarnation numbers
module.exports.checksum = function checksum(members) {
    var copiedMembers = members.slice();
    var sortedMembers = copiedMembers.sort(function sort(a, b) {
        if (a.address < b.address) {
            return -1;
        } else if (a.address > b.address) {
            return 1;
        } else {
            return 0;
        }
    });

    var checksumString = '';
    for (var i = 0; i < sortedMembers.length; ++i) {
        var member = sortedMembers[i];
        checksumString += member.address +
            member.status +
            member.incarnationNumber + ';';
    }

    checksumString = checksumString.slice(0, -1)
    return farmhash.hash32(checksumString);
};
