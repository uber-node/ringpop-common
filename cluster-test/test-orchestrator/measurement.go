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
	"log"
	"strings"
)

type Measurement struct {
	Start, End string
	Quantity   string
	Args       []string
	Assertion  *Assertion
}

func (m Measurement) String() string {
	strs := []string{m.Quantity}
	strs = append(strs, m.Args...)
	if m.Assertion != nil {
		strs = append(strs, m.Assertion.String())
	}
	return strings.Join(strs, " ")
}

func Measure(s Scanner, m Measurement) Value {
	// select stats section we want to to measure on
	var err error
	s, err = NewSectionScanner(s, m.Start, m.End)
	if err != nil {
		log.Fatalf("scanner init failed, ", err)
	}

	// var v Value
	switch m.Quantity {
	case "convtime":
		return StatConvergenceTime(s)
	case "checksums":
		return float64(StatChecksums(s))
	case "count":
		if len(m.Args) != 1 {
			panic(fmt.Sprintf("count expects one argument, has %v", m.Args))
		}
		statpath := m.Args[0]
		return float64(StatCount(s, statpath))
	}

	return nil
}
