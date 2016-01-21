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

var events = require('./events');
var dsl = require('./ringpop-assert');
var test2 = require('./test-util').test2;
var prepareCluster = require('./test-util').prepareCluster;
var prepareWithStatus = require('./test-util').prepareWithStatus;
var _ = require('lodash');
var getClusterSizes = require('./it-tests').getClusterSizes;

test2('ringpop doesn\'t bump incarnation number after being piggybacked to alive', getClusterSizes(2), 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPing(t, tc, 0, 
            {sourceIx: 0, subjectIx: 'sut', status: 'alive'}),
        dsl.waitForPingResponse(t, tc, 0, 1, true),
        // check if piggyback update has no effect on incarnation number
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('ringpop bumps incarnation number after being piggybacked to suspect', getClusterSizes(2), 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPing(t, tc, 0, 
            {sourceIx: 0, subjectIx: 'sut', status: 'suspect'}),
        dsl.waitForPingResponse(t, tc, 0, 1, true),
        // check if piggyback update has taken effect
        // dsl.assertMembership(t, tc, {''})
        dsl.assertBumpedIncarnationNumber(t, tc),
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

test2('ringpop bumps incarnation number after being piggybacked to faulty', getClusterSizes(2), 20000, 
    prepareCluster(function(t, tc, n) { return [
        // do not disable node
        dsl.sendPing(t, tc, 0, 
            {sourceIx: 0, subjectIx: 'sut', status: 'faulty'}),
        dsl.waitForPingResponse(t, tc, 0, 1, true),
        // check if piggyback update has taken effect
        // dsl.assertMembership(t, tc, {''})
        dsl.assertBumpedIncarnationNumber(t, tc),
        dsl.assertStats(t, tc, n+1, 0, 0),
    ];})
);

