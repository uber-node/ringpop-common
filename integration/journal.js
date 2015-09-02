var events = require('./events');
var _ = require('underscore');

function Journal() {
    this.events = [];
    this.waiters = {};
}

Journal.prototype._record = function _record(event) {
    this.events.push(event);

    var waiter = this.waiters[event.type];
    if (waiter) {
        setImmediate(waiter.bind(undefined, event));
    }
};

Journal.prototype.recordRequest = function recordRequest(req, arg2, arg3) {
    this._record(new events.createRequestEvent(req, arg2, arg3));
};

Journal.prototype.findEventsOfType = function findEventsOfType(type) {
    return this.events.filter(function checkForMatch(event) {
        return event.type === type;
    });
};

Journal.prototype.waitForEvent = function waitForEvent(type, deadline, callback) {
    var self = this;
    var present = self.findEventsOfType(type);

    if (present.length > 0) {
        return callback(present[0]);
    }

    var callbackOnce = _.once(callback);
    self.waiters[type] = callbackOnce;
    setTimeout(callbackOnce, deadline);
};

module.exports = Journal;