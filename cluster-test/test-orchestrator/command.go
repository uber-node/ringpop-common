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
	"fmt"
	"strconv"
	"strings"
	"time"
)

var ringpopPort = "3000"

// Command runs command that affect the cluster in different ways. Commands are
// commenly used to form the Script field of the Scenario struct.
type Command struct {
	// Indicates when the command is run.
	Label string

	// Cmd can be one of:
	// - `cluster-kill`
	// - `cluster-start`
	// - `cluster-rolling-restart`
	// - `network-drop <SPLIT> <PERCENTAGE>`
	// - `network-delay <SPLIT> <DURATION>`
	// - `wait-for-stable`
	Cmd string

	// The arguments of the command.
	Args []string
}

// String converts a Command to a string.
func (cmd Command) String() string {
	return fmt.Sprintf("%s %s", cmd.Cmd, strings.Join(cmd.Args, " "))
}

func (cmd Command) Run(vc *VCClient) {
	switch cmd.Cmd {
	case "kill":
		//TODO(wieger): bounds check
		ixs := groupsToIndices(cmd.Args)
		for _, ix := range ixs {
			vc.Running[ix] = false
		}
		vc.Exe()

	case "start":
		//TODO(wieger): bounds check
		ixs := groupsToIndices(cmd.Args)
		for _, ix := range ixs {
			vc.Running[ix] = true
		}
		vc.Exe()

	case "rolling-restart":
		//TODO(wieger): bounds check
		batchSize, err := strconv.Atoi(cmd.Args[0])
		fatalWhen(err)

		T, err := time.ParseDuration(cmd.Args[1])
		fatalWhen(err)

		rollingRestart(vc, batchSize, T)

	case "network-drop":
		// pcnt := Args[len(Args)-1]
		//TODO(wieger): bounds check
		// pcnt, groups := validateNetworkDropArgs(Args)
		// NetworkDrop(pct, groups)

	case "sleep":
		//TODO(wieger): bounds check
		T, err := time.ParseDuration(cmd.Args[0])
		fatalWhen(err)
		time.Sleep(T)
	}
}

func rollingRestart(vc *VCClient, batchSize int, T time.Duration) {
	batches := getBatches(len(vc.Running), batchSize)

	for _, batch := range batches {
		for _, ix := range batch {
			vc.Running[ix] = false
		}
		vc.Exe()

		// simulate startup time of T
		time.Sleep(T)

		for _, ix := range batch {
			vc.Running[ix] = true
		}
		vc.Exe()
	}
}

func getBatches(n int, size int) [][]int {
	var rng []int
	for i := 0; i < n; i++ {
		rng = append(rng, i)
	}

	var batches [][]int
	for i := 0; i < n; i += size {
		j := i + size
		if j > n {
			j = n
		}
		batches = append(batches, rng[i:j])
	}
	return batches
}

func groupsToIndices(groups []string) []int {
	var result []int
	ix := 0
	for _, g := range groups {
		size, ignore := toGroupSize(g)
		if ignore {
			ix += size
			continue
		}

		for k := 0; k < size; k++ {
			result = append(result, ix+k)
		}
		ix += size
	}

	return result
}

func toGroupSize(g string) (int, bool) {
	ignore := strings.HasPrefix(g, ".")
	if ignore {
		g = g[1:]
	}
	n, ok := strconv.Atoi(g)
	if ok != nil {
		//TODO(wieger): error handling
	}
	return n, ignore
}
