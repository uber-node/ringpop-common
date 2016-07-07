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

// A SectionScanner wraps a scanner and filters out all data before the start-
// label and after the end-label, keeping only the data between the labels.
// A label indicates when what command of the script of a scenario is ran. The
// lines that look like "label:t0|cmd: kill 1"" are inserted into the ringpop
// stats.

package main

import (
	"fmt"
	"strings"
)

// Scanner is inspired on bufio.Scanner. It provides an interface that is
// commonly used in the following pattern.
//
// ```
// for s.Scan() {
//     // do something with s.Text()
// }
// if s.Err()!=nil {
//     panic(s.Err())
// }
// ```
type Scanner interface {
	Scan() bool
	Text() string
	Err() error
}

// A SectionScanner wraps a Scanner and is a Scanner that only scans between
// the given Start and End labels.
type SectionScanner struct {
	Scanner
	Start string
	End   string
}

const (
	scriptStartLabel = ".."
	scriptEndLabel   = ".."
)

// NewSectionScanner returns a Section scanner given Scanner and a start and
// end label. The scanner is progressed to the Start label and returns an
// error if that label isn't present.
func NewSectionScanner(scanner Scanner, start, end string) (*SectionScanner, error) {
	s := &SectionScanner{
		Scanner: scanner,
		Start:   start,
		End:     end,
	}

	if start == scriptStartLabel {
		return s, nil
	}

	// find section start
	for s.Scanner.Scan() {
		if strings.HasPrefix(s.Text(), "label:"+s.Start) {
			return s, nil
		}
	}

	return nil, fmt.Errorf("section start %s not found", s.Start)
}

// Scan progresses performs one scan on the wrapped Scanner. Returns whether
// the End label is reached or the wrapped Scanner is finished.
func (s *SectionScanner) Scan() bool {
	if s.Scanner.Scan() == false {
		return false
	}

	if s.End == scriptEndLabel {
		return true
	}

	if strings.HasPrefix(s.Scanner.Text(), "label:"+s.End) {
		return false
	}

	return true
}
