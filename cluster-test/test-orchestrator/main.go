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
	"io/ioutil"
	"log"
	"os"

	"github.com/pkg/errors"
)

var base = "172.18.24.198"

var onlyMeasure = flag.Bool("only-measure", false, "The script will not be executed and the measurement will be done on an existing file")
var testFile = flag.String("test-file", "", "The yaml file that describes the tests that will be executed")
var vcBin = flag.String("vc", "./vc", "Path to virtual-cluster binary")
var prepare = flag.Bool("prepare", false, "Prepare the virtual cluster")

func main() {
	flag.Parse()

	if *testFile == "" {
		log.Fatal("must declare test-file")
	}
	scenariosYaml, err := ioutil.ReadFile(*testFile)
	fatalWhen(err)

	scns, err := parse(scenariosYaml)
	fatalWhen(err)

	if *onlyMeasure {
		for i, scn := range scns {
			scn.MeasureAndReport(fmt.Sprintf("stats/%s-%d.stats", scn.Name, i))
		}
		return
	}

	vc := initCluster()

	_ = os.Mkdir("stats", 0777)
	for i, scn := range scns {
		si, scanner := initIngester(fmt.Sprintf("stats/%s-%d.stats", scn.Name, i))
		run(scn, vc, si)
		scanner.Close()
		scn.MeasureAndReport(fmt.Sprintf("stats/%s-%d.stats", scn.Name, i))
	}
}

func run(s *Scenario, vc *VCClient, si *StatIngester) {

	fmt.Println("NAME:", s.Name)
	fmt.Println("DESC:", s.Desc)
	fmt.Println("-", "bootstrap")
	bootstrap(s, vc, si)
	for _, cmd := range s.Script {
		fmt.Println("-", cmd.String())
		si.InsertLabel(cmd.Label, cmd.String())
		cmd.Run(vc)
		if cmd.Cmd != "sleep" {
			si.WaitForStable(vc.StartedHosts())
		}
	}
	fmt.Println()
}

func bootstrap(s *Scenario, vc *VCClient, si *StatIngester) {
	//TODO(wieger) size check
	vc.Running = make([]bool, s.Size)
	vc.Exe()

	for i := range vc.Running {
		vc.Running[i] = true
	}
	vc.Exe()

	si.WaitForStable(vc.StartedHosts())
}

func initCluster() *VCClient {
	vc := NewVCClient(*vcBin, "./testpop", []*VHost{{"146.185.179.50", 10}, {"146.185.159.202", 10}, {"146.185.176.109", 10}})
	// vc := NewVCClient(*vcBin, "./testpop", []*VHost{ /*{"localhost", 40},*/ {"wieger1", 20}, {"wieger2", 20}})

	// TODO(wieger): error handling
	if *prepare {
		vc.Reset()
		vc.Prep()
	}

	return vc
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

		green := "\033[0;32m"
		red := "\033[0;31m"
		nocol := "\033[0m"

		color := green
		err = m.Assertion.Assert(r)
		if err != nil {
			color = red
		}
		if m.Assertion == nil {
			color = nocol
		}

		results[i] = fmt.Sprintf("|%s%8v%s | %-37v|", color, r, nocol, m)

		if err != nil {
			results[i] += fmt.Sprintf(" %v", err)
			success = false
		}
	}

	// print results in a human readable way in between the commands

	// printed contains measurements that are already printed
	printed := make(map[int]struct{})

	fmt.Println("Measurements")
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

		fmt.Printf("|\033[0;36m%8s\033[0m | %-37s|\n", fmt.Sprintf("%s %s", start, end), cmd)

		hasOne := false
		for _, m := range s.Measure {
			if m.Start == start && m.End == end {
				hasOne = true
			}
		}

		if hasOne {
			fmt.Println("|---------+--------------------------------------|")
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
		fmt.Println("+---------+--------------------------------------+")
	}
	for i, m := range s.Measure {
		if _, ok := printed[i]; ok {
			continue
		}

		fmt.Printf("|\033[0;36m%8s\033[0m | %-37s|\n%s\n", m.Start+" "+m.End, "", results[i])
		fmt.Println(("+---------+--------------------------------------+"))
	}
	fmt.Println()

	return success
}
