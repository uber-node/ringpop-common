# ringpop integration tests

These tests can be run against any ringpop application that exposes the `/admin/*` endpoints and command-line parameters specified below.

The ringpop-node and ringpop-go projects provide test executables that are compatible out-of-the-box. See the *Examples* section below for instructions on how to run the integration tests against those codebases.

## Usage

it-tests.js performs an integration test on a ringpop program
```
  Usage: it-tests [options] <program>

  Options:
    -h, --help                       output usage information
    -V, --version                    output the version number
    -s, --sizes <clusterSizes>       Cluster sizes to test against. Default: '[1,2,3,4,5,6,7,10,21,25,30]'
    -i, --interpreter <interpreter>  Interpreter that runs program.
```

To run the tests, pass the path to a ringpop application executable:

	cd tests/
	npm install
	node ./it-tests.js -i node ~/uber/projects/ringpop-node/main.js

## Command-line parameters

The test scripts will invoke the ringpop executable with the following command-line parameters. The application must start up and accept these parameters, otherwise the tests will fail:

* `--hosts=<file>`: Should set the path to the JSON file containing a list of bootstrap hosts. The test scripts will create this file automatically.
* `--listen=<host:port>` Should set the interface address and port that the ringpop application should listen on. The test scripts will use this address to connect via TChannel and issue requests.

## Examples

There are test executables for included in both the [ringpop-node](https://github.com/uber/ringpop-node) and [ringpop-go](https://github.com/uber/ringpop-go) projects.

### Running integration tests against ringpop-node

Clone and install dependencies for tests in ringpop-common:

	git clone git@github.com:uber/ringpop-common.git
	(cd ringpop-common/test && npm install)

Clone and install dependencies for ringpop-node:

	git clone git@github.com:uber/ringpop-node.git
	(cd ringpop-node && npm install)

Run the tests:

	node ringpop-common/test/it-tests.js ringpop-node/main.js

### Running integration tests against ringpop-go:

Clone and install dependencies for tests in ringpop-common:

	git clone git@github.com:uber/ringpop-common.git
	(cd ringpop-common/test && npm install)

Install ringpop-go and build the `testpop` executable:

	go get -u github.com/uber/ringpop-go
	(cd $GOPATH/src/github.com/uber/ringpop-go && make testpop)

Run the tests:

	node ringpop-common/test/it-tests.js $GOPATH/src/github.com/uber/ringpop-go/testpop

# Understanding the integration tests

This is a written summary of a one-hour workshop of digging into the integration tests and asking questions from the people who implemented it. As of now, it might be out of date (we will try to keep it up to date though), but the text below can give a good starting point while trying to wrap your head around.

## Glossary

*Slanted names* mean general concepts, names in `monospace` common variable names.

* *SUT*: Subject Under Test. Also referred to as "the real node".
* *testpop*: very basic application using ringpop. Commonly used by
  tick-cluster. It also acts as the SUT for the integration test.
* `t`: test object. Instance of `tap`.
* `tc`: test coordinator. The thing that runs and controls testpop, SUT and
  fake nodes. Handles coordination between the fake and real nodes.
* `n` : size of the cluster.
* `ns`: list of cluster sizes. Treat it like *plural n* -- *ns*.
* `nodeIx`: node index. Any variable that ends with `Ix` is an index variable.
* `cb`: callback.

## High-level overview

Tests are usually composed of a *Real Node* (*SUT*) and a number of fake nodes. The real node is the actual ringpop instance (`testpop`), and the fake nodes are the test harness.

The test harness (fake nodes) send messages to the real node, and listen on what SUTS sends back. The test harness then asserts whether whatever the SUT is sending back matches expectations. With this black-box structure, tests are verifying the node behaves as expected given certain messages. Therefore, this test harness is used to measure feature parity between different ringpop implementations.

Here's what it looks like in the code:

1. SUT is initialized (responsible by the function `test2` in `test-utils.js`).
2. User callback is executed, which returns a list of closures. See documentation of `test-utils.test2()`.
3. Every closure is executed with a list of messages from the SUT. See documentation of `ringpop-assert.validate()`.
4. The closure either succeeds by calling a callback, or fails by calling a well-documented function in `t`.
