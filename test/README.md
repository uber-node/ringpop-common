# ringpop integration tests

These tests can be run against any ringpop application that exposes the `/admin/*` endpoints.

## Usage

To run the tests, pass the path to a ringpop application binary:

	cd tests/
	npm install
	node ./it-tests.js ~/uber/projects/ringpop-node/main.js

## Command-line parameters

The test scripts will invoke the ringpop binary with the following command-line parameters. The application must start up and accept these parameters, otherwise the tests will fail:

* `--hosts=<file>`: Should set the path to the JSON file containing a list of bootstrap hosts. The test scripts will create this file automatically.
* `--listen=<host:port>` Should set the interface address and port that the ringpop application should listen on. The test scripts will use this address to connect via TChannel and issue requests.

## Examples

There are test binaries for included in both the [ringpop-node](https://github.com/uber/ringpop-node) and [ringpop-go](https://github.com/uber/ringpop-go) projects.

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

Install ringpop-go and build the `testpop` binary:

	go get -u github.com/uber/ringpop-go
	(cd $GOPATH/src/github.com/uber/ringpop-go/scripts/testpop &&
		go build)

Run the tests:

	node ringpop-common/test/it-tests.js $GOPATH/src/github.com/uber/ringpop-go/scripts/testpop/testpop
