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

	"github.com/pkg/errors"
)

var base = "172.18.24.198"

var onlyMeasure = flag.Bool("only-measure", false, "The script will not be executed and the measurement will be done on an existing file")
var vcBin = flag.String("vc", "./vc", "Path to virtual-cluster binary")

func main() {
	flag.Parse()

	scns, err := parse([]byte(scenariosYaml))
	fatalWhen(err)

	if *onlyMeasure {
		for i, scn := range scns {
			scn.MeasureAndReport(fmt.Sprintf("stats/%s-%d.stats", scn.Name, i))
		}
		return
	}

	sesh := initCluster()

	_ = os.Mkdir("stats", 0700)
	for i, scn := range scns {
		si, scanner := initIngester(fmt.Sprintf("stats/%s-%d.stats", scn.Name, i))
		run(scn, sesh, si)
		scanner.Close()
		scn.MeasureAndReport(fmt.Sprintf("stats/%s-%d.stats", scn.Name, i))
	}
}

func run(s *Scenario, sesh *Session, si *StatIngester) {
	fmt.Println("BOOTSTRAP")
	bootstrap(s, sesh, si)
	fmt.Println("SCRIPT")
	for _, cmd := range s.Script {
		fmt.Println(cmd.String())
		si.InsertLabel(cmd.Label, cmd.String())
		cmd.Run(sesh)
		if cmd.Cmd != "sleep" {
			si.WaitForStable(sesh.StartedHosts())
		}
	}
	fmt.Println()
}

func bootstrap(s *Scenario, sesh *Session, si *StatIngester) {
	sesh.StopAll()
	sesh.Apply()
	sesh.Start(s.Size)
	// TODO(wieger): check size
	sesh.Apply()
	si.WaitForStable(sesh.StartedHosts())
}

func initCluster() *Session {
	sesh, err := NewSession(*vcBin, nil)
	fatalWhen(err)

	// TODO(wieger): uncomment
	// sesh.Prepare()

	return sesh
}

func initIngester(file string) (*StatIngester, *UDPScanner) {
	f, err := os.Create(file)
	if err != nil {
		log.Fatal(err)
	}

	si := NewStatIngester(f)
	scanner, err := NewUDPScanner("3300")
	fatalWhen(err)

	go si.IngestStats(scanner)

	return si, scanner
}

func fatalWhen(err error) {
	if err != nil {
		log.Fatalln(err)
	}
}

// tickcluster spins up a tickcluster in the background.
// func tickcluster() *exec.Cmd {
// 	return exec.Command(
// 		"/Users/wiegersteggerda/code/ringpop-common/tools/tick-cluster.js",
// 		"/Users/wiegersteggerda/go/src/github.com/uber/ringpop-go/scripts/testpop/testpop",
// 		"-n", "10",
// 		"--stats-udp=127.0.0.1:3300",
// 	)
// }

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
			log.Fatalln(fmt.Sprintf("failed to open %s file, %v", err))
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
			results[i] += fmt.Sprintf(" %v", err)
			success = false
		}
	}

	// print results in a human readable way in between the commands

	// printed contains measurements that are already printed
	printed := make(map[int]struct{})

	fmt.Println("NAME:", s.Name)
	fmt.Println("DESC:", s.Desc)
	for i := -1; i < len(s.Script); i++ {
		if len(s.Script) == 0 && i == 0 {
			break
		}
		start := ".."
		if i > -1 {
			start = s.Script[i].Label
		}

		end := ".."
		if i+1 < len(s.Script) {
			end = s.Script[i+1].Label
		}

		fmt.Println("+---------+--------------------------------------+")
		cmd := "bootstrap"
		if i > -1 {
			cmd = s.Script[i].String()
		}
		fmt.Printf("|%8s | %-37s|\n", fmt.Sprintf("%s %s", start, end), cmd)
		fmt.Println("|---------+--------------------------------------|")

		hasOne := false
		for i, m := range s.Measure {
			if m.Start == start && m.End == end {
				fmt.Println(results[i])
				printed[i] = struct{}{}
				hasOne = true
			}
		}

		if hasOne {
			fmt.Println("+---------+--------------------------------------+")
			fmt.Println()
		}

	}

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
		fmt.Println(("+---------+--------------------------------------+"))
	}
	fmt.Println()

	return success
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
    - name: bootstrap
      size: <N>
      desc: startup <N> nodes at the same time and wait for bootstrap

      script:
      # on the start of every script the nodes will be bootstrapped,
      # therefore, we can leave the script empty  for this scenario.

      measure:
      # Use ".. .." to indicate from start to end simulation
      - .. .. convtime in (1s,10s)
      - .. .. checksums is 1
      - .. .. count full-sync is 0
      - .. .. count membership-set.alive

      runs:
      - [<N>]
      - [10 ]
      - [20 ]
      - [30 ]

    # Scenario 2
    - name: kill one node
      size: <N>
      desc: Kill one node in a cluster of <N> nodes.

      script:
      - t0: kill 1
      - t1: wait-for-stable
      - t2: start 1

      measure:
      - t0 t1 convtime in (0s,3s)
      - t0 t1 checksums is 1
      - t0 t1 count membership-set.suspect is <N>-1

      - t1 t2 convtime in (0s,3s)
      - t1 t2 checksums is 1
      - t1 t2 count membership-set.faulty is <N>-1

      - t2 .. convtime in (0s,6s)
      - t2 .. checksums is 1
      - t2 .. count membership-set.alive is <N> + <N>-1

      - .. .. count full-sync is 0

      runs:
      - [<N>]
      - [10 ]
      - [20 ]
      - [30 ]


    # Scenario 3
    - name: kill and revive
      size: <N>
      desc: kill and revive <P> nodes of a <N>-node cluster

      script:
      - t0: kill <P>     # waits for alive to suspect or faulty
      - t1: sleep 10s     # waits 5 seconds to be sure that all nodes are faulty
      - t2: start <P>

      measure:
      - t0 t2 count ping-req.send in (1,123)
      - t0 t2 count membership-set.suspect is <P>*(<N>-<P>)
      - t0 t2 count membership-set.faulty is <P>*(<N>-<P>)
      - t0 t2 convtime in (0s,10s)

      - t2 .. convtime in (200ms,3s)
      - t2 .. count membership-set.alive is <P>*<N> + (<N>-<P>)*<P>

      - t0 .. count full-sync is 0
      - t0 .. count ring.changed is 0

      runs:
      - [<N>, <P>]
      - [30, 3] #10%
      - [30, 10] #30%
      - [30, 15] #50%


    # Scenario 4
    - name: rolling restart
      size: <N>
      desc: Do a rolling restart in a cluster <N> nodes.

      script:
      - t0: rolling-restart <B> <T>

      measure:
      - t0 .. count server.removed is <FAULTIES>
      - t0 .. count membership-set.faulty is <FAULTIES>
      - t0 .. checksums is 1

      runs:
      - [<N>, <B>, <T>, <FAULTIES>]
      - [ 10,   2,  3s, 0]
      - [ 10,   2,  6s, 90]

`
