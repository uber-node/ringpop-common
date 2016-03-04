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

var _ = require('lodash');
var program = require('commander');
var fs = require('fs');
var farmhash = require('farmhash');
var TestCoordinator = require('./test-coordinator');
var dsl = require('./ringpop-assert');
var programPath, programInterpreter;
var clusterSizes = [1, 2, 3, 4, 5, 6, 7, 10, 21, 25, 30];

// Global counter to record how many tests have failed.
var testFailures = 0;

var features = {
    'join': {
        mandatory: true,
        tests: [
            './join-tests'
        ]
    },
    'ping': {
        mandatory: true,
        tests: [
            './ping-tests'
        ]
    },
    'ping-req':{
        mandatory: true,
        tests: [
            './ping-req-tests'
        ]
    },
    'reincarnate': {
        mandatory: true,
        tests: [
            './incarnation-no-tests'
        ]
    },
    'gossip': {
        mandatory: true,
        tests: [
            './piggyback-tests'
        ]
    },
    'admin': {
        mandatory: true,
        tests: [
            './admin-tests'
        ]
    },

    // features implemented in only one language
    'reaping-faulty-nodes': {
        tests: [
            './reaping-faulty-nodes'
        ]
    }
};

function selectFeatures(options) {
    var only = options.only || [];
    var selectedFeatures = options.features || [];

    if (only.length > 0) {
        return function (obj, feature) {
            // add selected features
            if (only.indexOf(feature) >= 0) {
                return true;
            }
        };
    } else {
        return function (obj, feature) {
            // add selected features
            if (selectedFeatures.indexOf(feature) >= 0) {
                return true;
            }

            // always run all mandatory features
            if (obj.mandatory === true) {
                return true;
            }

            // drop other tests
            return false;
        };
    }
}

// collect is a commander helper function
function collect(val, memo) {
  memo.push(val);
  return memo;
}

function main() {
    program
        .version(require('../package.json').version)
        .option('-s, --sizes <clusterSizes>', 'Cluster sizes to test against. Default: \'' +
             JSON.stringify(clusterSizes) + '\'')
        .option('--enable-feature <feature>', 'Run tests for experimental features', collect, [])
        .option('--only <feature>', 'Run tests for experimental features', collect, [])
        .option('-i, --interpreter <interpreter>', 'Interpreter that runs program.')
        .arguments('<program>')
        .description('it-tests.js performs an integration test on a ringpop program')
        .action(function onAction(path, options) {
            programPath = path;
            if (programPath[0] !== '/') {
                programPath = './' + programPath;
            }
            programInterpreter = options.interpreter;
            if (options.sizes) {
                clusterSizes = JSON.parse(options.sizes);
            }
        });

    program.parse(process.argv);

    if (!programPath) {
        console.error('Error: program is required');
        process.exit(1);
    }

    if (!fs.existsSync(programPath)) {
        console.error('Error: program ' + programPath + ' does not exist. Check path');
        process.exit(1);
    }

    var shouldRunFeature = selectFeatures({
        features: program['enableFeature'],
        only: program['only']
    });

    _.each(features, function (obj, feature) {
        if (!shouldRunFeature(obj, feature)) {
            console.log("#: WARNING skipping test suite:", feature);
            return;
        }

        _.each(obj.tests, function (test) {
            require(test)
        });
    });
    // require('./network-blip-tests');
    // require('./revive-tests');

    // If one or more tests failed, exit with a non-zero exit code.

    if (testFailures > 0) {
        process.exit(1);
    }
}

function getProgramPath() {
    return programPath;
}

function getProgramInterpreter() {
    return programInterpreter;
}

function getClusterSizes(min) {
    if (min) {
        return _.filter(clusterSizes, function(n) { return n >= min; });
    }
    return clusterSizes;
}

// Exported function that increments the testFailures counter. Called by the
// tests when a failure occurs.
function incrementFailureCount() {
    testFailures++;
}

// ./util uses this so we want to export it before require('./util') happens somewhere
module.exports = {
    getProgramInterpreter: getProgramInterpreter,
    getProgramPath: getProgramPath,
    getClusterSizes: getClusterSizes,
    incrementFailureCount: incrementFailureCount,
};

if (require.main === module) {
    main();
}
