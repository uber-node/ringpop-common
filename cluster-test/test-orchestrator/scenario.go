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
	"fmt"
	"os"
)

type Scenario struct {
	Name string
	Size int
	Desc string

	Script  []Command
	Measure []Measurement
}

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

// prepare(n int)

func (s *Scenario) bootstrap(sesh Session, si *StatIngester) {
	sesh.StopAll()
	sesh.Apply()
	sesh.Start(s.Size)
	// TODO(wieger): check size
	sesh.Apply()
	si.WaitForStable(sesh.StartedHosts())
}

//TODO(wieger): split up in smaller functions
func (s *Scenario) MeasureAndReport(file string) bool {
	success := true

	results := make([]string, len(s.Measure))
	for i, m := range s.Measure {
		f, err := os.Open(file)
		if err != nil {
			panic(fmt.Sprintf("failed to open %s file, %v", err))
		}
		defer f.Close()
		s := bufio.NewScanner(f)

		r := m.Measure(s)

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
