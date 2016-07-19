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
	"strings"

	"github.com/pkg/errors"
)

// Value should ever be either a float64 or a time.Duration.
type Value interface{}

// A Measurement generates a Value which can be either a duration or a number
// from ringpop stats. The Measurement can count stat occurrences, analyze
// convergence time, and analyze membership checksum convergence.
//
// The Measurement also carries an assertion that determines whether the
// measured Value is as expected.
type Measurement struct {
	// Selects a window of the stats that we want to measure
	// the values should be equal to one of the Labels in the
	// Commands of the script.
	Start, End string

	// One of count, convtime or checksums.
	Quantity string

	// Currently only count accepts an argument, which is the statpath of
	// the stats we want to count.
	Args []string

	// The expected result of this measurement.
	Assertion *Assertion
}

// String converts the Measurement into a string.
func (m *Measurement) String() string {
	strs := []string{m.Quantity}
	strs = append(strs, m.Args...)
	if m.Assertion != nil {
		strs = append(strs, m.Assertion.String())
	}
	return strings.Join(strs, " ")
}

// Measure performs the measurement and returns the resulting value on stats
// that are extracted from the given Scanner.
func (m *Measurement) Measure(s Scanner) (Value, error) {
	// select stats window we want to to measure on
	var err error
	s, err = NewSectionScanner(s, m.Start, m.End)
	if err != nil {
		return nil, errors.Wrapf(err, "measure %s\n", m)
	}
	switch m.Quantity {
	case "convtime":
		convtime, err := ConvergenceTimeAnalysis(s)
		if err != nil {
			return nil, errors.Wrapf(err, "measure %s\n", m)
		}
		return convtime, nil
	case "checksums":
		csums, err := ChecksumsAnalysis(s, false)
		if err != nil {
			return nil, errors.Wrapf(err, "measure %s\n", m)
		}
		return float64(csums), nil
	case "ring-checksums":
		csums, err := ChecksumsAnalysis(s, true)
		if err != nil {
			return nil, errors.Wrapf(err, "measure %s\n", m)
		}
		return float64(csums), nil
	case "count":
		if len(m.Args) != 1 {
			msg := fmt.Sprintf("count expects one argument, has %v", m.Args)
			return nil, errors.New(msg)
		}
		statpath := m.Args[0]
		count, err := CountAnalysis(s, statpath)
		if err != nil {
			return nil, errors.Wrapf(err, "measure %s\n", m)
		}
		return float64(count), nil
	}

	msg := fmt.Sprintf("no such quantity: %s", m.Quantity)
	return nil, errors.New(msg)
}
