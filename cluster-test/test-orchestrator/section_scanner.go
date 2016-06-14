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
	"errors"
	"strings"
)

type Scanner interface {
	Scan() bool
	Text() string
	Err() error
}

type SectionScanner struct {
	Scanner
	sectionStart string
	sectionEnd   string
}

func NewSectionScanner(scanner Scanner, start, end string) (*SectionScanner, error) {
	s := &SectionScanner{
		Scanner:      scanner,
		sectionStart: start,
		sectionEnd:   end,
	}

	if start == ".." {
		return s, nil
	}

	// find section start
	for s.Scan() {
		if strings.HasPrefix(s.Text(), "label:"+s.sectionStart) {
			return s, nil
		}
	}

	return nil, errors.New("section start not found, " + start)
}

func (s *SectionScanner) Scan() bool {
	if s.Scanner.Scan() == false {
		return false
	}

	if s.sectionEnd == ".." {
		return true
	}

	if strings.HasPrefix(s.Scanner.Text(), "label:"+s.sectionEnd) {
		return false
	}

	return true
}
