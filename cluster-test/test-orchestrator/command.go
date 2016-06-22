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

func (cmd Command) Run(sesh *Session) {
	switch cmd.Cmd {
	case "kill":
		//TODO(wieger): bounds check
		n, err := strconv.Atoi(cmd.Args[0])
		fatalWhen(err)
		sesh.Stop(n)
		sesh.Apply()
	case "start":
		//TODO(wieger): bounds check
		n, err := strconv.Atoi(cmd.Args[0])
		fatalWhen(err)
		sesh.Start(n)
		sesh.Apply()
	case "rolling-restart":
		//TODO(wieger): bounds check
		bsize, err := strconv.Atoi(cmd.Args[0])
		fatalWhen(err)

		T, err := time.ParseDuration(cmd.Args[1])
		fatalWhen(err)

		var running []int
		ix := 0
		for _, h := range sesh.Object {
			for _, vh := range h.VHosts {
				if vh.Running {
					running = append(running, ix)
				}
				ix++
			}
		}

		for len(running) > 0 {
			size := bsize
			if size > len(running) {
				size = len(running)
			}
			batch := running[:size]
			running = running[size:]

			for _, ix := range batch {
				StopAt(sesh, ix)
			}
			sesh.Apply()
			time.Sleep(T)

			for _, ix := range batch {
				StartAt(sesh, ix)
			}
			sesh.Apply()
		}
	case "sleep":
		//TODO(wieger): bounds check
		T, err := time.ParseDuration(cmd.Args[0])
		fatalWhen(err)
		time.Sleep(T)
	}
}

func StopAt(sesh *Session, ix int) {
	for _, h := range sesh.Object {
		for _, vh := range h.VHosts {
			if ix == 0 {
				vh.Running = false
				return
			}
			ix--
		}
	}
}

func StartAt(sesh *Session, ix int) {
	for _, h := range sesh.Object {
		for _, vh := range h.VHosts {
			if ix == 0 {
				vh.Running = true
				return
			}
			ix--
		}
	}
}
