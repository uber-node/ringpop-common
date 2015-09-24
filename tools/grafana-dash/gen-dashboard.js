'use strict';

var getConfig = require('zero-config');
var grafana = require('grafana-dash-gen');
var path = require('path');
var strformat = require('strformat');

var args = process.argv.slice(2);
var configDir = __dirname;
if(args.length > 0 && args[0].length > 0 && args[0][0]!='-') {
    // Use first positional argument as configDir
    configDir =  args[0];
}

var config = getConfig(configDir);

grafana.configure({
    cookie: config.get('grafana.cookie'),
    url: config.get('grafana.url')
});

function substituteVariables(vars) {
    // Iteratively subsitutes variables
    var doSubsitutePossible = function(vars) {
        var varsDone = {};
        var keys = Object.keys(vars);
        var allDone = true;
        for(var i = 0,length = keys.length; i < length; i++) {
            if(vars[keys[i]].indexOf('{') >= 0) {
                allDone = false;
            } else {
                varsDone[keys[i]] = vars[keys[i]];
            }
        }
        if(allDone) {
            return true;
        }
        for(var i = 0,length = keys.length; i < length; i++) {
            if(vars[keys[i]].indexOf('{') >= 0) {
                vars[keys[i]] = strformat(vars[keys[i]], varsDone);
            }
        }
        return false;
    }

    // We don't need to go deeper than 100, prevents circular substitution
    var i = 0;
    while(i < 100 && !doSubsitutePossible(vars)) {
        i++;
    }
}

var templateVariables = config.get('gen-dashboard.variable');
substituteVariables(templateVariables);

function getTarget(path) {
    return strformat(config.get('gen-dashboard.template.' + path),
                     templateVariables);
}

var dashboard = new grafana.Dashboard({
    title: config.get('gen-dashboard.dashboard-title')
});

function lineGraph(opts) {
    var graph = new grafana.Panels.Graph(opts);
    graph.state.fill = 0;

    return graph;
}

function createSystemRow() {
    var row = new grafana.Row();
    row.state.title = 'SYSTEM';
    row.state.showTitle = true;

    row.addPanel(lineGraph({
        title: 'Process CPU',
        span: 4,
        targets: [
            new grafana.Target(getTarget('system.process-cpu'))
                .derivative().scale(1.6666666667).removeBelowValue(0)
                .alias('percent')
        ],
        legend: {
            show: false
        }
    }));

    row.addPanel(lineGraph({
        title: 'Process RSS',
        span: 4,
        targets: [
            new grafana.Target(getTarget('system.process-rss'))
                .scale(0.000001).alias('MBs')
        ],
        legend: {
            show: false
        },
        lines: true
    }));

    row.addPanel(lineGraph({
        title: 'Process FDs',
        span: 4,
        targets: [
            new grafana.Target(getTarget('system.process-fds')).alias('total')
        ],
        legend: {
            show: false
        }
    }));

    return row;
}

function createGossipRow() {
    var row = new grafana.Row();
    row.state.title = 'GOSSIP';
    row.state.showTitle = true;

    row.addPanel(new grafana.Panels.SingleStat({
        title: 'Cluster Size',
        span: 3,
        targets: [
            new grafana.Target(getTarget('gossip.ping-send'))
                .countSeries().alias('total')
        ],
        legend: {
            show: false
        }
    }));

    row.addPanel(lineGraph({
        title: 'Ping TX/sec',
        span: 3,
        targets: [
            new grafana.Target(getTarget('gossip.ping-send'))
                .scale(0.1).alias('total')
        ],
        legend: {
            show: false
        }
    }));

    row.addPanel(lineGraph({
        title: 'Ping RX/sec',
        span: 3,
        targets: [
            new grafana.Target(getTarget('gossip.ping-recv'))
                .scale(0.1).alias('total')
        ],
        legend: {
            show: false
        }
    }));

    row.addPanel(lineGraph({
        title: 'Ping Response Times',
        span: 3,
        targets: [
            new grafana.Target(getTarget('gossip.ping-p95'))
                .averageSeries().alias('p95'),
            new grafana.Target(getTarget('gossip.ping-p99'))
                .averageSeries().alias('p99')
        ]
    }));

    row.addPanel(lineGraph({
        title: 'Ping-Req TX/sec',
        span: 3,
        targets: [
            new grafana.Target(getTarget('gossip.ping-req-send'))
                .scale(0.1).alias('total')
        ],
        legend: {
            show: false
        }
    }));

    row.addPanel(new grafana.Panels.Graph({
        title: 'Ping-Req RX/sec',
        span: 3,
        targets: [
            new grafana.Target(getTarget('gossip.ping-req-recv'))
                .sumSeries().scale(0.1).alias('total')
        ],
        legend: {
            show: false
        }
    }));

    row.addPanel(new grafana.Panels.Graph({
        title: 'Ping-Req Response Times',
        span: 3,
        targets: [
            new grafana.Target(getTarget('gossip.ping-req-p95'))
                .averageSeries().alias('p95'),
            new grafana.Target(getTarget('gossip.ping-req-p99'))
                .averageSeries().alias('p99')
        ]
    }));

    row.addPanel(new grafana.Panels.Graph({
        title: 'Protocol Frequency',
        span: 3,
        targets: [
            new grafana.Target(getTarget('gossip.protocol-freq-p99'))
        ],
        legend: {
            show: false
        }
    }));

    return row;
}

function createBootstrapRow() {
    var row = new grafana.Row();
    row.state.title = 'BOOTSTRAP';
    row.state.showTitle = true;

    row.addPanel(new grafana.Panels.Graph({
        title: 'Join Times',
        span: 12,
        targets: [
            /* eslint-disable max-len */
            new grafana.Target(getTarget('bootstrap.join-p95'))
                .percentileOfSeries(50).alias('p95')
            /* eslint-enable max-len */
        ],
        legend: {
            show: false
        }
    }));

    return row;
}

function createMembershipRow() {
    var row = new grafana.Row();
    row.state.title = 'MEMBERSHIP';
    row.state.showTitle = true;

    row.addPanel(new grafana.Panels.Graph({
        title: 'Full-syncs',
        span: 4,
        targets: [
            /* eslint-disable max-len */
            new grafana.Target(getTarget("membership.full-sync"))
                .sumSeries().alias('total')
            /* eslint-enable max-len */
        ]
    }));

    row.addPanel(lineGraph({
        title: 'Updates',
        span: 4,
        targets: [
            /* eslint-disable max-len */
            new grafana.Target(getTarget("membership.membership-update-alive"))
                .sumSeries().alias('alive').color('green'),
            new grafana.Target(getTarget("membership.membership-update-suspect"))
                .sumSeries().alias('suspect').color('yellow'),
            new grafana.Target(getTarget("membership.membership-update-faulty"))
                .sumSeries().alias('faulty').color('red')
            /* eslint-enable max-len */
        ]
    }));

    row.addPanel(new grafana.Panels.Graph({
        title: 'Checksum Compute Times',
        span: 4,
        targets: [
            /* eslint-disable max-len */
            new grafana.Target(getTarget("membership.compute-checksum-p95"))
                .averageSeries().alias('p95'),
            new grafana.Target(getTarget("membership.compute-checksum-p99"))
                .averageSeries().alias('p99'),
            new grafana.Target(getTarget("membership.compute-checksum-upper"))
                .averageSeries().alias('upper')
            /* eslint-enable max-len */
        ]
    }));

    return row;
}

function createDisseminationRow() {
    var row = new grafana.Row();
    row.state.title = 'DISSEMINATION';
    row.state.showTitle = true;

    row.addPanel(new grafana.Panels.SingleStat({
        title: 'Max Piggyback',
        span: 4,
        targets: [
            /* eslint-disable max-len */
            new grafana.Target(getTarget('dissemination.max-piggyback'))
                .maxSeries().alias('total')
            /* eslint-enable max-len */
        ]
    }));

    return row;
}

dashboard.addRow(createSystemRow());
dashboard.addRow(createBootstrapRow());
dashboard.addRow(createGossipRow());
dashboard.addRow(createMembershipRow());
dashboard.addRow(createDisseminationRow());

grafana.publish(dashboard);
