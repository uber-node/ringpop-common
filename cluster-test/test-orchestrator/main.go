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

package main

import (
	"flag"
	"fmt"
	"os"
)

var onlyMeasure = flag.Bool("only-measure", false, "The script will not be executed and the measurement will be done on an existing file")

func main() {
	flag.Parse()

	si := NewStatIngester()
	si.Listen("file-name.stats", "3300")

	base := "172.18.24.220"
	var hosts []string
	for p := 3000; p < 3010; p++ {
		hosts = append(hosts, fmt.Sprintf("%s:%d", base, p))
	}

	// MAKE TMP SESSION
	sesh := Session(make(map[interface{}]SessionHost))
	h1 := SessionHost{}
	for _, host := range hosts {
		h1.VHosts = append(h1.VHosts, &SessionVHost{
			Iface: host,
		})

	}
	sesh["host1"] = h1

	// GET SCENARIOS
	scns := toScenarios([]byte(scenariosYaml))
	for _, s := range scns {
		if !*onlyMeasure {
			cmd := tickcluster()
			cmd.Start()
			s.run(sesh, si)
			cmd.Process.Signal(os.Interrupt)
			cmd.Wait()
		}
		s.MeasureAndReport("file-name.stats")
	}
}

var scenariosYaml = `
config:
  network: 10.0.0.0/16
  hosts:
    appdocker22-sjc1:
      capacity: 400
    appdocker19-sjc1:
      capacity: 400
    appdocker325-sjc1:
      capacity: 400
    appdocker641-sjc1:
      capacity: 400

scenarios:
  # Scenario 1
  - name: partition heal
    size: <N>
    desc: partition a cluster of size <N> in a <SPLIT> split.

    script:
    - t0: kill 1
    - t1: wait-for-stable

    measure:
    - .. t0 convtime in (0s,3s)
    - .. t0 checksums is 1

    - t0 t1 convtime in (0s,3s)
    - t0 t1 checksums is 1
    - t0 t1 count membership-set.suspect is 9

    - t1 .. convtime in (0s,3s)
    - t1 .. checksums is 1
    - t1 .. count membership-set.faulty is 9

    - .. .. count full-sync is 0


    runs:
    - [<N>, <C>, <SPLIT>]
    - [ 10,   2, "5 5"]
#    - [ 40,   2, "20 20"]
#    - [120,   2, "60 60"]
#    - [120,   2, "110 10"]
#    - [120,   2, "90 30"]
#    - [120,   3, "40 40 40"]
#    - [ 40,   4, "10 10 10 10"]
#    - [120,   5, "24 24 24 24 24"]
#    - [120,   6, "20 20 20 20 20 20"]
`

// var data = `
// config:
//   network: 10.0.0.0/16
//   hosts:
//     appdocker22-sjc1:
//       capacity: 400
//     appdocker19-sjc1:
//       capacity: 400
//     appdocker325-sjc1:
//       capacity: 400
//     appdocker641-sjc1:
//       capacity: 400

// scenarios:
//   # Scenario 1
//   - name: partition heal
//     size: <N>
//     desc: partition a cluster of size <N> in a <SPLIT> split.

//     script:
//     - t0: network <SPLIT> drop 100%
//     - t1: network recover

//     measure:
//     - t0 t1 convtime in (1s,3s)
//     - t0 t1 checksums is 2
//     - t0 t1 count membership-update.suspect is 2*<N>-1
//     - t0 t1 count full-sync is 0
//     - t1 .. convtime in (0s,180s)
//     - t1 .. checksums is 2
//     - t1 .. count full-sync is 0

//     runs:
//     - [<N>, <C>, <SPLIT>]
//     - [ 10,   2, "5 5"]
//     - [ 40,   2, "20 20"]
//     - [120,   2, "60 60"]
// #    - [120,   2, "110 10"]
// #    - [120,   2, "90 30"]
// #    - [120,   3, "40 40 40"]
// #    - [ 40,   4, "10 10 10 10"]
// #    - [120,   5, "24 24 24 24 24"]
// #    - [120,   6, "20 20 20 20 20 20"]
// `
