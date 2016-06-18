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
	"bufio"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"

	"github.com/pkg/errors"
)

var base = "192.168.2.3"

var onlyMeasure = flag.Bool("only-measure", false, "The script will not be executed and the measurement will be done on an existing file")

func main() {
	flag.Parse()

	si := NewStatIngester()
	scanner, err := NewUDPScanner("3300")
	if err != nil {
		log.Fatal("can't startup udp scanner")
	}

	go si.IngestStats("file-name.stats", scanner)

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
	scns, err := parseScenarios([]byte(scenariosYaml))
	if err != nil {
		log.Fatalf(err.Error())
	}

	if !*onlyMeasure {
		cmd := tickcluster()
		cmd.Start()
		scns[0].run(sesh, si)
		cmd.Process.Signal(os.Interrupt)
		cmd.Wait()
	}
	scns[0].MeasureAndReport("file-name.stats")
}

// tickcluster spins up a tickcluster in the background.
func tickcluster() *exec.Cmd {
	return exec.Command(
		"/Users/wiegersteggerda/code/ringpop-common/tools/tick-cluster.js",
		"/Users/wiegersteggerda/go/src/github.com/uber/ringpop-go/scripts/testpop/testpop",
		"-n", "10",
		"--stats-udp=127.0.0.1:3300",
	)
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
    - .. t0 count membership-set.alive in (10*10,99999)

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
    - [ 40,   2, "20 20"]
    - [120,   2, "60 60"]
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

func (s *Scenario) run(sesh Session, si *StatIngester) {
	s.bootstrap(sesh, si)

	for _, cmd := range s.Script {
		// TODO(wieger): insert label to stats
		fmt.Println(cmd.String())
		si.InsertLabel(cmd.Label, cmd.String())

		// cmd.Run(sesh)
		si.WaitForStable(sesh.StartedHosts())
	}

	sesh.StopAll()
	sesh.Apply()
}

func (s *Scenario) bootstrap(sesh Session, si *StatIngester) {
	sesh.StopAll()
	sesh.Apply()
	sesh.Start(s.Size)
	// TODO(wieger): check size
	sesh.Apply()
	si.WaitForStable(sesh.StartedHosts())
}

// MeasureAndReport runs the measurements of the scenario on a file containing
// the stats that the cluster has emitted. The results are reported to the
// stdout. The function returns whether all the assertions in the measurements
// have passed.
func (s *Scenario) MeasureAndReport(file string) bool {
	//TODO(wieger): split up in smaller functions
	success := true

	results := make([]string, len(s.Measure))
	for i, m := range s.Measure {
		f, err := os.Open(file)
		if err != nil {
			panic(fmt.Sprintf("failed to open %s file, %v", err))
		}
		defer f.Close()
		scanner := bufio.NewScanner(f)

		r, err := m.Measure(scanner)
		if err != nil {
			err := errors.Wrapf(err, "failed to measure %s on scenario %s", m, s.Name)
			log.Fatalf(err.Error())
		}

		results[i] = fmt.Sprintf("|%8v | %-37v|", r, m)

		err = m.Assertion.Assert(r)
		if err != nil {
			results[i] += fmt.Sprintf(" FAILED %v", err)
			success = false
		}
	}

	// print results in a human readable way in between the commands

	// measurements that are printed between two commands
	printed := make(map[int]struct{})

	for i := -1; i < len(s.Script); i++ {
		if len(s.Script) == 0 && i == 0 {
			break
		}
		start := ".."
		if i > -1 {
			start = s.Script[i].Label

			s := fmt.Sprintf("|%8s | %-37s|", start, s.Script[i].String())

			fmt.Println("+---------+--------------------------------------+")
			fmt.Println()
			fmt.Println("+---------+--------------------------------------+")
			fmt.Println(s)
			fmt.Println("|---------+--------------------------------------|")
		} else {
			fmt.Println("+---------+--------------------------------------+")
			fmt.Println("|      .. | bootstrap                            |")
			fmt.Println("|---------+--------------------------------------|")
		}

		end := ".."
		if i+1 < len(s.Script) {
			end = s.Script[i+1].Label
		}

		for i, m := range s.Measure {
			if m.Start == start && m.End == end {
				fmt.Println(results[i])
				printed[i] = struct{}{}
			}
		}
	}
	fmt.Println(("+---------+--------------------------------------+"))

	// Print all measurements that have not yet been printed.
	if len(printed) < len(s.Measure) {
		fmt.Println()
		fmt.Println("Extra Measurements")
		fmt.Println(("+---------+--------------------------------------+"))
	}
	for i, m := range s.Measure {
		if _, ok := printed[i]; ok {
			continue
		}

		fmt.Printf("|%8s | %-37s|\n%s\n", m.Start+" "+m.End, "", results[i])
	}
	if len(printed) < len(s.Measure) {
		fmt.Println(("+---------+--------------------------------------+"))
	}

	return success
}

// TODO(wieger): implement the execution of commands
func (cmd *Command) Run(s Session) {
	// TODO(wieger): implement
	log.Fatal("run not implemented")
}
